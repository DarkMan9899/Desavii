/**
 * Calendar Excellence —
 *
 * 1. A Partner edits a manual block (`PATCH /availability/blocks/:id`): the
 *    old dates are given back and the new ones taken in one transaction; an
 *    edit that no longer fits is refused and the block stays exactly as it
 *    was; a released block cannot be edited.
 * 2. Every date range a request reads or writes per date is capped at a year
 *    (`DATE_SPAN_TOO_LONG`), so no single request can hold a transaction and
 *    its row locks open for a decade of dates.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const CAPACITY = 2;
// One day past the cap: from day 0 to day 367.
const TOO_LONG = 367;

let vendor;
let customer;
let partnerId;
let languageId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

const as = (principal, req) =>
  req.set('Authorization', `Bearer ${principal.accessToken}`);

async function createUnit(title) {
  const listing = await as(vendor, request(app).post('/api/v1/listings')).send({
    partnerId,
    listingType: 'HOTEL',
    translations: [{ languageId, title: `${title} ${Date.now()}` }],
  });
  const unit = await as(
    vendor,
    request(app).post('/api/v1/availability/units'),
  ).send({
    listingId: listing.body.data.id,
    bookableUnitType: 'HOTEL_ROOM',
    capacity: CAPACITY,
  });
  return unit.body.data.id;
}

async function breakdown(unitId, from, to) {
  const res = await as(
    vendor,
    request(app).get(`/api/v1/availability/units/${unitId}/breakdown`),
  ).query({ from, to });
  return Object.fromEntries(
    res.body.data.map((row) => [row.date, { available: row.available }]),
  );
}

function block(unitId, fields) {
  return as(vendor, request(app).post('/api/v1/availability/blocks')).send({
    unitId,
    reasonCode: 'MAINTENANCE',
    ...fields,
  });
}

function editBlock(id, fields, principal = vendor) {
  return as(
    principal,
    request(app).patch(`/api/v1/availability/blocks/${id}`),
  ).send({ reasonCode: 'MAINTENANCE', ...fields });
}

const issuesOf = (res) =>
  (res.body.error?.details ?? []).map(
    (detail) => `${detail.field}:${detail.issue}`,
  );

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );
  const pool = getMysqlPool();
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('PATCH /availability/blocks/:id', () => {
  test('moving and resizing a block gives the old nights back and takes the new ones', async () => {
    const unitId = await createUnit('Block edit move');
    const created = await block(unitId, {
      dateFrom: day(10),
      dateTo: day(12),
      quantity: 1,
      notes: 'Painting',
    });
    expect(created.status).toBe(201);

    const edited = await editBlock(created.body.data.id, {
      dateFrom: day(11),
      dateTo: day(14),
      quantity: 2,
      reasonCode: 'OWNER_USE',
      notes: 'Family stay',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({
      date_from: day(11),
      date_to: day(14),
      quantity: 2,
      reason_code: 'OWNER_USE',
      notes: 'Family stay',
    });

    // Hotel nights are checkout-exclusive: 11–14 blocks the 11th, 12th
    // and 13th; the 10th is free again and the 14th never was blocked.
    const days = await breakdown(unitId, day(10), day(14));
    expect(days[day(10)].available).toBe(CAPACITY);
    expect(days[day(11)].available).toBe(0);
    expect(days[day(13)].available).toBe(0);
    expect(days[day(14)].available).toBe(CAPACITY);
  });

  test('an edit that no longer fits is refused and the block stays as it was', async () => {
    const unitId = await createUnit('Block edit conflict');
    const created = await block(unitId, {
      dateFrom: day(20),
      dateTo: day(21),
      quantity: 1,
    });
    // The other room on the 22nd is taken by a phone booking.
    const phone = await as(
      vendor,
      request(app).post('/api/v1/availability/external-reservations'),
    ).send({
      unitId,
      dateFrom: day(22),
      dateTo: day(23),
      quantity: CAPACITY,
      sourceCode: 'PHONE',
    });
    expect(phone.status).toBe(201);

    const edited = await editBlock(created.body.data.id, {
      dateFrom: day(20),
      dateTo: day(23),
      quantity: 1,
    });
    expect(edited.status).toBe(409);
    expect(edited.body.error.code).toBe('AVAILABILITY_CONFLICT');

    const days = await breakdown(unitId, day(20), day(22));
    expect(days[day(20)].available).toBe(CAPACITY - 1);
    expect(days[day(21)].available).toBe(CAPACITY);
    expect(days[day(22)].available).toBe(0);
  });

  test('a released block cannot be edited, and an unknown one is not found', async () => {
    const unitId = await createUnit('Block edit released');
    const created = await block(unitId, {
      dateFrom: day(30),
      dateTo: day(31),
      quantity: 1,
    });
    const { id } = created.body.data;
    expect(
      (
        await as(
          vendor,
          request(app).delete(`/api/v1/availability/blocks/${id}`),
        )
      ).status,
    ).toBe(200);

    const edited = await editBlock(id, {
      dateFrom: day(30),
      dateTo: day(32),
      quantity: 1,
    });
    expect(edited.status).toBe(409);
    expect(edited.body.error.code).toBe('ALREADY_RELEASED');
    expect((await breakdown(unitId, day(30), day(30)))[day(30)].available).toBe(
      CAPACITY,
    );

    const missing = await editBlock(999_999_999, {
      dateFrom: day(30),
      dateTo: day(31),
      quantity: 1,
    });
    expect(missing.status).toBe(404);
  });

  // A stranger to the (draft) listing gets the same 404 a create gets —
  // `getListing`'s masking, never a 403 that confirms the listing exists.
  test('a customer cannot edit a block', async () => {
    const unitId = await createUnit('Block edit customer');
    const created = await block(unitId, {
      dateFrom: day(40),
      dateTo: day(41),
      quantity: 1,
    });
    const edited = await editBlock(
      created.body.data.id,
      { dateFrom: day(40), dateTo: day(45), quantity: 2 },
      customer,
    );
    expect(edited.status).toBe(404);
  });

  test('an edit and a removal of the same block racing each other leave the capacity consistent', async () => {
    const unitId = await createUnit('Block edit race');
    const created = await block(unitId, {
      dateFrom: day(50),
      dateTo: day(51),
      quantity: 1,
    });
    const { id } = created.body.data;

    const [edit, remove] = await Promise.all([
      editBlock(id, { dateFrom: day(50), dateTo: day(51), quantity: 2 }),
      as(vendor, request(app).delete(`/api/v1/availability/blocks/${id}`)),
    ]);

    const { available } = (await breakdown(unitId, day(50), day(50)))[day(50)];
    if (remove.status === 200 && edit.status === 409) {
      // Released first: everything is back.
      expect(available).toBe(CAPACITY);
    } else {
      // Edited first, then released: everything is back as well.
      expect([edit.status, remove.status]).toEqual([200, 200]);
      expect(available).toBe(CAPACITY);
    }
  });
});

describe('a date range is capped at a year', () => {
  test('a span of exactly 366 days is accepted for a block', async () => {
    const unitId = await createUnit('Range cap boundary');
    const res = await block(unitId, {
      dateFrom: day(1),
      dateTo: day(367),
      quantity: 1,
    });
    expect(res.status).toBe(201);
  });

  test('longer ranges are refused before any date is locked', async () => {
    const unitId = await createUnit('Range cap');
    const longRange = { dateFrom: day(1), dateTo: day(1 + TOO_LONG) };

    const responses = {
      calendar: await as(
        vendor,
        request(app).post('/api/v1/availability'),
      ).send({
        unitId,
        ...longRange,
        priceOverrideAmount: 100,
        priceOverrideCurrency: 'AMD',
      }),
      block: await block(unitId, { ...longRange, quantity: 1 }),
      external: await as(
        vendor,
        request(app).post('/api/v1/availability/external-reservations'),
      ).send({ unitId, ...longRange, sourceCode: 'PHONE' }),
      ledger: await as(
        vendor,
        request(app).get(`/api/v1/availability/units/${unitId}/ledger`),
      ).query({ from: longRange.dateFrom, to: longRange.dateTo }),
      hold: await as(customer, request(app).post('/api/v1/booking-holds')).send(
        { items: [{ bookableUnitId: unitId, ...longRange }] },
      ),
    };

    Object.entries(responses).forEach(([name, res]) => {
      expect([name, res.status]).toEqual([name, 422]);
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            issue: 'DATE_SPAN_TOO_LONG',
            maximum: 366,
          }),
        ]),
      );
    });
    // Nothing was written for those dates.
    expect((await breakdown(unitId, day(2), day(2)))[day(2)].available).toBe(
      CAPACITY,
    );
  });

  test('a hold asks for at most twenty items at once', async () => {
    const unitId = await createUnit('Hold item cap');
    const items = Array.from({ length: 21 }, (_, index) => ({
      bookableUnitId: unitId,
      dateFrom: day(60 + index),
      dateTo: day(61 + index),
    }));
    const res = await as(
      customer,
      request(app).post('/api/v1/booking-holds'),
    ).send({ items });
    expect(res.status).toBe(422);
    expect(issuesOf(res)).toContain('body.items:too_big');
  });
});

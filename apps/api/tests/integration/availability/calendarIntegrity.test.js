/**
 * Step L6.2H4 — calendar writes never corrupt prices or consumed inventory.
 *
 * - `POST /availability` and `PATCH /availability/:id` change only the
 *   fields they carry: a status-only or quantity-only save keeps the date's
 *   price, a price-only save keeps its status and remaining quantity, and a
 *   price is removed only by an explicit `null` pair;
 * - concurrent edits of one date serialize on its row lock without losing
 *   either change;
 * - `DELETE /availability/:id` resets a date to the unit's default capacity
 *   only while nothing consumes it (ledger-derived): with an active hold,
 *   booking, block or reservation it is refused (409
 *   `CALENDAR_ENTRY_IN_USE`) and nothing changes — even when it races a new
 *   hold.
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
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const CAPACITY = 5;
const MAX_BARRIER_POLLS = 2000;

let pool;
let vendor;
let customer;
let unitId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(who) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send(DEV_CREDENTIALS[who]);
  return res.body.data.access_token;
}

function setDay(date, fields) {
  return request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ unitId, dateFrom: date, dateTo: date, ...fields });
}

function patchEntry(id, fields) {
  return request(app)
    .patch(`/api/v1/availability/${id}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send(fields);
}

function deleteEntry(id) {
  return request(app)
    .delete(`/api/v1/availability/${id}`)
    .set('Authorization', `Bearer ${vendor}`);
}

function holdRequest(date, quantity) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        { bookableUnitId: unitId, dateFrom: date, dateTo: date, quantity },
      ],
    });
}

async function hold(date, quantity) {
  const res = await holdRequest(date, quantity);
  expect(res.status).toBe(201);
  return rememberHoldQuotes(res).body.data.items[0].hold_ids;
}

async function entry(date) {
  const [[row]] = await pool.query(
    `SELECT ac.id, ast.code AS status, ac.quantity_available, ac.price_override_amount AS price, cur.code AS currency
     FROM availability_calendar ac
     JOIN availability_statuses ast ON ast.id = ac.status_id
     LEFT JOIN currencies cur ON cur.id = ac.price_override_currency_id
     WHERE ac.bookable_unit_id = ? AND ac.date = ?`,
    [unitId, date],
  );
  return row ?? null;
}

async function waitForQueued(pattern, count) {
  for (let poll = 0; poll < MAX_BARRIER_POLLS; poll += 1) {
    // eslint-disable-next-line no-await-in-loop -- each poll must observe the previous one's state.
    const [[row]] = await pool.query(
      'SELECT COUNT(*) AS queued FROM information_schema.PROCESSLIST WHERE INFO LIKE ?',
      [pattern],
    );
    if (row.queued >= count) return;
  }
  throw new Error(`Fewer than ${count} statements queued on ${pattern}.`);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  const admin = await login('admin');
  vendor = await login('vendor');
  customer = await login('customer');
  const [[partner]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  const [[category]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'tours'",
  );
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId: partner.id,
      listingType: 'TOUR',
      categoryIds: [category.id],
      translations: [
        { languageId: language.id, title: `L6.2H4 calendar ${Date.now()}` },
      ],
      pricing: { modelCode: 'PER_PERSON', amount: 8000, currencyCode: 'AMD' },
    });
  const listingId = listingRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      policyValues: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: CAPACITY,
    });
  unitId = unitRes.body.data.id;
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('a calendar write changes only the fields it carries', () => {
  test.each([
    ['AVAILABLE → BLOCKED', 'AVAILABLE', 'BLOCKED'],
    ['BLOCKED → AVAILABLE', 'BLOCKED', 'AVAILABLE'],
  ])(
    'a status-only save (%s) keeps the date price',
    async (_label, from, to) => {
      const date = day(from === 'AVAILABLE' ? 9 : 10);
      expect(
        (
          await setDay(date, {
            status: from,
            priceOverrideAmount: 12000,
            priceOverrideCurrency: 'AMD',
          })
        ).status,
      ).toBe(201);

      expect((await setDay(date, { status: to })).status).toBe(201);

      expect(await entry(date)).toMatchObject({
        status: to,
        price: '12000.00',
        currency: 'AMD',
      });
    },
  );

  test('a quantity-only save keeps the date price', async () => {
    const date = day(11);
    await setDay(date, {
      priceOverrideAmount: 12000,
      priceOverrideCurrency: 'AMD',
    });

    expect((await setDay(date, { quantityAvailable: 3 })).status).toBe(201);

    expect(await entry(date)).toMatchObject({
      quantity_available: 3,
      price: '12000.00',
    });
  });

  test('a price-only save keeps the date status and remaining quantity', async () => {
    const date = day(12);
    await setDay(date, { status: 'BLOCKED', quantityAvailable: 2 });

    expect(
      (
        await setDay(date, {
          priceOverrideAmount: 9000,
          priceOverrideCurrency: 'AMD',
        })
      ).status,
    ).toBe(201);

    expect(await entry(date)).toMatchObject({
      status: 'BLOCKED',
      quantity_available: 2,
      price: '9000.00',
    });
  });

  test('only an explicit null pair clears a price; a half-cleared pair is a 422', async () => {
    const date = day(13);
    await setDay(date, {
      priceOverrideAmount: 9000,
      priceOverrideCurrency: 'AMD',
    });

    const half = await setDay(date, {
      priceOverrideAmount: null,
      priceOverrideCurrency: 'AMD',
    });
    expect(half.status).toBe(422);
    expect((await entry(date)).price).toBe('9000.00');

    const cleared = await setDay(date, {
      priceOverrideAmount: null,
      priceOverrideCurrency: null,
    });
    expect(cleared.status).toBe(201);
    expect(await entry(date)).toMatchObject({ price: null, currency: null });
  });

  test('PATCH /availability/:id: status-only keeps the price; a null pair clears it', async () => {
    const date = day(14);
    await setDay(date, {
      priceOverrideAmount: 9000,
      priceOverrideCurrency: 'AMD',
    });
    const { id } = await entry(date);

    expect((await patchEntry(id, { status: 'BLOCKED' })).status).toBe(200);
    expect(await entry(date)).toMatchObject({
      status: 'BLOCKED',
      price: '9000.00',
    });

    expect(
      (
        await patchEntry(id, {
          priceOverrideAmount: null,
          priceOverrideCurrency: null,
        })
      ).status,
    ).toBe(200);
    expect(await entry(date)).toMatchObject({ status: 'BLOCKED', price: null });
  });

  test('a concurrent price edit and status edit of one date both survive', async () => {
    const date = day(15);
    await setDay(date, {});

    const [priced, blocked] = await Promise.all([
      setDay(date, {
        priceOverrideAmount: 11000,
        priceOverrideCurrency: 'AMD',
      }),
      setDay(date, { status: 'BLOCKED' }),
    ]);

    expect([priced.status, blocked.status]).toEqual([201, 201]);
    expect(await entry(date)).toMatchObject({
      status: 'BLOCKED',
      price: '11000.00',
      quantity_available: CAPACITY,
    });
  });

  test('a status-only save during a hold keeps the quoted price: the booking needs no re-quote', async () => {
    const date = day(16);
    await setDay(date, {
      priceOverrideAmount: 12000,
      priceOverrideCurrency: 'AMD',
    });
    const holdIds = await hold(date, 1);

    await setDay(date, { status: 'AVAILABLE' });
    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(holdIds)],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(booked.status).toBe(201);
    expect(booked.body.data.total_amount).toBe('12000.00');
  });
});

describe('capacity edits against held places', () => {
  test('a capacity below what is held is refused; one above it keeps the held places consumed', async () => {
    const date = day(17);
    await hold(date, 2);

    const below = await setDay(date, { quantityAvailable: 1 });
    expect(below.status).toBe(409);
    expect(below.body.error.code).toBe('CAPACITY_BELOW_CONSUMED');
    expect((await entry(date)).quantity_available).toBe(CAPACITY - 2);

    expect((await setDay(date, { quantityAvailable: 3 })).status).toBe(201);
    expect((await entry(date)).quantity_available).toBe(1);
  });

  test('blocking a held date keeps the hold and its places; new holds are refused', async () => {
    const date = day(18);
    const holdIds = await hold(date, 2);

    expect((await setDay(date, { status: 'BLOCKED' })).status).toBe(201);

    expect((await entry(date)).quantity_available).toBe(CAPACITY - 2);
    const blocked = await holdRequest(date, 1);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('BLACKOUT_DATE');
    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(holdIds)],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(booked.status).toBe(201);
    expect((await entry(date)).quantity_available).toBe(CAPACITY - 2);
  });
});

describe('DELETE /availability/:id — never resets consumed inventory', () => {
  test('a date with an active hold is refused and left untouched', async () => {
    const date = day(19);
    await setDay(date, {
      priceOverrideAmount: 9000,
      priceOverrideCurrency: 'AMD',
    });
    await hold(date, 2);
    const before = await entry(date);

    const res = await deleteEntry(before.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CALENDAR_ENTRY_IN_USE');
    expect(await entry(date)).toEqual(before);
  });

  test('a date with a booking is refused; its sold places are never restored', async () => {
    const date = day(20);
    const holdIds = await hold(date, 3);
    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(holdIds)],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(booked.status).toBe(201);
    const before = await entry(date);

    const res = await deleteEntry(before.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CALENDAR_ENTRY_IN_USE');
    expect((await entry(date)).quantity_available).toBe(CAPACITY - 3);
  });

  test('a date with no consumption (a capacity override only) is removed back to the default', async () => {
    const date = day(21);
    await setDay(date, { status: 'BLOCKED', quantityAvailable: 0 });
    const { id } = await entry(date);

    expect((await deleteEntry(id)).status).toBe(200);

    expect(await entry(date)).toBeNull();
    const held = await holdRequest(date, CAPACITY);
    expect(held.status).toBe(201);
  });

  test('a date whose hold was released again has no consumption and can be removed', async () => {
    const date = day(22);
    const holdIds = await hold(date, 2);
    const released = await request(app)
      .delete('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer}`)
      .send({ holdIds });
    expect(released.status).toBeLessThan(300);
    const { id } = await entry(date);

    expect((await deleteEntry(id)).status).toBe(200);
    expect(await entry(date)).toBeNull();
  });

  test('a delete racing a new hold never restores the held places', async () => {
    const date = day(23);
    await setDay(date, { quantityAvailable: 4 });
    const { id } = await entry(date);
    const barrier = await pool.getConnection();
    await barrier.beginTransaction();
    await barrier.query(
      'SELECT id FROM availability_calendar WHERE id = ? FOR UPDATE',
      [id],
    );

    const racing = [deleteEntry(id), holdRequest(date, 2)].map((req) =>
      req.then((res) => res),
    );
    await waitForQueued('INSERT INTO availability_calendar%', 1);
    await waitForQueued(
      'SELECT id FROM availability_calendar%bookable_unit_id%FOR UPDATE',
      1,
    );
    await barrier.commit();
    barrier.release();
    const [deleted, held] = await Promise.all(racing);

    expect(held.status).toBe(201);
    const remaining = (await entry(date)).quantity_available;
    if (deleted.status === 200) {
      // Removed first: the hold then consumed the unit's default capacity.
      expect(remaining).toBe(CAPACITY - 2);
    } else {
      // Held first: the removal saw the consumption and changed nothing.
      expect(deleted.status).toBe(409);
      expect(deleted.body.error.code).toBe('CALENDAR_ENTRY_IN_USE');
      expect(remaining).toBe(4 - 2);
    }
  });
});

/**
 * Step L6.2E — the base customer-hold contract, independent of any Partner
 * booking rule:
 *
 * - hold expiry is DB UTC + the configured TTL (never TTL + the host's UTC
 *   offset, which a JS `Date` serialized by mysql2 used to add);
 * - a lodging stay needs at least one night (`ZERO_NIGHT_STAY`);
 * - a rental needs both its times, a restaurant reservation its time;
 * - a booking can't start in the past (Asia/Yerevan business time, DB clock);
 * - every rejection reserves nothing;
 * - Partner inventory paths (manual block, external reservation) are not
 *   customer holds and are not subject to any of it.
 *
 * Dates are offsets from TODAY's Asia/Yerevan date on the DB clock, never
 * wall-clock literals, and nothing sleeps.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import config from '../../../src/config/index.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let pool;
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
  return res.body.data.access_token;
}

async function createUnit(listingType, bookableUnitType, extra = {}) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `L6.2E ${listingType} ${Date.now()}` },
      ],
    });
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      listingId: listingRes.body.data.id,
      bookableUnitType,
      capacity: 3,
      ...extra,
    });
  expect(unitRes.status).toBe(201);
  return unitRes.body.data.id;
}

function hold(item) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items: [{ quantity: 1, ...item }] });
}

async function holdRowCount(unitId) {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM reservation_holds WHERE bookable_unit_id = ?',
    [unitId],
  );
  return total;
}

async function ledgerRowCount(unitId) {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM inventory_ledger WHERE bookable_unit_id = ?',
    [unitId],
  );
  return total;
}

function expectRejected(res, issue) {
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(res.body.error.details).toEqual([{ field: 'items', issue }]);
}

async function expectNothingReserved(unitId) {
  expect(await holdRowCount(unitId)).toBe(0);
  expect(await ledgerRowCount(unitId)).toBe(0);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );
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

describe('hold expiry — DB UTC + configured TTL', () => {
  const ttlSeconds = config.booking.holdDurationMinutes * 60;

  test('a new hold expires one TTL after DB UTC now, never TTL + the host UTC offset, and is active immediately', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(20),
      dateTo: day(21),
    });
    expect(res.status).toBe(201);
    const [holdId] = res.body.data.items[0].hold_ids;

    const [[stored]] = await pool.query(
      'SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(3), expires_at) AS seconds_left FROM reservation_holds WHERE id = ?',
      [holdId],
    );
    expect(stored.seconds_left).toBeGreaterThan(ttlSeconds - 60);
    expect(stored.seconds_left).toBeLessThanOrEqual(ttlSeconds);

    // The response carries the same real instant (ISO, UTC).
    const [[dbNow]] = await pool.query(
      "SELECT LEFT(DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%f'), 23) AS now_utc",
    );
    const responseSecondsLeft =
      (new Date(res.body.data.expires_at) - new Date(`${dbNow.now_utc}Z`)) /
      1000;
    expect(responseSecondsLeft).toBeGreaterThan(ttlSeconds - 60);
    expect(responseSecondsLeft).toBeLessThanOrEqual(ttlSeconds);

    // Active right away, and listed with the same real expiry.
    const listRes = await request(app)
      .get('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer}`);
    const listed = listRes.body.data.find((entry) => entry.id === holdId);
    expect(listed).toBeDefined();
    expect(new Date(listed.expires_at).getTime()).toBe(
      new Date(res.body.data.expires_at).getTime(),
    );
  });

  test('once its DB expiry has passed, a hold is no longer listed and cannot be booked', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(22),
      dateTo: day(23),
    });
    const holdIds = res.body.data.items[0].hold_ids;
    await pool.query(
      'UPDATE reservation_holds SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id IN (?)',
      [holdIds],
    );

    const listRes = await request(app)
      .get('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer}`);
    expect(listRes.body.data.map((entry) => entry.id)).not.toContain(
      holdIds[0],
    );

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      });
    expect(bookingRes.status).toBe(409);
    expect(bookingRes.body.error.code).toBe('HOLD_EXPIRED');
  });
});

describe('lodging — a stay is at least one night', () => {
  test.each([
    ['HOTEL', 'HOTEL_ROOM'],
    ['PROPERTY', 'PROPERTY_UNIT'],
  ])(
    'a same-date %s hold is ZERO_NIGHT_STAY and reserves nothing',
    async (listingType, unitType) => {
      const unitId = await createUnit(listingType, unitType);
      const res = await hold({
        bookableUnitId: unitId,
        dateFrom: day(10),
        dateTo: day(10),
      });
      expectRejected(res, 'ZERO_NIGHT_STAY');
      await expectNothingReserved(unitId);
    },
  );

  test('a one-night stay is accepted', async () => {
    const unitId = await createUnit('PROPERTY', 'PROPERTY_UNIT');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(10),
      dateTo: day(11),
    });
    expect(res.status).toBe(201);
  });
});

describe('required times', () => {
  test.each([
    ['both missing', {}],
    ['return time missing', { startTime: '10:00' }],
    ['pickup time missing', { endTime: '18:00' }],
  ])(
    'a vehicle hold with %s is INCOMPLETE_RENTAL_INTERVAL and reserves nothing',
    async (_label, times) => {
      const unitId = await createUnit('CAR_RENTAL', 'VEHICLE');
      const res = await hold({
        bookableUnitId: unitId,
        dateFrom: day(5),
        dateTo: day(7),
        ...times,
      });
      expectRejected(res, 'INCOMPLETE_RENTAL_INTERVAL');
      await expectNothingReserved(unitId);
    },
  );

  test('a vehicle hold with both times is accepted and keeps them', async () => {
    const unitId = await createUnit('CAR_RENTAL', 'VEHICLE');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(5),
      dateTo: day(7),
      startTime: '10:00',
      endTime: '18:00',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0]).toMatchObject({
      start_time: '10:00',
      end_time: '18:00',
    });
  });

  test('a restaurant hold without its time is RESERVATION_TIME_REQUIRED and reserves nothing', async () => {
    const unitId = await createUnit('RESTAURANT', 'RESTAURANT_TABLE');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(3),
      dateTo: day(3),
    });
    expectRejected(res, 'RESERVATION_TIME_REQUIRED');
    await expectNothingReserved(unitId);
  });

  test('a restaurant hold with its time is accepted', async () => {
    const unitId = await createUnit('RESTAURANT', 'RESTAURANT_TABLE');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(3),
      dateTo: day(3),
      startTime: '19:30',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].start_time).toBe('19:30');
  });

  test('an untimed tour departure still books by date alone', async () => {
    const unitId = await createUnit('TOUR', 'TOUR_DEPARTURE');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(4),
      dateTo: day(4),
    });
    expect(res.status).toBe(201);
  });
});

describe('past start — Asia/Yerevan business time on the DB clock', () => {
  test.each([
    [
      'a restaurant reservation yesterday evening',
      'RESTAURANT',
      'RESTAURANT_TABLE',
      { startTime: '23:59' },
      {},
    ],
    [
      'a rental picked up yesterday',
      'CAR_RENTAL',
      'VEHICLE',
      { startTime: '23:59', endTime: '10:00' },
      { dateToOffset: 1 },
    ],
    [
      'a timed departure yesterday',
      'TOUR',
      'TOUR_DEPARTURE',
      {},
      { unit: { timeSlotStart: '23:59', timeSlotEnd: '23:59' } },
    ],
  ])(
    '%s is BOOKING_IN_PAST and reserves nothing',
    async (
      _label,
      listingType,
      unitType,
      times,
      { dateToOffset = -1, unit = {} },
    ) => {
      const unitId = await createUnit(listingType, unitType, unit);
      const res = await hold({
        bookableUnitId: unitId,
        dateFrom: day(-1),
        dateTo: day(dateToOffset),
        ...times,
      });
      expectRejected(res, 'BOOKING_IN_PAST');
      await expectNothingReserved(unitId);
    },
  );

  test('a date-only stay starting yesterday is BOOKING_IN_PAST', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(-1),
      dateTo: day(1),
    });
    expectRejected(res, 'BOOKING_IN_PAST');
    await expectNothingReserved(unitId);
  });

  test('a date-only stay checking in today is accepted all day long', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(0),
      dateTo: day(1),
    });
    expect(res.status).toBe(201);
  });

  test('a timed booking later is accepted', async () => {
    const unitId = await createUnit('RESTAURANT', 'RESTAURANT_TABLE');
    const res = await hold({
      bookableUnitId: unitId,
      dateFrom: day(1),
      dateTo: day(1),
      startTime: '00:00',
    });
    expect(res.status).toBe(201);
  });
});

describe('Partner inventory paths are not customer holds', () => {
  test('a manual block and an external reservation can still cover a past, same-day lodging date', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM');
    const blockRes = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId,
        dateFrom: day(-2),
        dateTo: day(-2),
        quantity: 1,
        reasonCode: 'OWNER_USE',
      });
    expect(blockRes.status).toBe(201);

    const externalRes = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId,
        dateFrom: day(-1),
        dateTo: day(-1),
        quantity: 1,
        sourceCode: 'WALK_IN',
      });
    expect(externalRes.status).toBe(201);
  });
});

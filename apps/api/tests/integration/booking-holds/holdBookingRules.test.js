/**
 * Step L6.2F — Partner booking rules on customer holds (`POST /booking-holds`,
 * called directly — the widget is never relied on):
 *
 * - min/max stay as lodging nights (HOTEL/PROPERTY) and rental days
 *   (CAR_RENTAL); ignored for RESTAURANT/TOUR/ATTRACTION even when legacy
 *   values are stored;
 * - advance minimum hours and advance maximum calendar days for every type;
 * - every rejection reserves nothing, a multi-item request rolls back whole;
 * - Partner inventory writes (block, external, CSV) bypass the rules;
 * - an active hold keeps the rules it was granted under (grandfathering),
 *   while booking conversion still refuses a start already in the past and
 *   leaves the hold intact.
 *
 * Every date/time is derived from the DB clock in Asia/Yerevan business time
 * (`helpers/isoDates.js`); nothing sleeps.
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
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { toBusinessDateTime } from '../../../src/core/domain/bookingTimebase.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const UNIT_TYPE_BY_LISTING_TYPE = {
  HOTEL: 'HOTEL_ROOM',
  PROPERTY: 'PROPERTY_UNIT',
  CAR_RENTAL: 'VEHICLE',
  RESTAURANT: 'RESTAURANT_TABLE',
  TOUR: 'TOUR_DEPARTURE',
  ATTRACTION: 'TOUR_DEPARTURE',
};
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let admin;
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

async function setRules(listingId, bookingRules) {
  const res = await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ bookingRules });
  expect(res.status).toBe(200);
}

/** A listing of `listingType` with its rules and one unit (base-priced, so it can be booked). */
async function createBookable(listingType, rules, unitExtra = {}) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `L6.2F ${listingType} ${Date.now()}` },
      ],
    });
  const listingId = listingRes.body.data.id;
  if (rules) await setRules(listingId, rules);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      listingId,
      bookableUnitType: UNIT_TYPE_BY_LISTING_TYPE[listingType],
      capacity: 3,
      basePriceAmount: 10000,
      basePriceCurrency: 'AMD',
      ...unitExtra,
    });
  expect(unitRes.status).toBe(201);
  return { listingId, unitId: unitRes.body.data.id };
}

/** Publishes a listing the way every publish path does (admin publish). */
async function publish(listingId) {
  const res = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  expect(res.status).toBe(200);
}

function hold(items) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items: items.map((item) => ({ quantity: 1, ...item })) });
}

async function countFor(table, unitId) {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${table} WHERE bookable_unit_id = ?`,
    [unitId],
  );
  return total;
}

async function expectNothingReserved(unitId) {
  expect(await countFor('reservation_holds', unitId)).toBe(0);
  expect(await countFor('inventory_ledger', unitId)).toBe(0);
}

function expectRuleRejection(res, detail) {
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(res.body.error.details).toEqual([{ field: 'items', ...detail }]);
}

/** Asia/Yerevan date + HH:MM `minutes` from DB now (for timed starts). */
async function businessMomentIn(minutes) {
  const [[row]] = await pool.query(
    "SELECT LEFT(DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE), '%Y-%m-%dT%H:%i:%s.%f'), 23) AS at_utc",
    [minutes],
  );
  const moment = toBusinessDateTime(new Date(`${row.at_utc}Z`));
  return { date: moment.date, time: moment.time.slice(0, 5) };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
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

describe('stay / rental length', () => {
  test.each(['HOTEL', 'PROPERTY'])(
    '%s: below the minimum and above the maximum nights are rejected with nothing reserved; the exact bounds are accepted',
    async (listingType) => {
      const rules = { minimumStayNights: 2, maximumStayNights: 4 };
      const { unitId } = await createBookable(listingType, rules);

      const below = await hold([
        { bookableUnitId: unitId, dateFrom: day(10), dateTo: day(11) },
      ]);
      expectRuleRejection(below, {
        issue: 'MINIMUM_STAY_NOT_MET',
        minimum: 2,
        unit: 'nights',
      });
      const above = await hold([
        { bookableUnitId: unitId, dateFrom: day(10), dateTo: day(15) },
      ]);
      expectRuleRejection(above, {
        issue: 'MAXIMUM_STAY_EXCEEDED',
        maximum: 4,
        unit: 'nights',
      });
      await expectNothingReserved(unitId);

      const exactMin = await hold([
        { bookableUnitId: unitId, dateFrom: day(20), dateTo: day(22) },
      ]);
      expect(exactMin.status).toBe(201);
      const exactMax = await hold([
        { bookableUnitId: unitId, dateFrom: day(30), dateTo: day(34) },
      ]);
      expect(exactMax.status).toBe(201);
    },
  );

  test('CAR_RENTAL: limits are inclusive rental days, whatever the pickup/return times', async () => {
    const { unitId } = await createBookable('CAR_RENTAL', {
      minimumStayNights: 2,
      maximumStayNights: 3,
    });
    const times = { startTime: '18:00', endTime: '09:00' };

    const oneDay = await hold([
      {
        bookableUnitId: unitId,
        dateFrom: day(10),
        dateTo: day(10),
        startTime: '09:00',
        endTime: '18:00',
      },
    ]);
    expectRuleRejection(oneDay, {
      issue: 'MINIMUM_STAY_NOT_MET',
      minimum: 2,
      unit: 'days',
    });
    const fourDays = await hold([
      { bookableUnitId: unitId, dateFrom: day(10), dateTo: day(13), ...times },
    ]);
    expectRuleRejection(fourDays, {
      issue: 'MAXIMUM_STAY_EXCEEDED',
      maximum: 3,
      unit: 'days',
    });
    await expectNothingReserved(unitId);

    const twoDays = await hold([
      { bookableUnitId: unitId, dateFrom: day(20), dateTo: day(21), ...times },
    ]);
    expect(twoDays.status).toBe(201);
    const threeDays = await hold([
      { bookableUnitId: unitId, dateFrom: day(30), dateTo: day(32), ...times },
    ]);
    expect(threeDays.status).toBe(201);
  });
});

describe('advance minimum hours', () => {
  test('timed: a reservation inside the lead time is rejected, one past it accepted', async () => {
    const { unitId } = await createBookable('RESTAURANT', {
      advanceBookingMinHours: 2,
    });
    const tooSoon = await businessMomentIn(100);
    const rejected = await hold([
      {
        bookableUnitId: unitId,
        dateFrom: tooSoon.date,
        dateTo: tooSoon.date,
        startTime: tooSoon.time,
      },
    ]);
    expectRuleRejection(rejected, {
      issue: 'BOOKING_TOO_SOON',
      minimumHours: 2,
    });
    await expectNothingReserved(unitId);

    const later = await businessMomentIn(140);
    const accepted = await hold([
      {
        bookableUnitId: unitId,
        dateFrom: later.date,
        dateTo: later.date,
        startTime: later.time,
      },
    ]);
    expect(accepted.status).toBe(201);
  });

  test('date-only: a stay starting at tomorrow 00:00 is inside a 48h lead time; three days out is not', async () => {
    const { unitId } = await createBookable('HOTEL', {
      advanceBookingMinHours: 48,
    });
    const rejected = await hold([
      { bookableUnitId: unitId, dateFrom: day(1), dateTo: day(2) },
    ]);
    expectRuleRejection(rejected, {
      issue: 'BOOKING_TOO_SOON',
      minimumHours: 48,
    });
    await expectNothingReserved(unitId);

    const accepted = await hold([
      { bookableUnitId: unitId, dateFrom: day(3), dateTo: day(4) },
    ]);
    expect(accepted.status).toBe(201);
  });

  test('0 hours is no lead time: a stay checking in today is accepted', async () => {
    const { unitId } = await createBookable('HOTEL', {
      advanceBookingMinHours: 0,
    });
    const res = await hold([
      { bookableUnitId: unitId, dateFrom: day(0), dateTo: day(1) },
    ]);
    expect(res.status).toBe(201);
  });
});

describe('advance maximum days (Asia/Yerevan calendar days)', () => {
  test('beyond the horizon is rejected with nothing reserved; the exact last date is accepted', async () => {
    const { unitId } = await createBookable('TOUR', {
      advanceBookingMaxDays: 5,
    });
    const tooFar = await hold([
      { bookableUnitId: unitId, dateFrom: day(6), dateTo: day(6) },
    ]);
    expectRuleRejection(tooFar, {
      issue: 'BOOKING_TOO_FAR_AHEAD',
      maximumDays: 5,
    });
    await expectNothingReserved(unitId);

    const lastDate = await hold([
      { bookableUnitId: unitId, dateFrom: day(5), dateTo: day(5) },
    ]);
    expect(lastDate.status).toBe(201);
  });

  test('0 = today only: today is accepted, tomorrow rejected', async () => {
    const { unitId } = await createBookable('HOTEL', {
      advanceBookingMaxDays: 0,
    });
    const todayRes = await hold([
      { bookableUnitId: unitId, dateFrom: day(0), dateTo: day(1) },
    ]);
    expect(todayRes.status).toBe(201);
    const tomorrow = await hold([
      { bookableUnitId: unitId, dateFrom: day(1), dateTo: day(2) },
    ]);
    expectRuleRejection(tomorrow, {
      issue: 'BOOKING_TOO_FAR_AHEAD',
      maximumDays: 0,
    });
  });
});

describe('legacy stay values on non-lodging, non-rental listings', () => {
  test.each([
    ['RESTAURANT', { startTime: '12:00' }],
    ['TOUR', {}],
    ['ATTRACTION', {}],
  ])(
    '%s ignores stored min/max stay; its advance rules still apply',
    async (listingType, times) => {
      const { unitId } = await createBookable(listingType, {
        minimumStayNights: 5,
        maximumStayNights: 7,
        advanceBookingMaxDays: 10,
      });
      const within = await hold([
        { bookableUnitId: unitId, dateFrom: day(4), dateTo: day(4), ...times },
      ]);
      expect(within.status).toBe(201);

      const tooFar = await hold([
        {
          bookableUnitId: unitId,
          dateFrom: day(11),
          dateTo: day(11),
          ...times,
        },
      ]);
      expectRuleRejection(tooFar, {
        issue: 'BOOKING_TOO_FAR_AHEAD',
        maximumDays: 10,
      });
    },
  );
});

describe('atomicity', () => {
  test('a multi-item request with one rule violation rolls back entirely', async () => {
    const valid = await createBookable('HOTEL', null);
    const strict = await createBookable('HOTEL', { minimumStayNights: 3 });

    const res = await hold([
      { bookableUnitId: valid.unitId, dateFrom: day(40), dateTo: day(41) },
      { bookableUnitId: strict.unitId, dateFrom: day(40), dateTo: day(41) },
    ]);
    expectRuleRejection(res, {
      issue: 'MINIMUM_STAY_NOT_MET',
      minimum: 3,
      unit: 'nights',
    });
    await expectNothingReserved(valid.unitId);
    await expectNothingReserved(strict.unitId);
  });
});

describe('Partner inventory writes bypass customer booking rules', () => {
  test('manual block, external reservation and CSV import all succeed on rule-violating ranges', async () => {
    const { unitId } = await createBookable('HOTEL', {
      minimumStayNights: 5,
      advanceBookingMinHours: 720,
      advanceBookingMaxDays: 0,
    });

    const block = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId,
        dateFrom: day(1),
        dateTo: day(2),
        quantity: 1,
        reasonCode: 'OWNER_USE',
      });
    expect(block.status).toBe(201);

    const external = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId,
        dateFrom: day(60),
        dateTo: day(61),
        quantity: 1,
        sourceCode: 'WALK_IN',
      });
    expect(external.status).toBe(201);

    const csv = await request(app)
      .post('/api/v1/availability/external-reservations/bulk-import')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId,
        sourceCode: 'OTHER',
        rows: [{ dateFrom: day(90), dateTo: day(90) }],
      });
    expect(csv.status).toBe(200);
    expect(csv.body.data.results).toEqual([
      expect.objectContaining({ status: 'CREATED' }),
    ]);
  });
});

describe('active holds keep the rules they were granted under', () => {
  test('a rule tightened after the hold does not block its checkout; a new hold is judged by the new rule', async () => {
    const { listingId, unitId } = await createBookable('HOTEL', {
      maximumStayNights: 5,
    });
    // A customer can only book a published listing, and a Partner edits a
    // published listing's rules the only way the platform allows: unpublish,
    // edit, get it published again.
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    await publish(listingId);

    const granted = await hold([
      { bookableUnitId: unitId, dateFrom: day(50), dateTo: day(53) },
    ]);
    expect(granted.status).toBe(201);
    const { hold_ids: holdIds } =
      rememberHoldQuotes(granted).body.data.items[0];

    const unpublished = await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(unpublished.status).toBe(200);
    await setRules(listingId, { maximumStayNights: 2 });
    await publish(listingId);

    const booking = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(holdIds, { guests: [] })],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(booking.status).toBe(201);

    const fresh = await hold([
      { bookableUnitId: unitId, dateFrom: day(50), dateTo: day(53) },
    ]);
    expectRuleRejection(fresh, {
      issue: 'MAXIMUM_STAY_EXCEEDED',
      maximum: 2,
      unit: 'nights',
    });
  });

  test('conversion refuses a booking whose start has passed and leaves the active hold intact', async () => {
    const { unitId } = await createBookable('RESTAURANT', null);
    const granted = await hold([
      {
        bookableUnitId: unitId,
        dateFrom: day(1),
        dateTo: day(1),
        startTime: '19:00',
      },
    ]);
    expect(granted.status).toBe(201);
    const { hold_ids: holdIds } =
      rememberHoldQuotes(granted).body.data.items[0];
    const [[bookingsBefore]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );

    // Controlled data: the still-active hold's reservation moves to
    // yesterday (its expiry is untouched).
    await pool.query(
      'UPDATE reservation_holds SET start_date = ?, end_date = ? WHERE id IN (?)',
      [day(-1), day(-1), holdIds],
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(holdIds, { guests: [] })],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'items', issue: 'BOOKING_IN_PAST' },
    ]);

    const [[bookingsAfter]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );
    expect(bookingsAfter.total).toBe(bookingsBefore.total);
    const [activeHolds] = await pool.query(
      'SELECT id FROM reservation_holds WHERE id IN (?) AND expires_at > UTC_TIMESTAMP(3)',
      [holdIds],
    );
    expect(activeHolds.map((row) => row.id)).toEqual(holdIds);
  });
});

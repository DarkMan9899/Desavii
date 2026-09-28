/**
 * Step L6.2H1 — a legacy pricing model the booking engine can't charge
 * (PER_HOUR, no longer offered by any category) is refused for customer
 * booking instead of being silently billed per date x quantity:
 *
 * - `POST /booking-holds` (called directly — the widget is never relied
 *   on) is a 422 before any capacity, ledger or hold write;
 * - a multi-item request with one such item rolls back whole;
 * - PER_PERSON Tours and Entertainment Venues still hold normally;
 * - a hold granted before the listing became unsupported can't be
 *   converted either, and stays intact.
 *
 * A legacy listing is simulated by writing PER_HOUR into `listing_pricing`
 * directly — the API itself can no longer store it.
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

const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const LISTING_TYPE_BY_CATEGORY = {
  tours: 'TOUR',
  'entertainment-venues': 'ATTRACTION',
};
const UNSUPPORTED_DETAIL = {
  field: 'pricingModel',
  issue: 'UNSUPPORTED_PRICING_MODEL_FOR_BOOKING',
};

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let today;
const categoryIds = {};
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

/** A PER_PERSON-priced listing of `categorySlug` with one base-priced departure unit. */
async function createBookable(categorySlug) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: LISTING_TYPE_BY_CATEGORY[categorySlug],
      translations: [
        { languageId, title: `L6.2H1 ${categorySlug} ${Date.now()}` },
      ],
      categoryIds: [categoryIds[categorySlug]],
      pricing: { modelCode: 'PER_PERSON', amount: 8000, currencyCode: 'AMD' },
    });
  expect(listingRes.status).toBe(201);
  const listingId = listingRes.body.data.id;
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: 4,
      basePriceAmount: 8000,
      basePriceCurrency: 'AMD',
    });
  expect(unitRes.status).toBe(201);
  return { listingId, unitId: unitRes.body.data.id };
}

/** Simulates a listing priced PER_HOUR before migration 0051. */
async function makeLegacyHourly(listingId) {
  await pool.query(
    `UPDATE listing_pricing
     SET pricing_model_id = (SELECT id FROM pricing_models WHERE code = 'PER_HOUR')
     WHERE listing_id = ?`,
    [listingId],
  );
}

async function createLegacy(categorySlug) {
  const bookable = await createBookable(categorySlug);
  await makeLegacyHourly(bookable.listingId);
  return bookable;
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

async function calendarOf(unitId) {
  const [rows] = await pool.query(
    'SELECT date, quantity_available FROM availability_calendar WHERE bookable_unit_id = ? ORDER BY date',
    [unitId],
  );
  return rows;
}

async function expectNothingReserved(unitId, calendarBefore) {
  expect(await countFor('reservation_holds', unitId)).toBe(0);
  expect(await countFor('inventory_ledger', unitId)).toBe(0);
  expect(await calendarOf(unitId)).toEqual(calendarBefore);
}

function expectUnsupported(res) {
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(res.body.error.details).toEqual([UNSUPPORTED_DETAIL]);
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
  const [categories] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug IN ('tours', 'entertainment-venues')",
  );
  categories.forEach((row) => {
    categoryIds[row.slug] = row.id;
  });
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('legacy PER_HOUR holds', () => {
  test.each(['tours', 'entertainment-venues'])(
    '%s: a direct POST /booking-holds is rejected with no capacity, ledger or hold write',
    async (categorySlug) => {
      const { unitId } = await createLegacy(categorySlug);
      const calendarBefore = await calendarOf(unitId);

      const res = await hold([
        {
          bookableUnitId: unitId,
          dateFrom: day(10),
          dateTo: day(10),
          quantity: 2,
        },
      ]);

      expectUnsupported(res);
      await expectNothingReserved(unitId, calendarBefore);
    },
  );

  test('a multi-item request with one unsupported item rolls back whole', async () => {
    const supported = await createBookable('tours');
    const legacy = await createLegacy('entertainment-venues');
    const supportedCalendar = await calendarOf(supported.unitId);
    const legacyCalendar = await calendarOf(legacy.unitId);

    const res = await hold([
      { bookableUnitId: supported.unitId, dateFrom: day(12), dateTo: day(12) },
      { bookableUnitId: legacy.unitId, dateFrom: day(12), dateTo: day(12) },
    ]);

    expectUnsupported(res);
    await expectNothingReserved(supported.unitId, supportedCalendar);
    await expectNothingReserved(legacy.unitId, legacyCalendar);
  });
});

describe('supported PER_PERSON holds', () => {
  test.each(['tours', 'entertainment-venues'])(
    '%s: a PER_PERSON hold is granted as before',
    async (categorySlug) => {
      const { unitId } = await createBookable(categorySlug);

      const res = await hold([
        {
          bookableUnitId: unitId,
          dateFrom: day(14),
          dateTo: day(14),
          quantity: 2,
        },
      ]);

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].hold_ids).toHaveLength(2);
      expect(await countFor('reservation_holds', unitId)).toBe(2);
    },
  );
});

describe('booking conversion', () => {
  test('a hold granted before the listing became unsupported cannot be converted, and stays intact', async () => {
    const { listingId, unitId } = await createBookable('entertainment-venues');
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({ location: { latitude: 40.1872, longitude: 44.5152 } });
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const published = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ publicationPeriodDays: 90 });
    expect(published.status).toBe(200);

    const granted = await hold([
      { bookableUnitId: unitId, dateFrom: day(16), dateTo: day(16) },
    ]);
    expect(granted.status).toBe(201);
    const { hold_ids: holdIds } = granted.body.data.items[0];
    await makeLegacyHourly(listingId);
    const [[bookingsBefore]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expectUnsupported(res);
    const [[bookingsAfter]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );
    expect(bookingsAfter.total).toBe(bookingsBefore.total);
    expect(await countFor('reservation_holds', unitId)).toBe(1);
  });
});

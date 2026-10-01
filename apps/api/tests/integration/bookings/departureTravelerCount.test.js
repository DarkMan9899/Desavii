/**
 * Step L6.2H3B — a departure's (TOUR_DEPARTURE's) held quantity is its one
 * authoritative person count: Travelers (Tours), Visitors (Attractions),
 * Participants (Entertainment Venues). The same number is the inventory
 * consumed, `booking_items.quantity` and the price multiplier.
 *
 * Called through the API directly (the widget is never relied on):
 * - quantity N takes N places and charges the per-person price × N, for all
 *   three categories;
 * - a submitted `guestCount` must equal the held quantity — a mismatch is a
 *   422 `TRAVELER_COUNT_MISMATCH` that creates no booking and leaves the
 *   hold (and the places it holds) active; an omitted count is accepted;
 * - a departure never stores a separate `guest_count` (restaurant-only);
 * - public search asks for the same number of places booking consumes.
 *
 * Dates come from the DB clock in Asia/Yerevan business time.
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

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const PRICE_PER_PERSON = 8000;
const LISTING_TYPE_BY_CATEGORY = {
  tours: 'TOUR',
  attractions: 'ATTRACTION',
  'entertainment-venues': 'ATTRACTION',
};
// Each category's required policies (tours need a cancellation policy).
const POLICIES_BY_CATEGORY = {
  tours: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
  attractions: [],
  'entertainment-venues': [],
};

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let yerevanCityId;
let today;
const categoryIds = {};
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

/** A published PER_PERSON departure of `capacity` places in `categorySlug`. */
async function createDeparture(categorySlug, { capacity = 10, title } = {}) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: LISTING_TYPE_BY_CATEGORY[categorySlug],
      translations: [
        {
          languageId,
          title: title ?? `L6.2H3B ${categorySlug} ${Date.now()}`,
        },
      ],
      categoryIds: [categoryIds[categorySlug]],
      location: { cityId: yerevanCityId },
      pricing: {
        modelCode: 'PER_PERSON',
        amount: PRICE_PER_PERSON,
        currencyCode: 'AMD',
      },
    });
  expect(listingRes.status).toBe(201);
  const listingId = listingRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      policyValues: POLICIES_BY_CATEGORY[categorySlug],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ listingId, bookableUnitType: 'TOUR_DEPARTURE', capacity });
  expect(unitRes.status).toBe(201);
  const published = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  expect(published.status).toBe(200);
  return { listingId, unitId: unitRes.body.data.id };
}

async function hold(unitId, date, quantity) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        { bookableUnitId: unitId, dateFrom: date, dateTo: date, quantity },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.items[0].hold_ids;
}

function book(holdIds, guestCount) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        {
          holdIds,
          guests: [],
          ...(guestCount !== undefined && { guestCount }),
        },
      ],
      guestContactSnapshot: GUEST_CONTACT,
    });
}

async function placesLeft(unitId, date) {
  const [[row]] = await pool.query(
    'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
    [unitId, date],
  );
  return row?.quantity_available ?? null;
}

async function countFor(table, unitId) {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${table} WHERE bookable_unit_id = ?`,
    [unitId],
  );
  return total;
}

function expectMismatch(res) {
  expect(res.status).toBe(422);
  expect(res.body.error.code).toBe('VALIDATION_FAILED');
  expect(res.body.error.details).toEqual([
    { field: 'items', issue: 'TRAVELER_COUNT_MISMATCH' },
  ]);
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
  const [[yerevan]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'yerevan'",
  );
  yerevanCityId = yerevan.id;
  const [categories] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug IN ('tours', 'attractions', 'entertainment-venues')",
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

describe('the held quantity is the person count, for every departure category', () => {
  test.each([
    ['tours', undefined],
    ['attractions', 4],
    ['entertainment-venues', undefined],
  ])(
    '%s: 4 people take 4 places and are charged the per-person price × 4 (guestCount %s)',
    async (categorySlug, guestCount) => {
      const { unitId } = await createDeparture(categorySlug, { capacity: 10 });
      const date = day(10);

      const holdIds = await hold(unitId, date, 4);
      expect(holdIds).toHaveLength(4);
      expect(await placesLeft(unitId, date)).toBe(6);

      const res = await book(holdIds, guestCount);

      expect(res.status).toBe(201);
      expect(res.body.data.total_amount).toBe(
        (PRICE_PER_PERSON * 4).toFixed(2),
      );
      expect(res.body.data.items[0]).toMatchObject({
        quantity: 4,
        unit_price_amount: PRICE_PER_PERSON.toFixed(2),
        guest_count: null,
      });
      expect(await placesLeft(unitId, date)).toBe(6);

      // The booking names its category, so every view can call the people
      // Travelers / Visitors / Participants.
      const detail = await request(app)
        .get(`/api/v1/bookings/${res.body.data.id}`)
        .set('Authorization', `Bearer ${customer}`);
      expect(detail.body.data.listing_category_slug).toBe(categorySlug);
    },
  );
});

describe('a submitted guestCount must equal the held quantity', () => {
  test('hold 1, then guestCount 6 at booking: refused, no booking, the hold and its place stay held', async () => {
    const { unitId } = await createDeparture('tours', { capacity: 10 });
    const date = day(11);
    const holdIds = await hold(unitId, date, 1);
    const [[bookingsBefore]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );

    const res = await book(holdIds, 6);

    expectMismatch(res);
    const [[bookingsAfter]] = await pool.query(
      'SELECT COUNT(*) AS total FROM bookings',
    );
    expect(bookingsAfter.total).toBe(bookingsBefore.total);
    expect(await countFor('reservation_holds', unitId)).toBe(1);
    expect(await placesLeft(unitId, date)).toBe(9);

    // The same, still-active hold can then be booked with a matching count.
    const retry = await book(holdIds, 1);
    expect(retry.status).toBe(201);
    expect(retry.body.data.items[0].quantity).toBe(1);
  });

  test.each([
    ['more people than held', 1, 10],
    ['fewer people than held', 10, 1],
    ['fewer people than held (6 → 1)', 6, 1],
  ])(
    '%s is refused (hold %i, guestCount %i)',
    async (_label, held, guestCount) => {
      const { unitId } = await createDeparture('attractions', { capacity: 10 });
      const holdIds = await hold(unitId, day(12), held);

      expectMismatch(await book(holdIds, guestCount));
      expect(await countFor('reservation_holds', unitId)).toBe(held);
    },
  );

  test('a guestCount equal to the held quantity is accepted', async () => {
    const { unitId } = await createDeparture('entertainment-venues', {
      capacity: 6,
    });
    const holdIds = await hold(unitId, day(13), 3);

    const res = await book(holdIds, 3);

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].quantity).toBe(3);
    expect(res.body.data.total_amount).toBe((PRICE_PER_PERSON * 3).toFixed(2));
  });
});

describe('public search asks for the places booking consumes', () => {
  test('a departure is found only while it has at least as many places as the searched people', async () => {
    const title = `Departure Places Search ${Date.now()}`;
    const { unitId } = await createDeparture('tours', { capacity: 4, title });
    const date = day(14);
    const search = (guests) =>
      request(app).get(
        `/api/v1/search?keyword=${encodeURIComponent(title)}&dateFrom=${date}&dateTo=${date}&guests=${guests}`,
      );
    const found = async (guests) =>
      (await search(guests)).body.data.map((row) => row.id);

    const [[listing]] = await pool.query(
      'SELECT listing_id AS id FROM bookable_units WHERE id = ?',
      [unitId],
    );
    expect(await found(4)).toContain(listing.id);
    expect(await found(5)).not.toContain(listing.id);

    // Booking the same 4 people consumes all 4 places — search agrees.
    const res = await book(await hold(unitId, date, 4), 4);
    expect(res.status).toBe(201);
    expect(await found(1)).not.toContain(listing.id);
  });
});

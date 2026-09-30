/**
 * Step L6.2H2B — the restaurant reservation contract, called through the
 * API directly (the widget is never relied on):
 *
 * - a hold is exactly one reservation slot (quantity 1), whatever the party
 *   size; the party size never consumes inventory;
 * - the party size is required at `POST /bookings`, a whole number from 1
 *   to the SMALLINT UNSIGNED storage ceiling, and is persisted on the item
 *   and returned to the customer, the Partner and an admin;
 * - the reservation is free: no listing price, dining-area price, calendar
 *   override or menu price is charged — the booking and its item total
 *   exactly 0.00 AMD, and a restaurant without any price is still bookable;
 * - it never requires platform payment (`payment_required: false`,
 *   `NOT_REQUIRED_ON_PLATFORM`), and the lifecycle stays PENDING_VENDOR.
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
const RESERVATION_TIME = '19:00';

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let restaurantsCategoryId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

/**
 * A published restaurant with one dining area of `capacity` concurrent
 * reservations. `priced` sets every price a restaurant can carry — the
 * listing's average spend, the dining area's own base price and a menu
 * item — none of which may ever be charged.
 */
async function createRestaurant({ capacity = 2, priced = true } = {}) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [{ languageId, title: `L6.2H2B Restaurant ${Date.now()}` }],
      categoryIds: [restaurantsCategoryId],
      ...(priced && {
        pricing: { modelCode: 'PER_PERSON', amount: 6500, currencyCode: 'AMD' },
      }),
    });
  expect(listingRes.status).toBe(201);
  const listingId = listingRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
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
      bookableUnitType: 'RESTAURANT_TABLE',
      capacity,
      ...(priced && { basePriceAmount: 7000, basePriceCurrency: 'AMD' }),
    });
  expect(unitRes.status).toBe(201);

  if (priced) {
    const menuRes = await request(app)
      .post(`/api/v1/listings/${listingId}/menu`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({ name: 'Dinner' });
    expect(menuRes.status).toBe(201);
    const sectionRes = await request(app)
      .post(`/api/v1/listings/menu/${menuRes.body.data.id}/sections`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({ title: 'Grill' });
    expect(sectionRes.status).toBe(201);
    const itemRes = await request(app)
      .post(`/api/v1/listings/menu/sections/${sectionRes.body.data.id}/items`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        title: 'Khorovats',
        priceAmount: 12000,
        priceCurrencyCode: 'AMD',
      });
    expect(itemRes.status).toBe(201);
  }

  const published = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  expect(published.status).toBe(200);
  return { listingId, unitId: unitRes.body.data.id };
}

/** A calendar price override on `date` — a date price is never charged either. */
async function setDatePrice(unitId, date, amount) {
  const res = await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      unitId,
      dateFrom: date,
      dateTo: date,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: 'AMD',
    });
  expect(res.status).toBeLessThan(300);
}

function hold(unitId, date, extra = {}) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        {
          bookableUnitId: unitId,
          dateFrom: date,
          dateTo: date,
          startTime: RESERVATION_TIME,
          ...extra,
        },
      ],
    });
}

function book(holdIds, item = {}) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [{ holdIds, guests: [], ...item }],
      guestContactSnapshot: GUEST_CONTACT,
    });
}

async function reserve(unitId, date, guestCount) {
  const held = await hold(unitId, date);
  expect(held.status).toBe(201);
  const booked = await book(held.body.data.items[0].hold_ids, { guestCount });
  expect(booked.status).toBe(201);
  return booked.body.data;
}

async function countFor(table, unitId) {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM ${table} WHERE bookable_unit_id = ?`,
    [unitId],
  );
  return total;
}

async function quantityAvailable(unitId, date) {
  const [[row]] = await pool.query(
    'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
    [unitId, date],
  );
  return row?.quantity_available ?? null;
}

async function ledgerDeltas(unitId) {
  const [rows] = await pool.query(
    'SELECT delta FROM inventory_ledger WHERE bookable_unit_id = ? ORDER BY id',
    [unitId],
  );
  return rows.map((row) => row.delta);
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
  const [[category]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'restaurants'",
  );
  restaurantsCategoryId = category.id;
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('restaurant hold — exactly one reservation slot', () => {
  test('a direct hold for 2 slots is rejected before any capacity, ledger or hold write', async () => {
    const { unitId } = await createRestaurant();
    const calendarBefore = await quantityAvailable(unitId, day(10));

    const res = await hold(unitId, day(10), { quantity: 2 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual([
      { field: 'items', issue: 'RESERVATION_QUANTITY_NOT_SUPPORTED' },
    ]);
    expect(await countFor('reservation_holds', unitId)).toBe(0);
    expect(await countFor('inventory_ledger', unitId)).toBe(0);
    expect(await quantityAvailable(unitId, day(10))).toBe(calendarBefore);
  });

  test('party size never consumes inventory: capacity runs out by reservations, not diners', async () => {
    const { unitId } = await createRestaurant({ capacity: 2 });
    const date = day(11);

    const party4 = await reserve(unitId, date, 4);
    expect(party4.items[0].quantity).toBe(1);
    expect(await quantityAvailable(unitId, date)).toBe(1);
    expect(await ledgerDeltas(unitId)).toEqual([-1]);

    await reserve(unitId, date, 100);
    expect(await quantityAvailable(unitId, date)).toBe(0);
    expect(await ledgerDeltas(unitId)).toEqual([-1, -1]);

    const third = await hold(unitId, date);
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('AVAILABILITY_CONFLICT');
  });
});

describe('POST /bookings — the party size contract', () => {
  test('a missing party size is rejected and the hold stays active', async () => {
    const { unitId } = await createRestaurant();
    const held = await hold(unitId, day(12));
    const holdIds = held.body.data.items[0].hold_ids;

    const res = await book(holdIds);

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'items', issue: 'PARTY_SIZE_REQUIRED' },
    ]);
    expect(await countFor('reservation_holds', unitId)).toBe(1);
  });

  test.each([
    ['zero', 0],
    ['negative', -2],
    ['fractional', 2.5],
    ['non-numeric', 'four'],
    ['above the storage ceiling', 65536],
  ])('a %s party size is rejected', async (_label, guestCount) => {
    const { unitId } = await createRestaurant();
    const held = await hold(unitId, day(13));

    const res = await book(held.body.data.items[0].hold_ids, { guestCount });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await countFor('reservation_holds', unitId)).toBe(1);
  });

  test('the storage ceiling itself is accepted and persisted exactly', async () => {
    const { unitId } = await createRestaurant();
    const booking = await reserve(unitId, day(14), 65535);
    expect(booking.items[0].guest_count).toBe(65535);
  });
});

describe('a restaurant reservation is free', () => {
  test('no listing, dining-area, calendar or menu price is charged; party size is persisted and shared', async () => {
    const { unitId } = await createRestaurant();
    const date = day(15);
    await setDatePrice(unitId, date, 9000);

    const booking = await reserve(unitId, date, 4);

    expect(booking.booking_type).toBe('RESTAURANT_RESERVATION');
    expect(booking.status).toBe('PENDING_VENDOR');
    expect(booking.subtotal_amount).toBe('0.00');
    expect(booking.total_amount).toBe('0.00');
    expect(booking.currency).toBe('AMD');
    expect(booking.payment_required).toBe(false);
    expect(booking.payment_status).toBe('NOT_REQUIRED_ON_PLATFORM');
    expect(booking.items[0]).toMatchObject({
      quantity: 1,
      guest_count: 4,
      unit_price_amount: '0.00',
      start_time: RESERVATION_TIME,
      guests: [],
    });

    const [[row]] = await pool.query(
      'SELECT guest_count, unit_price_amount FROM booking_items WHERE booking_id = ?',
      [booking.id],
    );
    expect(row).toEqual({ guest_count: 4, unit_price_amount: '0.00' });

    // The same party size for the customer, the owning Partner and an admin.
    await Promise.all(
      [customer, vendor, admin].map(async (token) => {
        const res = await request(app)
          .get(`/api/v1/bookings/${booking.id}`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.items[0].guest_count).toBe(4);
        expect(res.body.data.total_amount).toBe('0.00');
        expect(res.body.data.payment_required).toBe(false);
      }),
    );
  });

  test('a restaurant with no price at all is still bookable', async () => {
    const { unitId } = await createRestaurant({ priced: false });
    const booking = await reserve(unitId, day(16), 2);
    expect(booking.total_amount).toBe('0.00');
    expect(booking.items[0].guest_count).toBe(2);
  });

  test('a booking with no recorded party size (before migration 0052) serializes as null, never 0', async () => {
    const { unitId } = await createRestaurant();
    const booking = await reserve(unitId, day(17), 3);
    await pool.query(
      'UPDATE booking_items SET guest_count = NULL WHERE booking_id = ?',
      [booking.id],
    );

    const res = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].guest_count).toBeNull();
  });
});

describe('other booking types are unchanged', () => {
  test('a priced tour keeps its charge, stays payable and never stores a guest count', async () => {
    const [[toursCategory]] = await pool.query(
      "SELECT id FROM listing_categories WHERE slug = 'tours'",
    );
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        partnerId,
        listingType: 'TOUR',
        translations: [{ languageId, title: `L6.2H2B Tour ${Date.now()}` }],
        categoryIds: [toursCategory.id],
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
      .send({ listingId, bookableUnitType: 'TOUR_DEPARTURE', capacity: 4 });
    const published = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ publicationPeriodDays: 90 });
    expect(published.status).toBe(200);

    const held = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [
          {
            bookableUnitId: unitRes.body.data.id,
            dateFrom: day(18),
            dateTo: day(18),
            quantity: 2,
          },
        ],
      });
    expect(held.status).toBe(201);
    const booked = await book(held.body.data.items[0].hold_ids, {
      guestCount: 2,
    });

    expect(booked.status).toBe(201);
    expect(booked.body.data.total_amount).toBe('16000.00');
    expect(booked.body.data.payment_required).toBe(true);
    expect(booked.body.data.items[0].guest_count).toBeNull();
  });
});

/**
 * Step L6.2H4 — booking price integrity, called through the API directly:
 *
 * - every hold returns the server quote for exactly what it holds (per item
 *   and for the batch) — the same calculation booking conversion charges;
 * - `POST /bookings` requires each item's accepted quote
 *   (`expectedTotalAmount` + `expectedCurrency`), compares it with the
 *   current canonical price and books only on an exact match. Any change —
 *   up or down, unit price or calendar price, one item or several — is a
 *   409 `PRICE_CHANGED` carrying the complete current quote; nothing is
 *   written and every hold (and the capacity it holds) stays active;
 * - a tampered, malformed, missing or foreign-currency quote never changes
 *   the charge;
 * - non-AMD prices quote, book and persist in their own currency (no 500);
 * - a restaurant quotes and books at 0.00 AMD whatever its prices; a
 *   zero-priced non-restaurant listing books at 0.00 as well;
 * - a successful booking's stored amounts are the accepted quote, and later
 *   price edits never rewrite them.
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
import {
  rememberHoldQuotes,
  quotedItem,
  UNPRICED_HOLD_QUOTE,
} from '../helpers/holdQuotes.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const RESERVATION_TIME = '19:00';
const TOUR_PRICE = 8000;

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
const categoryIds = {};
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

/** Media + location + required policies, then an admin publish. */
async function finishAndPublish(listingId, policyValues = []) {
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      policyValues,
    });
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
}

async function createListing({ listingType, categorySlug, pricing }) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `L6.2H4 ${listingType} ${Date.now()}` },
      ],
      ...(categorySlug && { categoryIds: [categoryIds[categorySlug]] }),
      ...(pricing && { pricing }),
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function registerUnit(listingId, body) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ listingId, ...body });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** A published PER_PERSON tour with `departures` TOUR_DEPARTURE units. */
async function createTour({ amount = TOUR_PRICE, departures = 1 } = {}) {
  const listingId = await createListing({
    listingType: 'TOUR',
    categorySlug: 'tours',
    pricing: { modelCode: 'PER_PERSON', amount, currencyCode: 'AMD' },
  });
  const unitIds = [];
  for (let index = 0; index < departures; index += 1) {
    // Distinct labels: unit registration is idempotent per label.
    // eslint-disable-next-line no-await-in-loop -- units are registered in order.
    const unitId = await registerUnit(listingId, {
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: 10,
      unitLabel: `Departure ${index + 1}`,
    });
    unitIds.push(unitId);
  }
  await finishAndPublish(listingId, [
    { code: 'cancellation_policy', value: 'FLEXIBLE' },
  ]);
  return { listingId, unitId: unitIds[0], unitIds };
}

/** A published hotel whose room type has `capacity` rooms at 10,000 AMD a night. */
async function createHotel({ capacity }) {
  const listingId = await createListing({ listingType: 'HOTEL' });
  const unitId = await registerUnit(listingId, {
    bookableUnitType: 'HOTEL_ROOM',
    capacity,
    basePriceAmount: 10000,
    basePriceCurrency: 'AMD',
  });
  await finishAndPublish(listingId);
  return { listingId, unitId };
}

/** A published, fully priced restaurant (average spend, table price). */
async function createRestaurant() {
  const listingId = await createListing({
    listingType: 'RESTAURANT',
    categorySlug: 'restaurants',
    pricing: { modelCode: 'PER_PERSON', amount: 6500, currencyCode: 'AMD' },
  });
  const unitId = await registerUnit(listingId, {
    bookableUnitType: 'RESTAURANT_TABLE',
    capacity: 2,
    basePriceAmount: 7000,
    basePriceCurrency: 'AMD',
  });
  await finishAndPublish(listingId);
  return { listingId, unitId };
}

async function hold(items) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items });
  expect(res.status).toBe(201);
  return rememberHoldQuotes(res).body.data;
}

function holdItem(unitId, dateFrom, dateTo, quantity = 1, extra = {}) {
  return { bookableUnitId: unitId, dateFrom, dateTo, quantity, ...extra };
}

function book(items) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items, guestContactSnapshot: GUEST_CONTACT });
}

async function setDatePrice(unitId, date, amount, currency = 'AMD') {
  const res = await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      unitId,
      dateFrom: date,
      dateTo: date,
      priceOverrideAmount: amount,
      priceOverrideCurrency: currency,
    });
  expect(res.status).toBe(201);
}

async function setUnitPrice(unitId, amount, currency = 'AMD') {
  const res = await request(app)
    .patch(`/api/v1/availability/units/${unitId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ basePriceAmount: amount, basePriceCurrency: currency });
  expect(res.status).toBe(200);
}

async function activeHoldCount(holdIds) {
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM reservation_holds
     WHERE id IN (${holdIds.map(() => '?').join(', ')}) AND expires_at > UTC_TIMESTAMP(3)`,
    holdIds,
  );
  return total;
}

async function placesLeft(unitId, date) {
  const [[row]] = await pool.query(
    'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
    [unitId, date],
  );
  return row?.quantity_available ?? null;
}

async function bookingCount(listingId) {
  const [[{ total }]] = await pool.query(
    'SELECT COUNT(*) AS total FROM bookings WHERE listing_id = ?',
    [listingId],
  );
  return total;
}

async function storedFinancials(bookingId) {
  const [[booking]] = await pool.query(
    `SELECT b.subtotal_amount, b.total_amount, c.code AS currency
     FROM bookings b JOIN currencies c ON c.id = b.currency_id WHERE b.id = ?`,
    [bookingId],
  );
  const [items] = await pool.query(
    'SELECT unit_price_amount, quantity FROM booking_items WHERE booking_id = ? ORDER BY id',
    [bookingId],
  );
  return { booking, items };
}

function expectPriceChanged(res, details) {
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('PRICE_CHANGED');
  expect(res.body.error.message).toBe(
    'The price changed while you were booking.',
  );
  expect(res.body.error.request_id).toEqual(expect.any(String));
  expect(res.body.error.details).toEqual(details);
}

function expectValidationIssue(res, field, issue) {
  expect(res.status).toBe(422);
  expect(res.body.error.details).toEqual(
    expect.arrayContaining([expect.objectContaining({ field, issue })]),
  );
}

/** The holds, their capacity and the listing's bookings are exactly as before a rejected attempt. */
async function expectNothingWritten({
  listingId,
  unitId,
  date,
  holdIds,
  placesBefore,
}) {
  expect(await bookingCount(listingId)).toBe(0);
  expect(await activeHoldCount(holdIds)).toBe(holdIds.length);
  expect(await placesLeft(unitId, date)).toBe(placesBefore);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  [admin, vendor, customer] = await Promise.all(
    ['admin', 'vendor', 'customer'].map((who) =>
      login(DEV_CREDENTIALS[who].email, DEV_CREDENTIALS[who].password),
    ),
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
    "SELECT id, slug FROM listing_categories WHERE slug IN ('tours', 'restaurants')",
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

describe('POST /booking-holds — the server quote', () => {
  test('a departure quotes its per-person price × the held people count', async () => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(9), day(9), 4)]);

    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '8000.00',
      total_amount: '32000.00',
      currency: 'AMD',
    });
    expect(batch.quote_total).toEqual({ amount: '32000.00', currency: 'AMD' });
  });

  test('a multi-room hotel stay quotes every held room × every night, not one room', async () => {
    const { unitId } = await createHotel({ capacity: 5 });
    const batch = await hold([holdItem(unitId, day(20), day(22), 2)]);

    // 2 nights (checkout-exclusive) at 10,000 per room, 2 rooms.
    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '20000.00',
      total_amount: '40000.00',
      currency: 'AMD',
    });
    const booked = await book([quotedItem(batch.items[0].hold_ids)]);
    expect(booked.status).toBe(201);
    expect(booked.body.data.total_amount).toBe('40000.00');
  });

  test('a restaurant quotes 0.00 AMD whatever its average spend and table price', async () => {
    const { unitId } = await createRestaurant();
    const batch = await hold([
      holdItem(unitId, day(12), day(12), 1, { startTime: RESERVATION_TIME }),
    ]);
    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '0.00',
      total_amount: '0.00',
      currency: 'AMD',
    });
  });

  test('a unit without any price is still held, with a null quote, and books only as PRICING_INCOMPLETE', async () => {
    const listingId = await createListing({ listingType: 'HOTEL' });
    const unitId = await registerUnit(listingId, {
      bookableUnitType: 'HOTEL_ROOM',
      capacity: 1,
    });
    await finishAndPublish(listingId);
    const batch = await hold([holdItem(unitId, day(23), day(24))]);
    expect(batch.items[0].quote).toBeNull();
    expect(batch.quote_total).toBeNull();

    const res = await book([
      quotedItem(batch.items[0].hold_ids, UNPRICED_HOLD_QUOTE),
    ]);
    expectValidationIssue(res, 'items', 'PRICING_INCOMPLETE');
    expect(await activeHoldCount(batch.items[0].hold_ids)).toBe(1);
  });
});

describe('POST /bookings — accepted quote vs current price', () => {
  test('an unchanged quote books, and the stored amounts are exactly the accepted quote', async () => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(10), day(10), 3)]);

    const res = await book([quotedItem(batch.items[0].hold_ids)]);

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('24000.00');
    expect(res.body.data.currency).toBe('AMD');
    expect(res.body.data.items[0].unit_price_amount).toBe('8000.00');
    const stored = await storedFinancials(res.body.data.id);
    expect(stored.booking).toEqual({
      subtotal_amount: '24000.00',
      total_amount: '24000.00',
      currency: 'AMD',
    });
    expect(stored.items).toEqual([
      { unit_price_amount: '8000.00', quantity: 3 },
    ]);
  });

  test.each([
    [
      'a unit price increase',
      (unitId) => setUnitPrice(unitId, 9500),
      '9500.00',
      '19000.00',
    ],
    [
      'a unit price decrease',
      (unitId) => setUnitPrice(unitId, 6000),
      '6000.00',
      '12000.00',
    ],
    [
      'a calendar price increase',
      (unitId, date) => setDatePrice(unitId, date, 15000),
      '15000.00',
      '30000.00',
    ],
    [
      'a calendar price decrease',
      (unitId, date) => setDatePrice(unitId, date, 4000),
      '4000.00',
      '8000.00',
    ],
  ])(
    '%s during the hold is PRICE_CHANGED: no booking, holds and capacity kept',
    async (_label, changePrice, unitPrice, total) => {
      const { listingId, unitId } = await createTour();
      const date = day(11);
      const batch = await hold([holdItem(unitId, date, date, 2)]);
      const { hold_ids: holdIds } = batch.items[0];
      const placesBefore = await placesLeft(unitId, date);
      await changePrice(unitId, date);

      const res = await book([quotedItem(holdIds)]);

      expectPriceChanged(res, [
        {
          field: 'items.0',
          issue: 'PRICE_CHANGED',
          unit_price_amount: unitPrice,
          total_amount: total,
          currency: 'AMD',
        },
      ]);
      await expectNothingWritten({
        listingId,
        unitId,
        date,
        holdIds,
        placesBefore,
      });
    },
  );

  test('accepting the returned quote books at exactly that new price', async () => {
    const { unitId } = await createTour();
    const date = day(12);
    const batch = await hold([holdItem(unitId, date, date, 2)]);
    const { hold_ids: holdIds } = batch.items[0];
    await setDatePrice(unitId, date, 15000);
    const changed = await book([quotedItem(holdIds)]);
    const [current] = changed.body.error.details;

    const res = await book([
      quotedItem(holdIds, {
        expectedTotalAmount: current.total_amount,
        expectedCurrency: current.currency,
      }),
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('30000.00');
    expect(res.body.data.items[0].unit_price_amount).toBe('15000.00');
  });

  test.each([
    ['lower', '1.00'],
    ['higher', '99999.00'],
  ])(
    'a tampered %s expected amount never changes the charge',
    async (_label, tampered) => {
      const { listingId, unitId } = await createTour();
      const date = day(13);
      const batch = await hold([holdItem(unitId, date, date, 2)]);
      const { hold_ids: holdIds } = batch.items[0];
      const placesBefore = await placesLeft(unitId, date);

      const res = await book([
        quotedItem(holdIds, { expectedTotalAmount: tampered }),
      ]);

      expectPriceChanged(res, [
        {
          field: 'items.0',
          issue: 'PRICE_CHANGED',
          unit_price_amount: '8000.00',
          total_amount: '16000.00',
          currency: 'AMD',
        },
      ]);
      await expectNothingWritten({
        listingId,
        unitId,
        date,
        holdIds,
        placesBefore,
      });
      const honest = await book([quotedItem(holdIds)]);
      expect(honest.body.data.total_amount).toBe('16000.00');
    },
  );

  test('the same digits in another configured currency are a changed quote', async () => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(14), day(14), 1)]);

    const res = await book([
      quotedItem(batch.items[0].hold_ids, { expectedCurrency: 'USD' }),
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(res.body.error.details[0].currency).toBe('AMD');
  });

  test('an unconfigured currency code is rejected as UNKNOWN_CURRENCY before any hold is touched', async () => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(14), day(14), 1)]);
    const { hold_ids: holdIds } = batch.items[0];

    const res = await book([quotedItem(holdIds, { expectedCurrency: 'XYZ' })]);

    expectValidationIssue(res, 'items.0.expectedCurrency', 'UNKNOWN_CURRENCY');
    expect(await activeHoldCount(holdIds)).toBe(1);
  });

  test.each([
    ['expectedTotalAmount', { expectedTotalAmount: undefined }],
    ['expectedCurrency', { expectedCurrency: undefined }],
  ])('a missing %s is a 422', async (field, extras) => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(15), day(15), 1)]);
    const { hold_ids: holdIds } = batch.items[0];

    const res = await book([quotedItem(holdIds, extras)]);

    expectValidationIssue(res, `body.items.0.${field}`, 'invalid_type');
    expect(await activeHoldCount(holdIds)).toBe(1);
  });

  test.each([
    '8000',
    '8000.0',
    '8000.000',
    '8e3',
    '-8000.00',
    'NaN',
    'Infinity',
    '',
    ' 8000.00',
    '08000.00',
    '+8000.00',
    '10000000000.00',
  ])('a malformed expected amount %p is a 422', async (amount) => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(15), day(15), 1)]);

    const res = await book([
      quotedItem(batch.items[0].hold_ids, { expectedTotalAmount: amount }),
    ]);

    expectValidationIssue(
      res,
      'body.items.0.expectedTotalAmount',
      'invalid_string',
    );
  });

  test('a JSON number expected amount is a 422, never coerced', async () => {
    const { unitId } = await createTour();
    const batch = await hold([holdItem(unitId, day(15), day(15), 1)]);

    const res = await book([
      quotedItem(batch.items[0].hold_ids, { expectedTotalAmount: 8000 }),
    ]);

    expectValidationIssue(
      res,
      'body.items.0.expectedTotalAmount',
      'invalid_type',
    );
  });

  test('a hold that expires after PRICE_CHANGED fails as HOLD_EXPIRED on retry; nothing is recreated', async () => {
    const { listingId, unitId } = await createTour();
    const date = day(16);
    const batch = await hold([holdItem(unitId, date, date, 1)]);
    const { hold_ids: holdIds } = batch.items[0];
    await setUnitPrice(unitId, 9000);
    const changed = await book([quotedItem(holdIds)]);
    expect(changed.body.error.code).toBe('PRICE_CHANGED');
    await pool.query(
      `UPDATE reservation_holds SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
       WHERE id IN (${holdIds.map(() => '?').join(', ')})`,
      holdIds,
    );

    const res = await book([
      quotedItem(holdIds, { expectedTotalAmount: '9000.00' }),
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HOLD_EXPIRED');
    expect(await bookingCount(listingId)).toBe(0);
  });
});

describe('POST /bookings — several items', () => {
  test('one changed item rejects the whole booking with every item’s current quote', async () => {
    const { listingId, unitIds } = await createTour({ departures: 2 });
    const date = day(17);
    const batch = await hold([
      holdItem(unitIds[0], date, date, 1),
      holdItem(unitIds[1], date, date, 2),
    ]);
    expect(batch.quote_total).toEqual({ amount: '24000.00', currency: 'AMD' });
    await setUnitPrice(unitIds[1], 9000);

    const res = await book(
      batch.items.map((item) => quotedItem(item.hold_ids)),
    );

    expectPriceChanged(res, [
      {
        field: 'items.0',
        issue: 'PRICE_UNCHANGED',
        unit_price_amount: '8000.00',
        total_amount: '8000.00',
        currency: 'AMD',
      },
      {
        field: 'items.1',
        issue: 'PRICE_CHANGED',
        unit_price_amount: '9000.00',
        total_amount: '18000.00',
        currency: 'AMD',
      },
    ]);
    expect(await bookingCount(listingId)).toBe(0);
    expect(
      await activeHoldCount(batch.items.flatMap((item) => item.hold_ids)),
    ).toBe(3);
  });

  test('offsetting item changes with an unchanged booking total are still detected', async () => {
    const { listingId, unitIds } = await createTour({ departures: 2 });
    const date = day(18);
    const batch = await hold([
      holdItem(unitIds[0], date, date, 1),
      holdItem(unitIds[1], date, date, 1),
    ]);
    await setDatePrice(unitIds[0], date, 10000);
    await setDatePrice(unitIds[1], date, 6000);

    const res = await book(
      batch.items.map((item) => quotedItem(item.hold_ids)),
    );

    expect(res.status).toBe(409);
    expect(res.body.error.details.map((detail) => detail.issue)).toEqual([
      'PRICE_CHANGED',
      'PRICE_CHANGED',
    ]);
    expect(await bookingCount(listingId)).toBe(0);
  });
});

describe('currency', () => {
  test('a non-AMD unit price quotes, books and persists in its own currency (no FX 500)', async () => {
    const { listingId, unitId } = await createHotel({ capacity: 2 });
    await setUnitPrice(unitId, '120.50', 'USD');
    const batch = await hold([holdItem(unitId, day(25), day(27), 1)]);
    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '241.00',
      total_amount: '241.00',
      currency: 'USD',
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(batch.items[0].hold_ids)],
        guestContactSnapshot: GUEST_CONTACT,
        // The web always sends the customer's display currency.
        displayCurrencyCode: 'AMD',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('241.00');
    expect(res.body.data.currency).toBe('USD');
    expect(res.body.data.display_currency).toBeNull();
    expect(res.body.data.display_total_amount).toBeNull();
    const stored = await storedFinancials(res.body.data.id);
    expect(stored.booking.currency).toBe('USD');
    expect(await bookingCount(listingId)).toBe(1);
  });

  test('a non-AMD calendar price quotes and books in that currency', async () => {
    const { unitId } = await createTour();
    const date = day(19);
    await setDatePrice(unitId, date, '30.00', 'EUR');
    const batch = await hold([holdItem(unitId, date, date, 2)]);
    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '30.00',
      total_amount: '60.00',
      currency: 'EUR',
    });

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(batch.items[0].hold_ids)],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'USD',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.currency).toBe('EUR');
    expect(res.body.data.total_amount).toBe('60.00');
  });

  test('a calendar price switched to another currency during the hold is PRICE_CHANGED, not a 500', async () => {
    const { unitId } = await createTour();
    const date = day(19);
    const batch = await hold([holdItem(unitId, date, date, 1)]);
    await setDatePrice(unitId, date, '30.00', 'USD');

    const res = await book([quotedItem(batch.items[0].hold_ids)]);

    expectPriceChanged(res, [
      {
        field: 'items.0',
        issue: 'PRICE_CHANGED',
        unit_price_amount: '30.00',
        total_amount: '30.00',
        currency: 'USD',
      },
    ]);
  });

  test('items in different currencies are one clean PRICING_CURRENCY_MISMATCH rejection', async () => {
    const { unitIds } = await createTour({ departures: 2 });
    const date = day(21);
    await setDatePrice(unitIds[1], date, '30.00', 'USD');
    const batch = await hold([
      holdItem(unitIds[0], date, date, 1),
      holdItem(unitIds[1], date, date, 1),
    ]);
    expect(batch.quote_total).toBeNull();

    const res = await book(
      batch.items.map((item) => quotedItem(item.hold_ids)),
    );

    expectValidationIssue(res, 'items', 'PRICING_CURRENCY_MISMATCH');
  });
});

describe('restaurant and zero-price bookings', () => {
  test('a restaurant books at 0.00 AMD after its table and date prices change during the hold', async () => {
    const { unitId } = await createRestaurant();
    const date = day(22);
    const batch = await hold([
      holdItem(unitId, date, date, 1, { startTime: RESERVATION_TIME }),
    ]);
    await setUnitPrice(unitId, 9000);
    await setDatePrice(unitId, date, 11000);

    const res = await book([
      quotedItem(batch.items[0].hold_ids, { guestCount: 4 }),
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('0.00');
    expect(res.body.data.payment_required).toBe(false);
    expect(res.body.data.items[0].guest_count).toBe(4);
  });

  test('a restaurant average-spend change (republished) never triggers a re-quote', async () => {
    const { listingId, unitId } = await createRestaurant();
    const date = day(23);
    const batch = await hold([
      holdItem(unitId, date, date, 1, { startTime: RESERVATION_TIME }),
    ]);
    const unpublished = await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({});
    expect(unpublished.status).toBe(200);
    const edited = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        pricing: {
          modelCode: 'PER_PERSON',
          amount: 25000,
          currencyCode: 'AMD',
        },
      });
    expect(edited.status).toBe(200);
    const republished = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ publicationPeriodDays: 90 });
    expect(republished.status).toBe(200);

    const res = await book([
      quotedItem(batch.items[0].hold_ids, { guestCount: 2 }),
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('0.00');
  });

  test('a zero-priced non-restaurant listing quotes and books at 0.00 with no payment due', async () => {
    const { unitId } = await createTour({ amount: 0 });
    const batch = await hold([holdItem(unitId, day(24), day(24), 2)]);
    expect(batch.items[0].quote).toEqual({
      unit_price_amount: '0.00',
      total_amount: '0.00',
      currency: 'AMD',
    });

    const res = await book([quotedItem(batch.items[0].hold_ids)]);

    expect(res.status).toBe(201);
    expect(res.body.data.booking_type).toBe('TOUR_BOOKING');
    expect(res.body.data.total_amount).toBe('0.00');
    expect(res.body.data.payment_required).toBe(false);
  });
});

describe('financial history', () => {
  test('later unit and calendar price edits never rewrite a booking', async () => {
    const { unitId } = await createTour();
    const date = day(26);
    const batch = await hold([holdItem(unitId, date, date, 2)]);
    const booked = await book([quotedItem(batch.items[0].hold_ids)]);
    expect(booked.status).toBe(201);
    const before = await storedFinancials(booked.body.data.id);

    await setUnitPrice(unitId, 50000);
    await setDatePrice(unitId, date, 70000);

    expect(await storedFinancials(booked.body.data.id)).toEqual(before);
    const detail = await request(app)
      .get(`/api/v1/bookings/${booked.body.data.id}`)
      .set('Authorization', `Bearer ${customer}`);
    expect(detail.body.data.total_amount).toBe('16000.00');
    expect(detail.body.data.items[0].unit_price_amount).toBe('8000.00');
  });
});

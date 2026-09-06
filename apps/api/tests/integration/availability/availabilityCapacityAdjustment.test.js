/**
 * Sprint D-1 (P0-1): `setAvailability`/`updateCalendarEntry` must never let
 * a routine metadata/price/status edit — or an explicit capacity change —
 * silently clobber the REAL `quantity_available` already consumed by a
 * hold, confirmed booking, manual block, or external reservation.
 *
 * Before this fix, `setAvailability` wrote every date's row via
 * `upsertRange`'s single bulk `INSERT ... ON DUPLICATE KEY UPDATE
 * quantity_available = VALUES(quantity_available)`, unconditionally
 * writing `quantityAvailable ?? null` for EVERY date in the range — so
 * omitting it (as any routine price/status-only edit does) reset the
 * column to `NULL`, which the rest of the engine reads back as full,
 * untouched capacity via its `?? defaultCapacity` convention. A partner
 * editing a room's price for a date range that happened to include an
 * already-booked date would silently erase that booking's/hold's/block's/
 * external reservation's tracked consumption, opening the date back up
 * for overbooking. `updateCalendarEntry` had the complementary bug: an
 * *explicit* `quantityAvailable` was written raw, with no lock and no
 * comparison against how much of the unit's capacity was already
 * consumed for that date.
 *
 * These tests reproduce both bugs against real consumption from each of
 * the engine's real sources (a hold, a confirmed booking, a manual block,
 * and a direct external reservation) and then exercise the safe
 * "explicit quantityAvailable = desired TOTAL capacity for the date"
 * contract the fix establishes.
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
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let pool;
let vendor;
let customer;
let partnerId;
let languageId;
let listingId;

const GUEST_CONTACT = {
  fullName: 'P0-1 Test Guest',
  email: 'p01-guest@example.com',
  phone: '+37411111111',
};

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function publishListing(id) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}

async function registerUnit(targetListingId, bookableUnitType = 'HOTEL_ROOM') {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: targetListingId, bookableUnitType });
  return res.body.data.id;
}

async function setCapacity(unitId, capacity) {
  const res = await request(app)
    .patch(`/api/v1/availability/units/${unitId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ capacity });
  expect(res.status).toBe(200);
}

async function getEntry(unitId, date) {
  const res = await request(app)
    .get(`/api/v1/availability?listingId=${listingId}&from=${date}&to=${date}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
  return res.body.data.find((entry) => entry.bookable_unit_id === unitId);
}

async function holdCapacity(unitId, date, quantity) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [
        { bookableUnitId: unitId, dateFrom: date, dateTo: date, quantity },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.items[0].hold_ids;
}

/** Holds 1 unit for [date, date+1] and confirms it into a real PENDING_VENDOR booking. */
async function confirmBooking(unitId, dateFrom, dateTo) {
  // Booking creation requires a resolvable price for the consumed range.
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: 10_000,
      priceOverrideCurrency: 'AMD',
    });

  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  expect(holdRes.status).toBe(201);
  const holdIds = holdRes.body.data.items[0].hold_ids;

  const bookingRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ holdIds, guests: [{ fullName: 'Ada Lovelace' }] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  expect(bookingRes.status).toBe(201);
  return bookingRes.body.data;
}

async function manualBlock(unitId, dateFrom, dateTo, quantity) {
  const res = await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ unitId, dateFrom, dateTo, quantity, reasonCode: 'MAINTENANCE' });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function externalReservation(unitId, dateFrom, dateTo, quantity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/external-reservations')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ unitId, dateFrom, dateTo, quantity, sourceCode: 'PHONE' });
  expect(res.status).toBe(201);
  return res.body.data;
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

  listingId = await createListing(
    `P0-1 Capacity Adjustment Test ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
  );
  const seedUnitId = await registerUnit(listingId);
  await publishListing(listingId);
  await setCapacity(seedUnitId, 5);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('P0-1 — routine setAvailability edits never clobber consumed capacity', () => {
  test('A) a price-only edit preserves capacity consumed by a hold', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-01';
    await holdCapacity(unitId, date, 2);

    const before = await getEntry(unitId, date);
    expect(before.quantity_available).toBe(3);

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: date,
        dateTo: date,
        priceOverrideAmount: 12000,
        priceOverrideCurrency: 'AMD',
      });
    expect(res.status).toBe(201);

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(3);
    expect(Number(after.price_override_amount)).toBe(12000);
  });

  test('B) a status-only edit preserves capacity consumed by a hold', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-02';
    await holdCapacity(unitId, date, 2);

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, status: 'AVAILABLE' });
    expect(res.status).toBe(201);

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(3);
  });

  test('C) an explicit capacity increase works safely', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-03';
    await holdCapacity(unitId, date, 2);

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, quantityAvailable: 8 });
    expect(res.status).toBe(201);

    // consumedSoFar = 2, requested total capacity = 8 -> new remaining = 6.
    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(6);
  });

  test('D) an explicit capacity decrease above the consumed amount works', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-04';
    await holdCapacity(unitId, date, 2);

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, quantityAvailable: 3 });
    expect(res.status).toBe(201);

    // consumedSoFar = 2, requested total capacity = 3 -> new remaining = 1.
    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(1);
  });

  test('E) an explicit capacity decrease below the consumed amount is rejected', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-05';
    await holdCapacity(unitId, date, 4);

    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, quantityAvailable: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_CONSUMED');

    // Rejected write must not have partially applied.
    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(1);
  });

  test('F) an active hold remains consumed after an unrelated edit', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-06';
    await holdCapacity(unitId, date, 3);

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, status: 'AVAILABLE' });

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(2);
  });

  test('G) a confirmed booking remains consumed after an unrelated edit', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const dateFrom = '2027-03-10';
    const dateTo = '2027-03-11';
    const booking = await confirmBooking(unitId, dateFrom, dateTo);
    expect(booking.status).toBe('PENDING_VENDOR');

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom,
        dateTo,
        priceOverrideAmount: 9000,
        priceOverrideCurrency: 'AMD',
      });

    // Checkout-exclusive semantics: only the check-in night is consumed.
    const after = await getEntry(unitId, dateFrom);
    expect(after.quantity_available).toBe(4);
  });

  test('H) a manual block remains consumed after an unrelated edit', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-12';
    await manualBlock(unitId, date, date, 2);

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, status: 'AVAILABLE' });

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(3);
  });

  test('I) an external reservation remains consumed after an unrelated edit', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const dateFrom = '2027-03-13';
    const dateTo = '2027-03-14';
    await externalReservation(unitId, dateFrom, dateTo, 1);

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom,
        dateTo,
        priceOverrideAmount: 15000,
        priceOverrideCurrency: 'AMD',
      });

    const after = await getEntry(unitId, dateFrom);
    expect(after.quantity_available).toBe(4);
  });

  test('J) the ledger remains coherent after an explicit capacity mutation', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-15';
    await holdCapacity(unitId, date, 2);

    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: date, dateTo: date, quantityAvailable: 4 });

    const ledgerRes = await request(app)
      .get(`/api/v1/availability/units/${unitId}/ledger`)
      .query({ from: date, to: date })
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(ledgerRes.status).toBe(200);
    const entries = ledgerRes.body.data;

    // hold (-2) then the explicit adjustment: consumedSoFar=2,
    // requested total=4 -> newRemaining=2, delta = 2 - 3 = -1.
    const adjustmentEntry = entries.find((e) => e.source_type === 'ADJUSTMENT');
    expect(adjustmentEntry).toBeDefined();
    expect(adjustmentEntry.delta).toBe(-1);
    expect(adjustmentEntry.quantity_after).toBe(2);

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(2);
  });
});

describe('P0-1 — updateCalendarEntry (PATCH /availability/:id) never clobbers consumed capacity', () => {
  test('an explicit quantityAvailable is reinterpreted as total capacity, not a raw overwrite', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-20';
    await holdCapacity(unitId, date, 2);

    const entry = await getEntry(unitId, date);
    expect(entry.quantity_available).toBe(3);

    const res = await request(app)
      .patch(`/api/v1/availability/${entry.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ quantityAvailable: 5 });
    expect(res.status).toBe(200);
    // consumedSoFar = 2, requested total = 5 -> new remaining = 3.
    expect(res.body.data.quantity_available).toBe(3);
  });

  test('an explicit quantityAvailable below the consumed amount is rejected with 409', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-21';
    await holdCapacity(unitId, date, 4);
    const entry = await getEntry(unitId, date);

    const res = await request(app)
      .patch(`/api/v1/availability/${entry.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ quantityAvailable: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_CONSUMED');

    const after = await getEntry(unitId, date);
    expect(after.quantity_available).toBe(1);
  });

  test('a status-only PATCH (no quantityAvailable) preserves consumed capacity unchanged', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const date = '2027-03-22';
    await holdCapacity(unitId, date, 2);
    const entry = await getEntry(unitId, date);

    const res = await request(app)
      .patch(`/api/v1/availability/${entry.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(200);
    expect(res.body.data.quantity_available).toBe(3);
  });

  test('still supports the pre-existing "set to 0 on a fresh row" case', async () => {
    const unitId = await registerUnit(listingId);
    await setCapacity(unitId, 5);
    const createRes = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: '2027-03-23', dateTo: '2027-03-23' });
    const entryId = createRes.body.data[0].id;

    const res = await request(app)
      .patch(`/api/v1/availability/${entryId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'BLOCKED', quantityAvailable: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.quantity_available).toBe(0);
  });
});

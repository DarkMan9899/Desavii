/**
 * Phase 17 §60/§61 — regression coverage for the accommodation
 * date-semantics fix (`core/domain/accommodationDateSemantics.js`).
 *
 * Proves the fix is scoped exactly as required: `HOTEL_ROOM`/
 * `PROPERTY_UNIT` (lodging) consume checkout-exclusive nights — a
 * request spanning `[2026-10-10, 2026-10-13]` occupies Oct 10-12, and
 * Oct 13 (checkout day) stays fully available for the next guest — while
 * `VEHICLE` (and every other non-accommodation type) keeps the
 * platform's original inclusive-both-ends "duration" semantics over the
 * exact same date range. Covers the two write paths that consume
 * capacity through `AvailabilityService`'s shared choke points:
 * holds (`reserveCapacity`) and manual blocks
 * (`#consumeCapacityForRange`), plus restoring a hold
 * (`#restoreCapacityForRange`).
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

let vendor;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

// Step L6.2B: each unit type is registered on its own listing type.
async function createListing(title, listingType = 'HOTEL') {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType,
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function registerUnit(listingId, bookableUnitType, capacity = 3) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType, capacity });
  return res.body.data.id;
}

async function breakdownFor(unitId, date) {
  const res = await request(app)
    .get(`/api/v1/availability/units/${unitId}/breakdown`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .query({ from: date, to: date });
  return res.body.data[0];
}

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
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Accommodation date semantics — HOTEL_ROOM/PROPERTY_UNIT are checkout-exclusive', () => {
  test('a hold spanning 3 calendar days occupies only the 2 nights, leaving checkout day fully available', async () => {
    const listingId = await createListing(`Nights Hold Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 'HOTEL_ROOM', 3);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2026-10-10',
            dateTo: '2026-10-13',
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    const [checkIn, night2, checkoutDay] = await Promise.all([
      breakdownFor(unitId, '2026-10-10'),
      breakdownFor(unitId, '2026-10-12'),
      breakdownFor(unitId, '2026-10-13'),
    ]);
    expect(checkIn).toMatchObject({ total: 3, available: 2, held: 1 });
    expect(night2).toMatchObject({ total: 3, available: 2, held: 1 });
    // Checkout day (Oct 13) is never occupied — full capacity remains.
    expect(checkoutDay).toMatchObject({ total: 3, available: 3, held: 0 });
  });

  test('a manual block spanning check-in to checkout also excludes the checkout day', async () => {
    const listingId = await createListing(
      `Nights Block Test ${Date.now()}`,
      'PROPERTY',
    );
    const unitId = await registerUnit(listingId, 'PROPERTY_UNIT', 2);

    const blockRes = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-11-05',
        dateTo: '2026-11-08',
        quantity: 2,
        reasonCode: 'OWNER_USE',
      });
    expect(blockRes.status).toBe(201);

    const [firstNight, lastNight, checkoutDay] = await Promise.all([
      breakdownFor(unitId, '2026-11-05'),
      breakdownFor(unitId, '2026-11-07'),
      breakdownFor(unitId, '2026-11-08'),
    ]);
    expect(firstNight.manual).toBe(2);
    expect(lastNight.manual).toBe(2);
    expect(checkoutDay.manual).toBe(0);
  });

  test('releasing a hold restores exactly the nights it consumed, not the checkout day', async () => {
    const listingId = await createListing(`Nights Release Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 'HOTEL_ROOM', 1);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2026-12-01',
            dateTo: '2026-12-04',
            quantity: 1,
          },
        ],
      });
    const holdIds = holdRes.body.data.items[0].hold_ids;

    const releaseRes = await request(app)
      .delete('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ holdIds });
    expect(releaseRes.status).toBe(200);

    const [night1, night2, checkoutDay] = await Promise.all([
      breakdownFor(unitId, '2026-12-01'),
      breakdownFor(unitId, '2026-12-03'),
      breakdownFor(unitId, '2026-12-04'),
    ]);
    // Fully restored to the unit's total capacity on every occupied night,
    // and the never-touched checkout day was already fully available.
    expect(night1.available).toBe(1);
    expect(night2.available).toBe(1);
    expect(checkoutDay.available).toBe(1);
  });

  test('a same-day accommodation hold (dateFrom === dateTo) is a genuine 1-day hold, not zero nights', async () => {
    const listingId = await createListing(`Same Day Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 'HOTEL_ROOM', 1);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2027-01-15',
            dateTo: '2027-01-15',
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    const day = await breakdownFor(unitId, '2027-01-15');
    expect(day).toMatchObject({ total: 1, available: 0, held: 1 });
  });
});

describe('Non-accommodation date semantics — unchanged, inclusive-both-ends', () => {
  test('a VEHICLE hold spanning the same 3-day range occupies all 3 calendar days, including the return day', async () => {
    const listingId = await createListing(
      `Vehicle Duration Test ${Date.now()}`,
      'CAR_RENTAL',
    );
    const unitId = await registerUnit(listingId, 'VEHICLE', 2);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2026-10-10',
            dateTo: '2026-10-13',
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    const [pickupDay, middleDay, returnDay] = await Promise.all([
      breakdownFor(unitId, '2026-10-10'),
      breakdownFor(unitId, '2026-10-12'),
      breakdownFor(unitId, '2026-10-13'),
    ]);
    // Unlike lodging, the last requested day (the return day) is
    // genuinely occupied — the rental isn't returned until then.
    expect(pickupDay).toMatchObject({ total: 2, available: 1, held: 1 });
    expect(middleDay).toMatchObject({ total: 2, available: 1, held: 1 });
    expect(returnDay).toMatchObject({ total: 2, available: 1, held: 1 });
  });

  test('a manual block on a TOUR_DEPARTURE unit spanning a date range is unaffected — still inclusive', async () => {
    const listingId = await createListing(
      `Tour Duration Test ${Date.now()}`,
      'TOUR',
    );
    const unitId = await registerUnit(listingId, 'TOUR_DEPARTURE', 4);

    const blockRes = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-11-05',
        dateTo: '2026-11-08',
        quantity: 4,
        reasonCode: 'OPERATIONAL',
      });
    expect(blockRes.status).toBe(201);

    const [firstDay, lastDay] = await Promise.all([
      breakdownFor(unitId, '2026-11-05'),
      breakdownFor(unitId, '2026-11-08'),
    ]);
    expect(firstDay.manual).toBe(4);
    expect(lastDay.manual).toBe(4);
  });
});

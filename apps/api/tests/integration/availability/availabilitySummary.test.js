/**
 * Phase 17 §Listing Detail — `GET /availability/:listingId/availability-summary`,
 * the public, customer-safe bucketed summary ("Available"/"Only N left"/
 * "Sold out") backed by the real Inventory Engine. Mirrors
 * `availabilityCalendar.test.js`'s fixture style.
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
let admin;
let vendor;
let partnerId;
let languageId;

let plentyListingId; // capacity 20, no blocks -> AVAILABLE, no exact count
let lowListingId; // capacity 6, blocked down to 3 -> LOW, remaining_count 3
let soldOutListingId; // capacity 2, fully blocked -> SOLD_OUT
let blackoutListingId; // capacity 20, but blackout-vetoed -> SOLD_OUT
let draftListingId;
let multiUnitListingId;
let lowUnitId;
let partiallyBookedListingId; // capacity 10 across 10 days, only 1 day fully blocked -> AVAILABLE, not SOLD_OUT

const FROM = '2026-10-01';
const WIDE_FROM = '2026-11-01';
const WIDE_TO = '2026-11-10';
const WIDE_ONE_SOLD_OUT_DAY = '2026-11-05';
const TO = '2026-10-03';

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

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

async function registerUnit(
  targetListingId,
  capacity,
  bookableUnitType = 'HOTEL_ROOM',
) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: targetListingId, bookableUnitType, capacity });
  return res.body.data.id;
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });
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

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;

  plentyListingId = await createListing(`Summary Plenty ${Date.now()}`);
  await registerUnit(plentyListingId, 20);
  await publishListing(plentyListingId);

  lowListingId = await createListing(`Summary Low ${Date.now()}`);
  lowUnitId = await registerUnit(lowListingId, 6);
  await publishListing(lowListingId);
  // Consume 3 of 6 -> 3 remaining across the whole FROM..TO span.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: lowUnitId,
      dateFrom: FROM,
      dateTo: TO,
      quantity: 3,
      reasonCode: 'MAINTENANCE',
    });

  soldOutListingId = await createListing(`Summary Sold Out ${Date.now()}`);
  const soldOutUnitId = await registerUnit(soldOutListingId, 2);
  await publishListing(soldOutListingId);
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: soldOutUnitId,
      dateFrom: FROM,
      // A HOTEL_ROOM block's *consumed* range excludes the checkout day
      // (`resolveConsumedRange` — checkout morning isn't an occupied
      // night), so blocking through TO itself would leave TO's calendar
      // day untouched and genuinely open. One day past TO makes the
      // consumed range exactly [FROM, TO], matching the summary query
      // window below and actually depleting every day in it.
      dateTo: '2026-10-04',
      quantity: 2,
      reasonCode: 'MAINTENANCE',
    });

  blackoutListingId = await createListing(`Summary Blackout ${Date.now()}`);
  await registerUnit(blackoutListingId, 20);
  await publishListing(blackoutListingId);
  await request(app)
    .post('/api/v1/availability/blackouts')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: blackoutListingId, dateFrom: FROM, dateTo: TO });

  draftListingId = await createListing(`Summary Draft ${Date.now()}`);
  await registerUnit(draftListingId, 5);

  multiUnitListingId = await createListing(`Summary Multi Unit ${Date.now()}`);
  await registerUnit(multiUnitListingId, 20, 'HOTEL_ROOM');
  await registerUnit(multiUnitListingId, 20, 'RESTAURANT_TABLE');
  await publishListing(multiUnitListingId);

  // Regression fixture for the availability-state-contradiction fix: a
  // wide window (10 days) where only ONE day is genuinely, fully booked
  // and every other day is wide open — the exact real-world shape that
  // used to collapse to a flatly wrong SOLD_OUT (see this suite's
  // "one fully booked day..." test below). `VEHICLE` keeps the plain
  // inclusive-both-ends duration semantics (no accommodation checkout-day
  // exclusion), so the block's requested range maps 1:1 onto consumed
  // calendar days.
  partiallyBookedListingId = await createListing(
    `Summary Partially Booked ${Date.now()}`,
  );
  const partiallyBookedUnitId = await registerUnit(
    partiallyBookedListingId,
    10,
    'VEHICLE',
  );
  await publishListing(partiallyBookedListingId);
  // Block only the single middle day of the 10-day window — every other
  // day in WIDE_FROM..WIDE_TO stays at full capacity.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: partiallyBookedUnitId,
      dateFrom: WIDE_ONE_SOLD_OUT_DAY,
      dateTo: WIDE_ONE_SOLD_OUT_DAY,
      quantity: 10,
      reasonCode: 'MAINTENANCE',
    });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /availability/:listingId/availability-summary', () => {
  test('plenty of capacity buckets to AVAILABLE with no exact count exposed', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${plentyListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        unit_id: expect.any(Number),
        bookable_unit_type: 'HOTEL_ROOM',
        availability_status: 'AVAILABLE',
        remaining_count: null,
      },
    ]);
  });

  test('low remaining capacity buckets to LOW with the exact minimum-across-range count', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${lowListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        unit_id: lowUnitId,
        bookable_unit_type: 'HOTEL_ROOM',
        availability_status: 'LOW',
        remaining_count: 3,
      },
    ]);
  });

  test('fully consumed capacity buckets to SOLD_OUT', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${soldOutListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      availability_status: 'SOLD_OUT',
      remaining_count: 0,
    });
  });

  test('a single fully booked day inside a wide-open window buckets to AVAILABLE, never SOLD_OUT (availability-state-contradiction fix)', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${partiallyBookedListingId}/availability-summary?from=${WIDE_FROM}&to=${WIDE_TO}`,
    );
    expect(res.status).toBe(200);
    // 9 of 10 days genuinely have full stock; only one specific day is
    // sold out. Before the fix, the MIN across the whole window was
    // dragged to 0 by that one day, reporting the unit as flatly
    // SOLD_OUT — directly contradicting a same-pipeline day-status read
    // that would have shown 9 of 10 days open right next to it.
    expect(res.body.data[0]).toMatchObject({
      availability_status: 'AVAILABLE',
      remaining_count: null,
    });

    // The day-status endpoint (the other half of the same source of
    // truth) must agree: exactly one SOLD_OUT day, the rest AVAILABLE.
    const unitId = res.body.data[0].unit_id;
    const dayStatusRes = await request(app).get(
      `/api/v1/availability/${partiallyBookedListingId}/day-status?from=${WIDE_FROM}&to=${WIDE_TO}&unitId=${unitId}`,
    );
    expect(dayStatusRes.status).toBe(200);
    const soldOutDays = dayStatusRes.body.data.filter(
      (day) => day.availability_status === 'SOLD_OUT',
    );
    expect(soldOutDays).toHaveLength(1);
    expect(soldOutDays[0].date).toBe(WIDE_ONE_SOLD_OUT_DAY);
  });

  test('a listing-level blackout veto over the whole range also buckets to SOLD_OUT', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${blackoutListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      availability_status: 'SOLD_OUT',
      remaining_count: 0,
    });
  });

  test('a multi-unit listing returns one summary entry per unit, no ambiguity error', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${multiUnitListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(
      res.body.data.every((row) => row.availability_status === 'AVAILABLE'),
    ).toBe(true);
  });

  test('a draft listing 404s for an anonymous caller (same masking as the calendar endpoint)', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${draftListingId}/availability-summary?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(404);
  });

  test('missing from/to is rejected with 422', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${plentyListingId}/availability-summary`,
    );
    expect(res.status).toBe(422);
  });
});

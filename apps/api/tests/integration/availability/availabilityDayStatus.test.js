/**
 * Phase 18 (Premium Listing Detail — Availability UX fix) —
 * `GET /availability/:listingId/day-status`, the per-day counterpart to
 * `availabilitySummary.test.js`'s span-collapsed endpoint. The whole
 * point of this endpoint is proving day-level granularity: a single
 * blocked day inside an otherwise-open range must show up as SOLD_OUT
 * for THAT day only, not collapse the entire response to SOLD_OUT the
 * way `/availability-summary`'s min-across-range design intentionally
 * does. Mirrors `availabilitySummary.test.js`'s fixture style.
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
let partnerId;
let languageId;

let listingId;
let unitId;
let multiUnitListingId;
let draftListingId;

const FROM = '2026-11-01';
const MIDDLE = '2026-11-02';
const TO = '2026-11-03';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
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
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
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

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;

  listingId = await createListing(`Day Status ${Date.now()}`);
  // Capacity 10 (above LOW_STOCK_THRESHOLD=5) so the two unblocked days
  // bucket cleanly to AVAILABLE — a lower capacity would itself bucket
  // to LOW even with zero consumption, muddying the day-granularity proof.
  unitId = await registerUnit(listingId, 10);
  await publishListing(listingId);
  // Block the full 10 units, but only on the MIDDLE day — FROM and TO
  // stay completely open.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom: MIDDLE,
      dateTo: MIDDLE,
      quantity: 10,
      reasonCode: 'MAINTENANCE',
    });

  multiUnitListingId = await createListing(
    `Day Status Multi Unit ${Date.now()}`,
  );
  await registerUnit(multiUnitListingId, 20, 'HOTEL_ROOM');
  await registerUnit(multiUnitListingId, 20, 'RESTAURANT_TABLE');
  await publishListing(multiUnitListingId);

  draftListingId = await createListing(`Day Status Draft ${Date.now()}`);
  await registerUnit(draftListingId, 5);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /availability/:listingId/day-status', () => {
  test('only the specifically blocked day is SOLD_OUT — the surrounding days stay AVAILABLE (proves day-level granularity, not span-collapsing)', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/day-status?from=${FROM}&to=${TO}&unitId=${unitId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { date: FROM, availability_status: 'AVAILABLE', remaining_count: null },
      {
        date: MIDDLE,
        availability_status: 'SOLD_OUT',
        remaining_count: 0,
      },
      { date: TO, availability_status: 'AVAILABLE', remaining_count: null },
    ]);
  });

  test('a listing with more than one unit requires unitId (AMBIGUOUS_UNIT), same convention as /calendar', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${multiUnitListingId}/day-status?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'unitId', issue: 'AMBIGUOUS_UNIT' },
    ]);
  });

  test('a draft listing 404s for an anonymous caller (same masking as every other public availability read)', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${draftListingId}/day-status?from=${FROM}&to=${TO}`,
    );
    expect(res.status).toBe(404);
  });

  test('missing from/to is rejected with 422', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/day-status`,
    );
    expect(res.status).toBe(422);
  });
});

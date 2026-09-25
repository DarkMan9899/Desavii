/**
 * Stage 15.6 (Admin AI): a real end-to-end pass — two real listings with
 * near-duplicate titles from the same partner genuinely surface in the
 * moderation queue, a non-admin principal is genuinely refused, and the
 * usage dashboard genuinely reflects AI calls already made by earlier
 * tests in this same run (via the shared `ai_usage_logs` table).
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

let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let yerevanCityId;
let listingIdA;
let listingIdB;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function createPublishedListing(title) {
  // Step L1: `categoryIds` must be set at creation — the primary
  // category is immutable afterward (`updateListingSchema` no longer
  // accepts it), so it can no longer be assigned via a later PATCH the
  // way this fixture originally deferred it.
  const [[hotelsCategory]] = await getMysqlPool().query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title, description: 'A test listing.' }],
      categoryIds: [hotelsCategory.id],
      location: { cityId: yerevanCityId },
    });
  const listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      pricing: { modelCode: 'PER_NIGHT', amount: 100, currencyCode: 'AMD' },
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });

  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(pngBuffer);

  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });

  const publishRes = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });
  if (publishRes.status !== 200) {
    throw new Error(
      `Fixture listing failed to publish: ${JSON.stringify(publishRes.body)}`,
    );
  }
  return listingId;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

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

  const pool = getMysqlPool();
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

  const suffix = Date.now();
  listingIdA = await createPublishedListing(
    `Admin AI Duplicate Fixture Hotel ${suffix}`,
  );
  listingIdB = await createPublishedListing(
    `Admin AI Duplicate Fixture Hotel Deluxe ${suffix}`,
  );
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Admin AI moderation', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/ai/admin/moderation-queue');
    expect(res.status).toBe(401);
  });

  test('a customer without ai.admin_tools is refused', async () => {
    const res = await request(app)
      .get('/api/v1/ai/admin/moderation-queue')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('surfaces the real near-duplicate-title pair for an admin', async () => {
    const res = await request(app)
      .get('/api/v1/ai/admin/moderation-queue')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    const entryIds = res.body.data.entries.map((e) => e.listing_id);
    expect(entryIds).toEqual(expect.arrayContaining([listingIdA, listingIdB]));
    const entryA = res.body.data.entries.find(
      (e) => e.listing_id === listingIdA,
    );
    expect(entryA.signals).toContain('POSSIBLE_DUPLICATE_TITLE');
  });

  test('scores a single listing, combining the real heuristic score with an AI note', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/admin/moderation/${listingIdA}/score`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listing_id).toBe(listingIdA);
    expect(res.body.data.heuristic_score).toEqual(expect.any(Number));
    expect(res.body.data.ai_note).toEqual(expect.any(String));
  });
});

describe('Admin AI usage dashboard', () => {
  test('a customer without ai.usage_view is refused', async () => {
    const res = await request(app)
      .get('/api/v1/ai/admin/usage')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('reflects real AI calls already logged by earlier tests in this run', async () => {
    const res = await request(app)
      .get('/api/v1/ai/admin/usage')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.stats)).toBe(true);
    expect(Array.isArray(res.body.data.recent)).toBe(true);
    expect(res.body.data.recent.length).toBeGreaterThan(0);
  });
});

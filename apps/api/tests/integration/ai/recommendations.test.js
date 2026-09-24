/**
 * Stage 15.4 (AI Recommendations): a real end-to-end pass — a favorited,
 * real, published listing builds this customer's real category/city
 * affinity in `ai_user_memory` (via the existing `FAVORITE_ADDED` ->
 * `aiListener.js` chain from Stage 15.0), and `GET /ai/recommendations`
 * genuinely surfaces published listings from that same category/city,
 * proving personalization is built from real behavior, not fabricated.
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
let listingId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
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
  // A dedicated, throwaway customer — not the shared DEV_CREDENTIALS.customer
  // account, which accumulates real completed bookings from other
  // integration test files (e.g. bookingLifecycle.test.js) when the full
  // suite runs against the same database. This test's "no completed
  // bookings yet" assumption must hold regardless of what else ran before
  // it, so it needs a customer whose booking history it fully controls.
  const customerEmail = `ai-recommendations-fixture-${Date.now()}@example.com`;
  const customerPassword = 'AiRecFixture!2024';
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: customerEmail,
    password: customerPassword,
    firstName: 'Recommendations',
    lastName: 'Fixture',
  });
  customer = { accessToken: registerRes.body.data.access_token };

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
  const [[hotelsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );

  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `AI Recommendations Fixture Hotel ${Date.now()}`,
          description: 'A test listing.',
        },
      ],
      categoryIds: [hotelsCategory.id],
      location: { cityId: yerevanCityId },
    });
  listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      pricing: { modelCode: 'PER_NIGHT', amount: 120, currencyCode: 'AMD' },
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
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('AI Recommendations', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/ai/recommendations');
    expect(res.status).toBe(401);
  });

  test('returns an honest empty result before any affinity signal exists', async () => {
    const res = await request(app)
      .get('/api/v1/ai/recommendations')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.listings).toEqual([]);
    expect(res.body.data.based_on).toBeNull();
  });

  test('surfaces real published listings from the same category/city after a real favorite event', async () => {
    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });

    // The event bus dispatches asynchronously (Promise.allSettled inside
    // publish()) — a short, bounded wait lets the FAVORITE_ADDED handler
    // finish writing ai_user_memory before the assertion below reads it.
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });

    const res = await request(app)
      .get('/api/v1/ai/recommendations')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.listings.some((listing) => listing.id === listingId),
    ).toBe(true);
    expect(res.body.data.based_on.city).toBe('Yerevan');
    // No completed bookings exist for this fixture customer — the budget
    // signal must stay honestly null, never a fabricated figure.
    expect(res.body.data.based_on.typical_budget).toBeNull();
    expect(res.body.data.blurb).toEqual(expect.any(String));
    expect(res.body.data.blurb.length).toBeGreaterThan(0);
  });
});

/**
 * Stage 15.1 (AI Trip Planner): a real end-to-end pass — a published,
 * priced listing (created via the real Listings API, mirroring
 * `tests/integration/search/searchListings.test.js`'s fixture pattern)
 * is genuinely returned inside the generated itinerary, proving the
 * grounding data is real, not fabricated. Also covers `/ai/memory`.
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
          title: `AI Trip Planner Fixture Hotel ${Date.now()}`,
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

  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('AI Trip Planner', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/ai/trip-planner')
      .send({ destination: 'Yerevan', days: 2, budget: 500 });
    expect(res.status).toBe(401);
  });

  test('generates a real itinerary grounded in the real published listing', async () => {
    const res = await request(app)
      .post('/api/v1/ai/trip-planner')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ destination: 'Yerevan', days: 2, budget: 1000, currency: 'AMD' });

    expect(res.status).toBe(201);
    expect(res.body.data.destination).toBe('Yerevan');
    expect(res.body.data.conversation_id).toEqual(expect.any(Number));
    expect(res.body.data.narrative).toEqual(expect.any(String));
    expect(res.body.data.narrative.length).toBeGreaterThan(0);

    const allListingIds = res.body.data.daily_plan.flatMap((day) =>
      day.listings.map((listing) => listing.id),
    );
    expect(allListingIds).toContain(listingId);
    expect(res.body.data.total_estimated_budget).toBeLessThanOrEqual(1000);
  });

  test('the generated conversation is retrievable and owned by the requester', async () => {
    const planRes = await request(app)
      .post('/api/v1/ai/trip-planner')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ destination: 'Yerevan', days: 1, budget: 500 });
    const conversationId = planRes.body.data.conversation_id;

    const getRes = await request(app)
      .get(`/api/v1/ai/trip-planner/${conversationId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.feature_code).toBe('trip_planner');
    expect(getRes.body.data.messages).toHaveLength(2);
    expect(getRes.body.data.messages[0].role).toBe('user');
    expect(getRes.body.data.messages[1].role).toBe('assistant');
  });

  test("another user cannot read someone else's trip-planner conversation", async () => {
    const planRes = await request(app)
      .post('/api/v1/ai/trip-planner')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ destination: 'Yerevan', days: 1, budget: 500 });
    const conversationId = planRes.body.data.conversation_id;

    const getRes = await request(app)
      .get(`/api/v1/ai/trip-planner/${conversationId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(getRes.status).toBe(404);
  });

  test('rejects an out-of-range trip length', async () => {
    const res = await request(app)
      .post('/api/v1/ai/trip-planner')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ destination: 'Yerevan', days: 0, budget: 500 });
    expect(res.status).toBe(422);
  });
});

describe('AI memory', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/ai/memory');
    expect(res.status).toBe(401);
  });

  test("lists the requester's own memory (empty for a fresh account) and deletes a key idempotently", async () => {
    const listRes = await request(app)
      .get('/api/v1/ai/memory')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const deleteRes = await request(app)
      .delete('/api/v1/ai/memory/destination_affinity:does-not-exist')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(deleteRes.status).toBe(204);
  });
});

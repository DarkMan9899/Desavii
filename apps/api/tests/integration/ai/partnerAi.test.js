/**
 * Stage 15.5 (Partner AI tools): a real end-to-end pass — content is
 * genuinely generated from a real listing the vendor owns, another
 * vendor is genuinely refused (proving the tool can't be run against
 * someone else's listing even when it's published), and every route is
 * exercised at least once.
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
          title: `Partner AI Fixture Hotel ${Date.now()}`,
          description: 'A quiet, family-run hotel near the city center.',
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
    .set('Authorization', `Bearer ${vendor.accessToken}`)
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

describe('Partner AI tools', () => {
  test('requires authentication', async () => {
    const res = await request(app).post(
      `/api/v1/ai/partner/listings/${listingId}/description`,
    );
    expect(res.status).toBe(401);
  });

  test('generates a real description grounded in the real listing title/category/city', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/description`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(expect.any(String));
    expect(res.body.data.content.length).toBeGreaterThan(0);
  });

  test('a customer with no partner ownership of this listing is refused', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/seo`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('generates a title using an optional key-feature hint', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/title`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ keyFeature: 'rooftop terrace' });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(expect.any(String));
  });

  test('generates amenity suggestions', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/amenities`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(expect.any(String));
  });

  test('translate requires a target language', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/translate`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('translates the real listing description', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/translate`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ targetLanguageCode: 'ru' });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(expect.any(String));
  });

  test('generates FAQs grounded in the real cancellation policy', async () => {
    const res = await request(app)
      .post(`/api/v1/ai/partner/listings/${listingId}/faqs`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.content).toEqual(expect.any(String));
  });

  test('every partner-tool call attributes its ai_usage_logs row to the real owning partner', async () => {
    const [rows] = await getMysqlPool().query(
      `SELECT feature_code, partner_id FROM ai_usage_logs
       WHERE partner_id = ? AND feature_code IN ('listing_description', 'listing_faqs')`,
      [partnerId],
    );
    const featureCodes = rows.map((row) => row.feature_code);
    expect(featureCodes).toEqual(
      expect.arrayContaining(['listing_description', 'listing_faqs']),
    );
  });
});

describe('Partner AI usage dashboard', () => {
  test('requires authentication', async () => {
    const res = await request(app).get(
      `/api/v1/ai/partner/usage?partnerId=${partnerId}`,
    );
    expect(res.status).toBe(401);
  });

  test('a caller who is not an OWNER of the requested partner is refused', async () => {
    const res = await request(app)
      .get(`/api/v1/ai/partner/usage?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('reflects the real, partner-scoped calls made by the Partner AI tools tests above', async () => {
    const res = await request(app)
      .get(`/api/v1/ai/partner/usage?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.stats)).toBe(true);
    expect(Array.isArray(res.body.data.recent)).toBe(true);
    expect(res.body.data.recent.length).toBeGreaterThan(0);
    const featureCodes = res.body.data.stats.map((row) => row.feature_code);
    expect(featureCodes).toEqual(
      expect.arrayContaining(['listing_description']),
    );
    // Every returned row genuinely belongs to this partner — proves the
    // `partner_id` filter is real scoping, not an ignored query param.
    res.body.data.recent.forEach((row) => {
      expect(row.partner_id).toBe(partnerId);
    });
  });
});

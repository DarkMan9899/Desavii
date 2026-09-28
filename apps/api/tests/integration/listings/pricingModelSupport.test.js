/**
 * Step L6.2H1 — pricing models the booking engine can't charge are not
 * offered, and a legacy one is contained rather than rewritten:
 *
 * - the category allowlist (`category_pricing_models`) no longer offers
 *   PER_HOUR to Tours or Entertainment Venues; PER_PERSON stays accepted;
 * - a legacy PER_HOUR listing (a row stored before migration 0051 — written
 *   here directly, the API can no longer create one) stays readable with
 *   `pricing.is_model_supported: false`;
 * - it can't be (re)published, completeness lists `pricingModel` as
 *   required, and knowingly saving PER_PERSON restores it.
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

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let admin;
let vendor;
let partnerId;
let languageId;
const categoryIds = {};

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

const LISTING_TYPE_BY_CATEGORY = {
  tours: 'TOUR',
  'entertainment-venues': 'ATTRACTION',
};

async function createListing(categorySlug) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: LISTING_TYPE_BY_CATEGORY[categorySlug],
      translations: [
        { languageId, title: `L6.2H1 ${categorySlug} ${Date.now()}` },
      ],
      categoryIds: [categoryIds[categorySlug]],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function setPricing(listingId, modelCode) {
  return request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ pricing: { modelCode, amount: 8000, currencyCode: 'AMD' } });
}

/** Simulates a listing priced PER_HOUR before migration 0051. */
async function makeLegacyHourly(listingId) {
  await pool.query(
    `UPDATE listing_pricing
     SET pricing_model_id = (SELECT id FROM pricing_models WHERE code = 'PER_HOUR')
     WHERE listing_id = ?`,
    [listingId],
  );
}

/** A publishable entertainment venue, PER_PERSON-priced. */
async function createPublishableVenue() {
  const listingId = await createListing('entertainment-venues');
  expect((await setPricing(listingId, 'PER_PERSON')).status).toBe(200);
  const patchRes = await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ location: { latitude: 40.1872, longitude: 44.5152 } });
  expect(patchRes.status).toBe(200);
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ listingId, bookableUnitType: 'TOUR_DEPARTURE', capacity: 4 });
  expect(unitRes.status).toBe(201);
  return listingId;
}

function publish(listingId) {
  return request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
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
  const [categories] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug IN ('tours', 'entertainment-venues')",
  );
  categories.forEach((row) => {
    categoryIds[row.slug] = row.id;
  });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('category pricing-model allowlist', () => {
  test.each(['tours', 'entertainment-venues'])(
    '%s: PER_HOUR is not offered and is rejected; PER_PERSON is accepted',
    async (categorySlug) => {
      const metadata = await request(app).get(
        `/api/v1/listings/metadata?categoryId=${categoryIds[categorySlug]}`,
      );
      expect(metadata.body.data.pricing_models.map((m) => m.code)).toEqual([
        'PER_PERSON',
      ]);

      const listingId = await createListing(categorySlug);
      const hourly = await setPricing(listingId, 'PER_HOUR');
      expect(hourly.status).toBe(422);
      expect(hourly.body.error.code).toBe('VALIDATION_FAILED');
      expect(hourly.body.error.details).toEqual([
        { field: 'pricing.modelCode', issue: 'UNKNOWN_PRICING_MODEL' },
      ]);

      const perPerson = await setPricing(listingId, 'PER_PERSON');
      expect(perPerson.status).toBe(200);
      expect(perPerson.body.data.pricing).toEqual({
        pricing_model: 'PER_PERSON',
        amount: 8000,
        currency: 'AMD',
        is_model_supported: true,
      });
    },
  );

  test('no category offers PER_HOUR any more', async () => {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM category_pricing_models cpm
       JOIN pricing_models pm ON pm.id = cpm.pricing_model_id
       WHERE pm.code = 'PER_HOUR'`,
    );
    expect(total).toBe(0);
  });
});

describe('legacy PER_HOUR listing', () => {
  test('stays readable, flagged unsupported, to its Partner', async () => {
    const listingId = await createListing('tours');
    expect((await setPricing(listingId, 'PER_PERSON')).status).toBe(200);
    await makeLegacyHourly(listingId);

    const res = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pricing).toEqual({
      pricing_model: 'PER_HOUR',
      amount: 8000,
      currency: 'AMD',
      is_model_supported: false,
    });
  });

  test('a published one stays publicly readable', async () => {
    const listingId = await createPublishableVenue();
    expect((await publish(listingId)).status).toBe(200);
    await makeLegacyHourly(listingId);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pricing.pricing_model).toBe('PER_HOUR');
    expect(res.body.data.pricing.is_model_supported).toBe(false);
  });

  test('cannot be published, is flagged in completeness, and publishes once knowingly re-priced', async () => {
    const listingId = await createPublishableVenue();
    await makeLegacyHourly(listingId);

    const blocked = await publish(listingId);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details).toEqual([
      { field: 'pricing.modelCode', issue: 'UNSUPPORTED_PRICING_MODEL' },
    ]);

    const completeness = await request(app)
      .get(`/api/v1/listings/${listingId}/completeness`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(completeness.status).toBe(200);
    expect(completeness.body.data.required_missing).toContain('pricingModel');
    expect(completeness.body.data.is_publish_ready).toBe(false);

    // Re-saving the stale model is still refused — the Partner must pick
    // a supported one.
    expect((await setPricing(listingId, 'PER_HOUR')).status).toBe(422);
    expect((await setPricing(listingId, 'PER_PERSON')).status).toBe(200);
    expect((await publish(listingId)).status).toBe(200);
  });
});

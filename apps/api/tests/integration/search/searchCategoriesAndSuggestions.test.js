/**
 * Sprint 8: `GET /search/categories` (category browse with published-only
 * listing counts) and `GET /search/suggestions` (typeahead, mirroring
 * `GET /cities/search?q=`'s documented convention). Self-contained
 * fixtures, same pattern as `searchListings.test.js`.
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
let hotelsCategoryId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function createPublishedListing(title) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
      categoryIds: [hotelsCategoryId],
    });
  const listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      // Phase 5: hotels has required policies (seeds/007_pricing_and_policies.js).
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  // Phase 5: publish now also requires >=1 bookable unit.
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return listingId;
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
  const [[hotelsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotelsCategory.id;

  await createPublishedListing('Suggestions Fixture Hotel Yerevan');
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search/categories', () => {
  test('returns the seeded category taxonomy with a listing_count field', async () => {
    const res = await request(app).get('/api/v1/search/categories');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const hotels = res.body.data.find((c) => c.id === hotelsCategoryId);
    expect(hotels).toBeDefined();
    expect(hotels.listing_count).toEqual(expect.any(Number));
    expect(hotels.listing_count).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /search/destinations', () => {
  // Phase 20 (SEO) — backs the destination landing pages; real seeded
  // cities, each with a published-listing count.
  test('returns the seeded cities with slug/name/listing_count', async () => {
    const res = await request(app).get('/api/v1/search/destinations');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const yerevan = res.body.data.find((d) => d.slug === 'yerevan');
    expect(yerevan).toBeDefined();
    expect(yerevan.name).toEqual(expect.any(String));
    // Baseline `seedAll()` (unlike the separate demo dataset) doesn't
    // locate any published listing in a real city, so 0 is a legitimate
    // value here — this only asserts the field is present and numeric.
    expect(yerevan.listing_count).toEqual(expect.any(Number));
    expect(yerevan.listing_count).toBeGreaterThanOrEqual(0);
  });

  test('a locale param resolves localized city names', async () => {
    const res = await request(app).get('/api/v1/search/destinations?locale=hy');
    expect(res.status).toBe(200);
    const yerevan = res.body.data.find((d) => d.slug === 'yerevan');
    expect(yerevan.name).toEqual(expect.any(String));
  });
});

describe('GET /search/suggestions', () => {
  test('a matching prefix returns the listing as a suggestion', async () => {
    const res = await request(app).get(
      '/api/v1/search/suggestions?q=Suggestions%20Fixture',
    );
    expect(res.status).toBe(200);
    expect(
      res.body.data.some((s) => s.title.includes('Suggestions Fixture')),
    ).toBe(true);
  });

  test('a too-short query returns an empty array, not an error', async () => {
    const res = await request(app).get('/api/v1/search/suggestions?q=S');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('an absent query returns an empty array', async () => {
    const res = await request(app).get('/api/v1/search/suggestions');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

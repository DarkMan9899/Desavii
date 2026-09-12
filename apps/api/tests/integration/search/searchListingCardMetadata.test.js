/**
 * Pass 7 (category-specific visual identity, brief §9/§22) — the deferred
 * Restaurant card metadata item: `GET /search` results now carry
 * `category_slug` (every category, resolved via `mysqlSearchRepository.js`'s
 * new `CARD_METADATA_SELECT`) and `cuisine`/`price_tier` (Restaurant's real
 * seeded attributes). Verifies the real end-to-end shape — real listing,
 * real category link, real `attributeValues` on create — not just the SQL
 * builder's placeholder alignment (`mysqlSearchRepository.buildQuery.test.js`
 * already covers that).
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
let restaurantListingId;
let hotelListingId;
let restaurantSlug;
let hotelSlug;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

function findResult(results, id) {
  return results.find((result) => result.id === id);
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
  const [[restaurantCategory]] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug = 'restaurants'",
  );
  const [[hotelCategory]] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug = 'hotels'",
  );
  restaurantSlug = restaurantCategory.slug;
  hotelSlug = hotelCategory.slug;

  const createRestaurant = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [
        {
          languageId,
          title: `Card Metadata Test Restaurant ${Date.now()}`,
          summary: 'A test restaurant for card metadata search fields.',
        },
      ],
      categoryIds: [restaurantCategory.id],
      attributeValues: [
        { code: 'cuisine', optionCodes: ['ARMENIAN', 'GEORGIAN'] },
        { code: 'price_tier', optionCodes: ['$$'] },
      ],
    });
  expect(createRestaurant.status).toBe(201);
  restaurantListingId = createRestaurant.body.data.id;

  const createHotel = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Card Metadata Test Hotel ${Date.now()}`,
          summary: 'A test hotel — must never show cuisine/price tier.',
        },
      ],
      categoryIds: [hotelCategory.id],
    });
  expect(createHotel.status).toBe(201);
  hotelListingId = createHotel.body.data.id;

  await pool.query(
    "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id IN (?, ?)",
    [restaurantListingId, hotelListingId],
  );
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search — category_slug/cuisine/price_tier card metadata', () => {
  test('a Restaurant result carries its real category slug, cuisine codes, and price tier', async () => {
    const res = await request(app).get(
      '/api/v1/search?keyword=Card Metadata Test Restaurant',
    );
    expect(res.status).toBe(200);
    const result = findResult(res.body.data, restaurantListingId);
    expect(result).toBeDefined();
    expect(result.category_slug).toBe(restaurantSlug);
    expect(result.cuisine).toEqual(
      expect.arrayContaining(['ARMENIAN', 'GEORGIAN']),
    );
    expect(result.cuisine).toHaveLength(2);
    expect(result.price_tier).toBe('$$');
  });

  test('a Hotel result carries its category slug but null cuisine/price_tier (never fabricated)', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Card Metadata Test Hotel`,
    );
    expect(res.status).toBe(200);
    const result = findResult(res.body.data, hotelListingId);
    expect(result).toBeDefined();
    expect(result.category_slug).toBe(hotelSlug);
    expect(result.cuisine).toBeNull();
    expect(result.price_tier).toBeNull();
  });
});

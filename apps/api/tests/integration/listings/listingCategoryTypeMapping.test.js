/**
 * Step L1 — `ListingService#createListing`'s server-side derivation of
 * `listing_type` from the primary category
 * (`core/domain/categoryListingTypeMapping.js`), and the closed
 * `updateListingSchema` contract that makes both fields immutable after
 * creation for an ordinary Partner. Mirrors `listingCrud.test.js`'s own
 * fixture-helper shape — never a second, divergent implementation.
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
let categoryIdBySlug;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

function buildPayload(overrides = {}) {
  return {
    partnerId,
    translations: [
      {
        languageId,
        title: `L1 Mapping Test ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        summary: 'A nice place.',
        description: 'Full description of the listing.',
      },
    ],
    ...overrides,
  };
}

async function createListing(overrides = {}) {
  return request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send(buildPayload(overrides));
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

  const slugs = [
    'hotels',
    'apartments',
    'villas',
    'guest-houses',
    'restaurants',
    'tours',
    'car-rentals',
    'attractions',
    'entertainment-venues',
  ];
  const [rows] = await pool.query(
    `SELECT slug, id FROM listing_categories WHERE slug IN (?)`,
    [slugs],
  );
  categoryIdBySlug = Object.fromEntries(rows.map((row) => [row.slug, row.id]));
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /listings — category -> listing_type server-side derivation (brief §10, §19)', () => {
  test.each([
    ['hotels', 'HOTEL'],
    ['apartments', 'PROPERTY'],
    ['villas', 'PROPERTY'],
    ['guest-houses', 'PROPERTY'],
    ['restaurants', 'RESTAURANT'],
    ['tours', 'TOUR'],
    ['car-rentals', 'CAR_RENTAL'],
    ['attractions', 'ATTRACTION'],
    ['entertainment-venues', 'ATTRACTION'],
  ])(
    'category slug "%s" persists as listing_type "%s", with no listingType in the payload at all',
    async (slug, expectedType) => {
      const res = await createListing({
        categoryIds: [categoryIdBySlug[slug]],
      });
      expect(res.status).toBe(201);
      expect(res.body.data.listing_type).toBe(expectedType);
    },
  );

  test('a direct API mismatch (Restaurants category + HOTEL listingType) is canonicalized, never persisted as a contradiction', async () => {
    const res = await createListing({
      categoryIds: [categoryIdBySlug.restaurants],
      listingType: 'HOTEL',
    });
    expect(res.status).toBe(201);
    // The category-derived value always wins — the client's HOTEL claim
    // is silently ignored, not honored and not rejected as a 422.
    expect(res.body.data.listing_type).toBe('RESTAURANT');
  });

  test('an explicit listingType that already matches its category is unaffected (no regression for well-formed payloads)', async () => {
    const res = await createListing({
      categoryIds: [categoryIdBySlug.hotels],
      listingType: 'HOTEL',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.listing_type).toBe('HOTEL');
  });

  test('no category at all falls back to an explicit listingType — internal/test callers without a mapped category are unaffected', async () => {
    const res = await createListing({ listingType: 'TOUR' });
    expect(res.status).toBe(201);
    expect(res.body.data.listing_type).toBe('TOUR');
    expect(res.body.data.category_ids).toEqual([]);
  });

  test('neither a mappable category nor an explicit listingType is rejected with a clear validation error, never a silent default', async () => {
    const res = await createListing();
    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'UNKNOWN_LISTING_TYPE'),
    ).toBe(true);
  });

  test('an unmapped category (no matching slug in the closed mapping) with no explicit listingType is rejected the same way', async () => {
    // Simulates a category the mapping doesn't cover — the ROOT
    // "Blog" category tree/any future category with no closed-list
    // mapping is not exercised directly here (no such row is seeded
    // outside `listing_categories`' own taxonomy), so this is
    // reproduced by pointing at a category id known NOT to be in the
    // mapping's slug set: none of the seeded slugs are literally
    // invalid, so this test instead proves the same fallback path using
    // a nonexistent category id, which resolves to a `null` slug from
    // `findCategorySlugById` — structurally identical to an unmapped
    // category from the derivation's own point of view.
    const res = await createListing({ categoryIds: [999999999] });
    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'UNKNOWN_LISTING_TYPE'),
    ).toBe(true);
  });
});

describe('PATCH /listings/:id — category and listing_type are immutable after creation (brief §12, §20)', () => {
  test('categoryIds in the update payload is silently ignored — the stored category never changes', async () => {
    const created = await createListing({
      categoryIds: [categoryIdBySlug.hotels],
    });
    const listingId = created.body.data.id;
    expect(created.body.data.category_ids).toEqual([categoryIdBySlug.hotels]);

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        categoryIds: [categoryIdBySlug.restaurants],
        isIndexable: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.category_ids).toEqual([categoryIdBySlug.hotels]);
    expect(res.body.data.listing_type).toBe('HOTEL');

    const getRes = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(getRes.body.data.category_ids).toEqual([categoryIdBySlug.hotels]);
    expect(getRes.body.data.listing_type).toBe('HOTEL');
  });

  test('other, genuinely editable fields in the same PATCH still update normally', async () => {
    const created = await createListing({
      categoryIds: [categoryIdBySlug.hotels],
    });
    const listingId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        categoryIds: [categoryIdBySlug.restaurants],
        location: { latitude: 40.1772, longitude: 44.5035 },
      });
    expect(res.status).toBe(200);
    expect(res.body.data.location.latitude).toBe(40.1772);
    expect(res.body.data.location.longitude).toBe(44.5035);
    expect(res.body.data.category_ids).toEqual([categoryIdBySlug.hotels]);
  });

  test("category-scoped attribute resolution on PATCH still uses the listing's own stored category, unaffected by an ignored categoryIds", async () => {
    const created = await createListing({
      categoryIds: [categoryIdBySlug.hotels],
    });
    const listingId = created.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        categoryIds: [categoryIdBySlug.restaurants],
        // `total_rooms` is offered only by hotels, so a 200 proves the
        // stored hotel category (not the ignored restaurants one) scoped it.
        attributeValues: [{ code: 'total_rooms', value: 3 }],
      });
    expect(res.status).toBe(200);
    expect(
      res.body.data.attribute_values.some(
        (entry) => entry.code === 'total_rooms' && entry.value === 3,
      ),
    ).toBe(true);
  });
});

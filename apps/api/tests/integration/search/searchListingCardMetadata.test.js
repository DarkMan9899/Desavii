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
      // Emergency premium card redesign: Hotels' own real headline
      // attribute (star_rating), same generic-attribute mechanism as
      // Restaurant's cuisine/price_tier above.
      attributeValues: [{ code: 'star_rating', optionCodes: ['4'] }],
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

  // Emergency premium card redesign — one more real headline attribute per
  // remaining category, same CARD_METADATA_SELECT mechanism as cuisine/
  // price_tier above.
  test('a Hotel result carries its real star_rating, and null bedrooms/transmission/duration (never fabricated)', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Card Metadata Test Hotel`,
    );
    expect(res.status).toBe(200);
    const result = findResult(res.body.data, hotelListingId);
    expect(result).toBeDefined();
    expect(result.star_rating).toBe('4');
    expect(result.bedrooms).toBeNull();
    expect(result.transmission).toBeNull();
    expect(result.duration_minutes).toBeNull();
  });

  test('a Restaurant result (no star_rating authored) carries null star_rating too', async () => {
    const res = await request(app).get(
      '/api/v1/search?keyword=Card Metadata Test Restaurant',
    );
    expect(res.status).toBe(200);
    const result = findResult(res.body.data, restaurantListingId);
    expect(result).toBeDefined();
    expect(result.star_rating).toBeNull();
  });
});

// Card decision layer (docs/LISTING_CARDS.md): the shared card facts —
// `listingCardMetadataSql.js` — only ever carry what still applies to the
// listing's category, and a restaurant is reservable only with a real,
// undeleted table.
describe('GET /search — the shared card facts stay truthful', () => {
  const amenityId = async (code) => {
    const [[row]] = await pool.query(
      'SELECT id FROM listing_amenities WHERE code = ?',
      [code],
    );
    return row.id;
  };

  const searchRow = async (keyword, id) => {
    const res = await request(app).get(
      `/api/v1/search?keyword=${encodeURIComponent(keyword)}`,
    );
    expect(res.status).toBe(200);
    return findResult(res.body.data, id);
  };

  test('card-worthy amenities only, and only while they apply to the category', async () => {
    const applicable = await Promise.all(
      ['POOL', 'BREAKFAST_INCLUDED', 'WIFI'].map(amenityId),
    );
    // A car-rental amenity left on a hotel (e.g. after a category change).
    const stale = await amenityId('CHILD_SEAT');
    await pool.query(
      'INSERT IGNORE INTO listing_amenity_listing (listing_id, amenity_id) VALUES ?',
      [[...applicable, stale].map((id) => [hotelListingId, id])],
    );
    const result = await searchRow('Card Metadata Test Hotel', hotelListingId);
    // WiFi is real but tells a traveller nothing on a card.
    expect(result.amenities).toEqual(['BREAKFAST_INCLUDED', 'POOL']);
  });

  test('an attribute that does not apply to the category is never shown', async () => {
    // A car's transmission written straight onto the hotel.
    await pool.query(
      `INSERT IGNORE INTO listing_attribute_option (listing_id, attribute_option_id)
       SELECT ?, ao.id FROM attribute_options ao
       JOIN attribute_definitions ad ON ad.id = ao.attribute_definition_id
       WHERE ad.code = 'transmission' AND ao.code = 'AUTOMATIC'`,
      [hotelListingId],
    );
    const result = await searchRow('Card Metadata Test Hotel', hotelListingId);
    expect(result.transmission).toBeNull();
    expect(result.star_rating).toBe('4');
  });

  test('a restaurant is reservable only while it has an undeleted table', async () => {
    const before = await searchRow(
      'Card Metadata Test Restaurant',
      restaurantListingId,
    );
    expect(before.reservable).toBe(false);

    const [insert] = await pool.query(
      `INSERT INTO bookable_units (listing_id, bookable_unit_type_id, source_table, source_id)
       SELECT ?, id, 'restaurant_tables', 0 FROM bookable_unit_types WHERE code = 'RESTAURANT_TABLE'`,
      [restaurantListingId],
    );
    const withTable = await searchRow(
      'Card Metadata Test Restaurant',
      restaurantListingId,
    );
    expect(withTable.reservable).toBe(true);

    await pool.query(
      'UPDATE bookable_units SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [insert.insertId],
    );
    const deleted = await searchRow(
      'Card Metadata Test Restaurant',
      restaurantListingId,
    );
    expect(deleted.reservable).toBe(false);
  });

  test('a hotel is never reservable and carries no car facts', async () => {
    const result = await searchRow('Card Metadata Test Hotel', hotelListingId);
    expect(result.reservable).toBe(false);
    expect(result.seats).toBeNull();
    expect(result.body_type).toBeNull();
  });
});

/**
 * Phase 4.2: `GET /search/filters` (the dynamic filter metadata endpoint)
 * and the `amenityIds`/`attr_*` filters `GET /search` now understands.
 * Same fixture pattern as `searchListings.test.js` — one published listing
 * created through the real Listings API — but attribute/amenity *values*
 * (as opposed to category applicability, which `seedAll()` already
 * provides) have no partner-facing endpoint yet, so this suite links them
 * directly via the typed value tables the migration 0014 introduced,
 * exactly the shape `mysqlSearchRepository.searchListings` reads.
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
let apartmentsCategoryId;
let wifiAmenityId;
let parkingAmenityId;
let starRatingFiveOptionId;
let starRatingOneOptionId;

let fiveStarListingId; // hotels, WiFi + Parking, star_rating=5
let plainListingId; // hotels, no amenities/attributes linked

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function createPublishedHotel(title, categoryId) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
      categoryIds: [categoryId],
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
  const [[apartmentsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'apartments'",
  );
  apartmentsCategoryId = apartmentsCategory.id;

  const [[wifi]] = await pool.query(
    "SELECT id FROM listing_amenities WHERE name = 'WiFi'",
  );
  wifiAmenityId = wifi.id;
  const [[parking]] = await pool.query(
    "SELECT id FROM listing_amenities WHERE name = 'Parking'",
  );
  parkingAmenityId = parking.id;

  const [[starRatingAttribute]] = await pool.query(
    "SELECT id FROM attribute_definitions WHERE code = 'star_rating'",
  );
  const [[optionFive]] = await pool.query(
    'SELECT id FROM attribute_options WHERE attribute_definition_id = ? AND code = ?',
    [starRatingAttribute.id, '5'],
  );
  starRatingFiveOptionId = optionFive.id;
  const [[optionOne]] = await pool.query(
    'SELECT id FROM attribute_options WHERE attribute_definition_id = ? AND code = ?',
    [starRatingAttribute.id, '1'],
  );
  starRatingOneOptionId = optionOne.id;

  fiveStarListingId = await createPublishedHotel(
    'Five Star Filters Fixture Hotel',
    hotelsCategoryId,
  );
  plainListingId = await createPublishedHotel(
    'Plain Filters Fixture Hotel',
    hotelsCategoryId,
  );

  await pool.query(
    'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?), (?, ?)',
    [fiveStarListingId, wifiAmenityId, fiveStarListingId, parkingAmenityId],
  );
  await pool.query(
    'INSERT INTO listing_attribute_option (listing_id, attribute_option_id) VALUES (?, ?)',
    [fiveStarListingId, starRatingFiveOptionId],
  );
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search/filters', () => {
  test('hotels: returns the star_rating (SINGLE_SELECT) and amenities groups', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${hotelsCategoryId}`,
    );
    expect(res.status).toBe(200);
    const groupCodes = res.body.data.groups.map((g) => g.code);
    expect(groupCodes).toEqual(expect.arrayContaining(['RATING', 'AMENITIES']));

    const ratingGroup = res.body.data.groups.find((g) => g.code === 'RATING');
    const starRatingFilter = ratingGroup.definitions.find(
      (d) => d.code === 'star_rating',
    );
    expect(starRatingFilter.input_type).toBe('SINGLE_SELECT');
    expect(starRatingFilter.options.map((o) => o.code).sort()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ]);

    const amenitiesGroup = res.body.data.groups.find(
      (g) => g.code === 'AMENITIES',
    );
    const amenityFilter = amenitiesGroup.definitions[0];
    expect(amenityFilter.options.some((o) => o.code === 'WiFi')).toBe(true);
  });

  test('apartments: returns STEPPER room-count filters, not star_rating', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${apartmentsCategoryId}`,
    );
    expect(res.status).toBe(200);
    const roomsGroup = res.body.data.groups.find((g) => g.code === 'ROOMS');
    expect(roomsGroup).toBeDefined();
    const codes = roomsGroup.definitions.map((d) => d.code).sort();
    expect(codes).toEqual(['bathrooms', 'bedrooms', 'beds', 'max_guests']);
    expect(
      roomsGroup.definitions.every((d) => d.input_type === 'STEPPER'),
    ).toBe(true);
    expect(res.body.data.groups.some((g) => g.code === 'RATING')).toBe(false);
  });

  test('no categoryId: only the global amenities filter is returned, with no options', async () => {
    const res = await request(app).get('/api/v1/search/filters');
    expect(res.status).toBe(200);
    expect(res.body.data.groups).toHaveLength(1);
    expect(res.body.data.groups[0].code).toBe('AMENITIES');
    expect(res.body.data.groups[0].definitions[0].options).toEqual([]);
  });
});

describe('GET /search — amenityIds filter (AND semantics)', () => {
  test('a listing having every requested amenity matches', async () => {
    const res = await request(app).get(
      `/api/v1/search?amenityIds=${wifiAmenityId},${parkingAmenityId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toContain(fiveStarListingId);
    expect(res.body.data.map((r) => r.id)).not.toContain(plainListingId);
  });

  test('adding one amenity the listing lacks excludes it (must have ALL, not ANY)', async () => {
    const res = await request(app).get(
      `/api/v1/search?amenityIds=${wifiAmenityId},${parkingAmenityId},${parkingAmenityId + 9999}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(fiveStarListingId);
  });
});

describe('GET /search — attr_{code} enum filter (OR semantics within one attribute)', () => {
  test('matching option id returns the listing', async () => {
    const res = await request(app).get(
      `/api/v1/search?attr_star_rating=${starRatingFiveOptionId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toContain(fiveStarListingId);
  });

  test('a different option id excludes it', async () => {
    const res = await request(app).get(
      `/api/v1/search?attr_star_rating=${starRatingOneOptionId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(fiveStarListingId);
  });

  test('an unregistered attribute code is silently ignored, not a validation error', async () => {
    const res = await request(app).get('/api/v1/search?attr_totally_made_up=5');
    expect(res.status).toBe(200);
  });
});

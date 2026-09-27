/**
 * Step L6.1 — amenities are scoped to the listing's category
 * (`amenity_category_applicability`), for listing AND room/unit amenities,
 * with legacy compatibility:
 *
 * - every amenity on create must apply to the chosen category;
 * - an update may not ADD an amenity the category doesn't offer — the
 *   whole write is rejected and the stored values survive;
 * - an amenity already stored before the request (legacy out-of-category
 *   data) may be sent back unchanged, and leaving it out removes it;
 * - search only lets an amenity filter match through an amenity that
 *   applies to the listing's own category, so legacy links never pollute
 *   public results.
 *
 * Legacy out-of-category links are inserted directly (as old seed data
 * did) — the API itself can no longer create them.
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

// 1x1 transparent PNG, a valid image for the publish readiness check.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

let pool;
let vendorAuth;
let adminAuth;
let customerAuth;
let partnerId;
let languageId;
let hotelsCategoryId;
const amenityIdByName = {};
let seq = 0;

async function login({ email, password }) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { Authorization: `Bearer ${res.body.data.access_token}` };
}

function createHotel(body = {}) {
  seq += 1;
  return request(app)
    .post('/api/v1/listings')
    .set(vendorAuth)
    .send({
      partnerId,
      categoryIds: [hotelsCategoryId],
      translations: [
        { languageId, title: `L6.1 Amenity Hotel ${Date.now()}-${seq}` },
      ],
      ...body,
    });
}

function patchListing(listingId, body) {
  return request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set(vendorAuth)
    .send(body);
}

async function storedListingAmenityIds(listingId) {
  const [rows] = await pool.query(
    'SELECT amenity_id FROM listing_amenity_listing WHERE listing_id = ? ORDER BY amenity_id',
    [listingId],
  );
  return rows.map((row) => row.amenity_id);
}

function sorted(ids) {
  return [...ids].sort((a, b) => a - b);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendorAuth = await login(DEV_CREDENTIALS.vendor);
  adminAuth = await login(DEV_CREDENTIALS.admin);
  customerAuth = await login(DEV_CREDENTIALS.customer);

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[hotels]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotels.id;
  const [amenities] = await pool.query(
    'SELECT id, name FROM listing_amenities',
  );
  amenities.forEach((row) => {
    amenityIdByName[row.name] = row.id;
  });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

// Hotels offer WiFi, Pool, Minibar and (L6.1) Pet Friendly; they never
// offer the villa-only Jacuzzi or the restaurant-only Live Music.
const amenity = (name) => amenityIdByName[name];

describe('applicability decisions (L6.1 seed)', () => {
  test.each([
    ['hotels', 'Pet Friendly'],
    ['apartments', 'Pool'],
    ['apartments', 'Breakfast Included'],
    ['apartments', 'Airport Shuttle'],
    ['attractions', 'WiFi'],
    ['attractions', 'Air Conditioning'],
    ['entertainment-venues', 'WiFi'],
    ['entertainment-venues', 'Air Conditioning'],
  ])('%s offers %s', async (slug, name) => {
    const [[category]] = await pool.query(
      'SELECT id FROM listing_categories WHERE slug = ?',
      [slug],
    );
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${category.id}`,
    );
    const offered = res.body.data.amenity_groups.flatMap((group) =>
      group.amenities.map((option) => option.value),
    );
    expect(offered).toContain(amenity(name));
  });

  test.each([
    ['tours', 'WiFi'],
    ['car-rentals', 'Parking'],
    ['attractions', 'Pet Friendly'],
  ])('%s still does not offer %s', async (slug, name) => {
    const [[category]] = await pool.query(
      'SELECT id FROM listing_categories WHERE slug = ?',
      [slug],
    );
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${category.id}`,
    );
    const offered = res.body.data.amenity_groups.flatMap((group) =>
      group.amenities.map((option) => option.value),
    );
    expect(offered).not.toContain(amenity(name));
  });

  test('metadata carries a label catalog covering amenities outside the category', async () => {
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${hotelsCategoryId}`,
    );
    const catalog = res.body.data.amenity_catalog;
    expect(catalog).toEqual(
      expect.arrayContaining([{ value: amenity('Jacuzzi'), code: 'Jacuzzi' }]),
    );
  });
});

describe('listing amenities — create', () => {
  test('an applicable amenity is accepted', async () => {
    const res = await createHotel({
      amenityIds: [amenity('WiFi'), amenity('Pet Friendly')],
    });
    expect(res.status).toBe(201);
    expect(sorted(res.body.data.amenity_ids)).toEqual(
      sorted([amenity('WiFi'), amenity('Pet Friendly')]),
    );
  });

  test('one foreign amenity rejects the whole create — no listing, no links', async () => {
    const [[before]] = await pool.query('SELECT COUNT(*) AS n FROM listings');
    const res = await createHotel({
      amenityIds: [amenity('WiFi'), amenity('Jacuzzi')],
    });
    const [[after]] = await pool.query('SELECT COUNT(*) AS n FROM listings');

    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'amenityIds', issue: 'UNKNOWN_AMENITY' },
    ]);
    expect(after.n).toBe(before.n);
  });
});

describe('listing amenities — update', () => {
  let listingId;

  beforeAll(async () => {
    const res = await createHotel({ amenityIds: [amenity('WiFi')] });
    listingId = res.body.data.id;
  });

  test('an applicable amenity is accepted', async () => {
    const res = await patchListing(listingId, {
      amenityIds: [amenity('WiFi'), amenity('Pool')],
    });
    expect(res.status).toBe(200);
    expect(await storedListingAmenityIds(listingId)).toEqual(
      sorted([amenity('WiFi'), amenity('Pool')]),
    );
  });

  test('a new foreign amenity is rejected and the stored values survive', async () => {
    const res = await patchListing(listingId, {
      amenityIds: [amenity('WiFi'), amenity('Live Music')],
      translations: [{ languageId, title: 'Must not be saved' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'amenityIds', issue: 'UNKNOWN_AMENITY' },
    ]);
    expect(await storedListingAmenityIds(listingId)).toEqual(
      sorted([amenity('WiFi'), amenity('Pool')]),
    );
    const [titles] = await pool.query(
      'SELECT title FROM listing_translations WHERE listing_id = ?',
      [listingId],
    );
    expect(titles.map((row) => row.title)).not.toContain('Must not be saved');
  });

  test('an empty list clears every amenity', async () => {
    const res = await patchListing(listingId, { amenityIds: [] });
    expect(res.status).toBe(200);
    expect(await storedListingAmenityIds(listingId)).toEqual([]);
  });
});

describe('listing amenities — legacy out-of-category links', () => {
  let listingId;

  beforeAll(async () => {
    const res = await createHotel({ amenityIds: [amenity('WiFi')] });
    listingId = res.body.data.id;
    await pool.query(
      'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?)',
      [listingId, amenity('Jacuzzi')],
    );
  });

  test('a stored legacy amenity sent back unchanged is accepted and kept', async () => {
    const res = await patchListing(listingId, {
      amenityIds: [amenity('WiFi'), amenity('Jacuzzi'), amenity('Pool')],
    });
    expect(res.status).toBe(200);
    expect(await storedListingAmenityIds(listingId)).toEqual(
      sorted([amenity('WiFi'), amenity('Jacuzzi'), amenity('Pool')]),
    );
  });

  test('editing another field never touches the legacy amenity', async () => {
    const res = await patchListing(listingId, {
      translations: [{ languageId, title: 'L6.1 Legacy Hotel Renamed' }],
    });
    expect(res.status).toBe(200);
    expect(await storedListingAmenityIds(listingId)).toContain(
      amenity('Jacuzzi'),
    );
  });

  test('a legacy amenity plus a NEW foreign one is rejected as a whole', async () => {
    const res = await patchListing(listingId, {
      amenityIds: [amenity('WiFi'), amenity('Jacuzzi'), amenity('Live Music')],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'amenityIds', issue: 'UNKNOWN_AMENITY' },
    ]);
    expect(await storedListingAmenityIds(listingId)).toEqual(
      sorted([amenity('WiFi'), amenity('Jacuzzi'), amenity('Pool')]),
    );
  });

  test('leaving the legacy amenity out removes it, and it cannot be re-added', async () => {
    const removed = await patchListing(listingId, {
      amenityIds: [amenity('WiFi')],
    });
    expect(removed.status).toBe(200);
    expect(await storedListingAmenityIds(listingId)).toEqual([amenity('WiFi')]);

    const readd = await patchListing(listingId, {
      amenityIds: [amenity('WiFi'), amenity('Jacuzzi')],
    });
    expect(readd.status).toBe(422);
    expect(await storedListingAmenityIds(listingId)).toEqual([amenity('WiFi')]);
  });
});

describe('room/unit amenities — parent listing category', () => {
  let listingId;
  let unitId;

  async function storedUnitAmenityIds() {
    const [rows] = await pool.query(
      'SELECT amenity_id FROM bookable_unit_amenity_listing WHERE bookable_unit_id = ? ORDER BY amenity_id',
      [unitId],
    );
    return rows.map((row) => row.amenity_id);
  }

  function patchUnitAmenities(amenityIds, auth = vendorAuth) {
    return request(app)
      .patch(`/api/v1/availability/units/${unitId}/amenities`)
      .set(auth)
      .send({ amenityIds });
  }

  beforeAll(async () => {
    const res = await createHotel();
    listingId = res.body.data.id;
    const unit = await request(app)
      .post('/api/v1/availability/units')
      .set(vendorAuth)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 2 });
    unitId = unit.body.data.id;
  });

  test('an amenity the parent category offers is accepted', async () => {
    const res = await patchUnitAmenities([amenity('Minibar')]);
    expect(res.status).toBe(200);
    expect(await storedUnitAmenityIds()).toEqual([amenity('Minibar')]);
  });

  test('a new foreign amenity is rejected with no partial write', async () => {
    const res = await patchUnitAmenities([
      amenity('Minibar'),
      amenity('Jacuzzi'),
    ]);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      { field: 'amenityIds', issue: 'UNKNOWN_AMENITY' },
    ]);
    expect(await storedUnitAmenityIds()).toEqual([amenity('Minibar')]);
  });

  test('a stored legacy unit amenity round-trips, and omitting it removes it', async () => {
    await pool.query(
      'INSERT INTO bookable_unit_amenity_listing (bookable_unit_id, amenity_id) VALUES (?, ?)',
      [unitId, amenity('Live Music')],
    );

    const kept = await patchUnitAmenities([
      amenity('Minibar'),
      amenity('Live Music'),
    ]);
    expect(kept.status).toBe(200);
    expect(await storedUnitAmenityIds()).toEqual(
      sorted([amenity('Minibar'), amenity('Live Music')]),
    );

    const removed = await patchUnitAmenities([amenity('Minibar')]);
    expect(removed.status).toBe(200);
    expect(await storedUnitAmenityIds()).toEqual([amenity('Minibar')]);
  });

  test('ownership isolation is unchanged — another user cannot write', async () => {
    const res = await patchUnitAmenities([amenity('TV')], customerAuth);
    expect([403, 404]).toContain(res.status);
    expect(await storedUnitAmenityIds()).toEqual([amenity('Minibar')]);
  });
});

describe('search ignores legacy out-of-category amenity links', () => {
  let listingId;

  beforeAll(async () => {
    const created = await createHotel({ amenityIds: [amenity('WiFi')] });
    listingId = created.body.data.id;
    await patchListing(listingId, {
      location: { latitude: 40.18, longitude: 44.5 },
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set(vendorAuth)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    await request(app)
      .post('/api/v1/availability/units')
      .set(vendorAuth)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
    const published = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set(adminAuth)
      .send({ publicationPeriodDays: 90 });
    expect(published.status).toBe(200);

    await pool.query(
      'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?)',
      [listingId, amenity('Jacuzzi')],
    );
  }, 60_000);

  async function searchIds(query) {
    const res = await request(app).get(`/api/v1/search?${query}&limit=100`);
    expect(res.status).toBe(200);
    return res.body.data.map((row) => row.id);
  }

  test('a category-less search by the legacy amenity does not match it', async () => {
    expect(await searchIds(`amenityIds=${amenity('Jacuzzi')}`)).not.toContain(
      listingId,
    );
  });

  test('a category-scoped search by the legacy amenity does not match it', async () => {
    expect(
      await searchIds(
        `categoryId=${hotelsCategoryId}&amenityIds=${amenity('Jacuzzi')}`,
      ),
    ).not.toContain(listingId);
  });

  test('its valid, applicable amenity still matches normally', async () => {
    expect(await searchIds(`amenityIds=${amenity('WiFi')}`)).toContain(
      listingId,
    );
    expect(
      await searchIds(
        `categoryId=${hotelsCategoryId}&amenityIds=${amenity('WiFi')}`,
      ),
    ).toContain(listingId);
  });
});

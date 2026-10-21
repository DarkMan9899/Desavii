/**
 * Map Search — `GET /search/map`, proven end to end (request → validation
 * → service → SQL → markers):
 *
 * - List/Map agreement: for every kind of filter (category, city,
 *   keyword, price, guest rating, dates and guests, every attribute,
 *   amenity, policy and room filter the catalog offers, the map area) the
 *   Map's markers are exactly the List's results — one predicate set.
 * - Visibility: drafts and expired listings never become markers, for an
 *   anonymous searcher, whatever `status` the request asks for.
 * - Location policy: a venue's marker is its stored point; a private stay
 *   (apartments, villas, guest houses) gets the centre of its 0.01° grid
 *   cell, flagged `approximate` — and a map area drawn around its stored
 *   point cannot find it there.
 * - The marker cap: never more markers than the limit, with `truncated`
 *   saying so (proven against the real SQL with a small limit; the
 *   500-marker constant is unit-tested).
 * - `bbox` validation: malformed, repeated or out-of-range areas are
 *   rejected with 422.
 *
 * Fixtures go through the real partner/admin APIs and stand at a point no
 * other listing uses (north-east of Vanadzor), so the fixture area holds
 * only them. Expiry is backdated by direct SQL, as
 * `listingExpiryVisibility.test.js` does.
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
import { MySqlSearchRepository } from '../../../src/modules/search/repositories/mysqlSearchRepository.js';
import { resolveSortOption } from '../../../src/core/domain/sortOptions.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const FIXTURE_POINT = { latitude: 40.84321, longitude: 44.52345 };
const FIXTURE_AREA = '44.52000,40.84000,44.53000,40.85000';
// A private stay's stored point, away from its grid-cell centre
// (40.845, 44.525) — still inside the fixture area.
const APARTMENT_POINT = { latitude: 40.84567, longitude: 44.52789 };
const PAGE_LIMIT = 100;

let pool;
let admin;
let vendor;
let partnerId;
let languageIds;
let categoryIds;
let vanadzorCityId;

let liveHotelId;
let expiredHotelId;
let draftHotelId;
let apartmentId;

function ensure(res, status) {
  if (res.status !== status) {
    throw new Error(
      `${res.req.method} ${res.req.path} → ${res.status}: ${JSON.stringify(res.body.error)}`,
    );
  }
  return res;
}

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

/**
 * A listing through the real APIs at `point`, published unless a draft is
 * asked for. Hotels and apartments both have a required cancellation
 * policy (seeds/007_pricing_and_policies.js).
 */
async function createListing(
  title,
  { listingType, categorySlug, unit, point = FIXTURE_POINT, publish = true },
) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType,
      translations: [{ languageId: languageIds.en, title }],
      categoryIds: [categoryIds[categorySlug]],
    });
  const listingId = ensure(createRes, 201).body.data.id;
  ensure(
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        location: { cityId: vanadzorCityId, ...point },
        policyValues: [
          { code: 'cancellation_policy', value: 'FLEXIBLE' },
          { code: 'check_in_time', value: '14:00' },
          { code: 'check_out_time', value: '11:00' },
        ],
      }),
    200,
  );
  if (!publish) return listingId;

  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  ensure(
    await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, capacity: 2, ...unit }),
    201,
  );
  ensure(
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ publicationPeriodDays: 90 }),
    200,
  );
  return listingId;
}

const HOTEL = {
  listingType: 'HOTEL',
  categorySlug: 'hotels',
  unit: { bookableUnitType: 'HOTEL_ROOM', mealPlan: 'BREAKFAST_INCLUDED' },
};
const APARTMENT = {
  listingType: 'PROPERTY',
  categorySlug: 'apartments',
  unit: { bookableUnitType: 'PROPERTY_UNIT' },
};

/** The grid-cell centre a private stay is shown at (`searchMap.js`). */
const cellCentre = (degrees) => Math.floor(degrees / 0.01) * 0.01 + 0.005;

/** Every List result for a query, across all of its cursor pages. */
async function listIds(query) {
  const ids = [];
  let cursor;
  do {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const res = ensure(
      // eslint-disable-next-line no-await-in-loop -- a cursor page needs the previous one
      await request(app).get(
        `/api/v1/search?limit=${PAGE_LIMIT}${query}${cursorParam}`,
      ),
      200,
    );
    ids.push(...res.body.data.map((row) => row.id));
    cursor = res.body.meta.has_more ? res.body.meta.next_cursor : undefined;
  } while (cursor);
  return ids;
}

async function map(query = '') {
  return request(app).get(`/api/v1/search/map?locale=en${query}`);
}

const sorted = (ids) => [...ids].sort((a, b) => a - b);

/** Of `ids`, those with a stored point — the ones a map can place. */
async function withStoredPoint(ids) {
  if (ids.length === 0) return [];
  const [rows] = await pool.query(
    `SELECT listing_id FROM listing_locations
      WHERE listing_id IN (?) AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    [ids],
  );
  return rows.map((row) => row.listing_id);
}

/**
 * The List's and the Map's answers to each `[label, query]`, side by side
 * (`{ label, status, total, mappable, ids }` each), for one `toEqual` per
 * suite: the Map counts every List result (`total`) and places exactly the
 * List results that have a stored point — a listing without one is
 * List-only, never dropped from the count.
 */
async function listAndMap(cases) {
  const answers = await Promise.all(
    cases.map(async ([label, query]) => {
      const [ids, res] = await Promise.all([listIds(query), map(query)]);
      const placeable = await withStoredPoint(ids);
      return {
        list: {
          label,
          status: 200,
          total: ids.length,
          mappable: placeable.length,
          ids: sorted(placeable),
        },
        map: {
          label,
          status: res.status,
          total: res.body.meta?.total,
          mappable: res.body.meta?.mappable,
          ids: sorted((res.body.data ?? []).map((marker) => marker.id)),
        },
      };
    }),
  );
  return {
    list: answers.map((answer) => answer.list),
    map: answers.map((answer) => answer.map),
  };
}

/** The catalog's filters for a category, each as a query with a match. */
async function catalogFilterQueries(categoryId) {
  const res = ensure(
    await request(app).get(`/api/v1/search/filters?categoryId=${categoryId}`),
    200,
  );
  return res.body.data.groups
    .flatMap((group) => group.definitions)
    .flatMap((definition) => {
      if (definition.input_type === 'TOGGLE') {
        return [[definition.code, `&${definition.param}=true`]];
      }
      if (definition.min !== null && definition.min !== undefined) {
        return [
          [definition.code, `&${definition.param}_min=${definition.min}`],
        ];
      }
      const option = [...(definition.options ?? [])]
        .filter((candidate) => candidate.count > 0)
        .sort((a, b) => b.count - a.count)[0];
      return option
        ? [
            [
              definition.code,
              `&${definition.param}=${encodeURIComponent(option.value)}`,
            ],
          ]
        : [];
    })
    .map(([code, query]) => [code, `&categoryId=${categoryId}${query}`]);
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
  const [languages] = await pool.query('SELECT id, code FROM languages');
  languageIds = Object.fromEntries(languages.map((row) => [row.code, row.id]));
  const [categories] = await pool.query(
    'SELECT id, slug FROM listing_categories',
  );
  categoryIds = Object.fromEntries(categories.map((row) => [row.slug, row.id]));
  const [[vanadzor]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'vanadzor'",
  );
  vanadzorCityId = vanadzor.id;

  liveHotelId = await createListing(`Map Live ${SUFFIX}`, HOTEL);
  expiredHotelId = await createListing(`Map Expired ${SUFFIX}`, HOTEL);
  draftHotelId = await createListing(`Map Draft ${SUFFIX}`, {
    ...HOTEL,
    publish: false,
  });
  apartmentId = await createListing(`Map Apartment ${SUFFIX}`, {
    ...APARTMENT,
    point: APARTMENT_POINT,
  });

  // Attribute and amenity values have no partner endpoint; linked
  // directly, as `searchFiltersAndAttributes.test.js` does.
  const [[fourStars]] = await pool.query(
    `SELECT ao.id FROM attribute_options ao
       JOIN attribute_definitions ad ON ad.id = ao.attribute_definition_id
      WHERE ad.code = 'star_rating' AND ao.code = '4'`,
  );
  const [[wifi]] = await pool.query(
    "SELECT id FROM listing_amenities WHERE name = 'WiFi'",
  );
  await pool.query(
    'INSERT INTO listing_attribute_option (listing_id, attribute_option_id) VALUES (?, ?)',
    [liveHotelId, fourStars.id],
  );
  await pool.query(
    'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?)',
    [liveHotelId, wifi.id],
  );
  await pool.query(
    'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
    [expiredHotelId],
  );
}, 120_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search/map — the response', () => {
  test('lightweight markers with the counts the Map states', async () => {
    const res = await map();
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({
      total: expect.any(Number),
      mappable: expect.any(Number),
      returned: res.body.data.length,
      truncated: false,
    });
    expect(res.body.meta.mappable).toBeLessThanOrEqual(res.body.meta.total);
    const [marker] = res.body.data;
    expect(Object.keys(marker).sort()).toEqual(
      [
        'id',
        'slug',
        'title',
        'listing_type',
        'category_slug',
        'city_name',
        'latitude',
        'longitude',
        'location_precision',
        'cover_image_url',
        'price_amount',
        'price_currency_code',
        'pricing_model',
        'rating_average',
        'review_count',
        'star_rating',
        'cuisine',
        'price_tier',
        'transmission',
        'bedrooms',
        'duration_minutes',
      ].sort(),
    );
    expect(marker.latitude).toEqual(expect.any(Number));
    expect(marker.longitude).toEqual(expect.any(Number));
  });

  test('the same request answers the same markers in the same order', async () => {
    const first = await map(`&categoryId=${categoryIds.hotels}`);
    const second = await map(`&categoryId=${categoryIds.hotels}`);
    expect(second.body).toEqual(first.body);
  });
});

describe('GET /search/map — List/Map agreement', () => {
  const fixedQueries = () => [
    ['no filters', ''],
    ['category', `&categoryId=${categoryIds.hotels}`],
    ['city', `&cityId=${vanadzorCityId}`],
    ['keyword', '&keyword=hotel'],
    ['price range', '&priceMin=5000&priceMax=60000'],
    ['guest rating', '&ratingMin=4'],
    ['party size', `&categoryId=${categoryIds.hotels}&guests=2`],
    ['map area', `&bbox=${FIXTURE_AREA}`],
    [
      'category and map area',
      `&categoryId=${categoryIds.hotels}&bbox=${FIXTURE_AREA}`,
    ],
    ['sort', '&sort=price_asc'],
  ];

  test('every fixed filter: the Map shows exactly the List', async () => {
    const answers = await listAndMap(fixedQueries());
    expect(answers.map).toEqual(answers.list);
  });

  test('a dated search: the Map shows exactly the List', async () => {
    const from = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const to = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
    const query = `&categoryId=${categoryIds.hotels}&dateFrom=${from.toISOString().slice(0, 10)}&dateTo=${to.toISOString().slice(0, 10)}&guests=2`;
    const answers = await listAndMap([['dates and party', query]]);
    expect(answers.map).toEqual(answers.list);
  });

  test.each([
    [
      'hotels',
      ['star_rating', 'meal_plan', 'cancellation_policy', 'amenity_ids'],
    ],
    ['apartments', ['cancellation_policy']],
  ])(
    'every catalog filter of %s: the Map shows exactly the List',
    async (slug, expectedCodes) => {
      const queries = await catalogFilterQueries(categoryIds[slug]);
      expect(queries.map(([code]) => code)).toEqual(
        expect.arrayContaining(expectedCodes),
      );
      const answers = await listAndMap(queries);
      expect(answers.map).toEqual(answers.list);
    },
  );
});

describe('GET /search/map — visibility', () => {
  test('a published listing is a marker; a draft and an expired one never are', async () => {
    const res = await map(`&bbox=${FIXTURE_AREA}`);
    const ids = res.body.data.map((m) => m.id);
    expect(ids).toContain(liveHotelId);
    expect(ids).not.toContain(draftHotelId);
    expect(ids).not.toContain(expiredHotelId);
  });

  test.each(['DRAFT', 'PUBLISHED'])(
    'an anonymous status=%s request cannot widen what is public',
    async (status) => {
      const res = await map(`&bbox=${FIXTURE_AREA}&status=${status}`);
      expect(res.status).toBe(200);
      const ids = res.body.data.map((m) => m.id);
      expect(ids).not.toContain(draftHotelId);
      expect(ids).not.toContain(expiredHotelId);
    },
  );
});

describe('GET /search/map — location policy', () => {
  test('a venue is shown at its stored point, as exact', async () => {
    const res = await map(`&bbox=${FIXTURE_AREA}`);
    expect(res.body.data.find((m) => m.id === liveHotelId)).toMatchObject({
      ...FIXTURE_POINT,
      location_precision: 'exact',
    });
  });

  test('a private stay is shown at its grid-cell centre, flagged approximate', async () => {
    const res = await map(`&bbox=${FIXTURE_AREA}`);
    const marker = res.body.data.find((m) => m.id === apartmentId);
    expect(marker.location_precision).toBe('approximate');
    expect(marker.latitude).toBeCloseTo(
      cellCentre(APARTMENT_POINT.latitude),
      6,
    );
    expect(marker.longitude).toBeCloseTo(
      cellCentre(APARTMENT_POINT.longitude),
      6,
    );
    expect(marker.latitude).not.toBe(APARTMENT_POINT.latitude);
    expect(marker.longitude).not.toBe(APARTMENT_POINT.longitude);
  });

  test('a listing in any private-stay category is approximate, every other listing exact', async () => {
    const res = await map();
    const ids = res.body.data.map((marker) => marker.id);
    expect(ids.length).toBeGreaterThan(0);
    // Any link counts, not just the card's own category: a hotel also
    // listed under apartments is still someone's home.
    const [privateRows] = await pool.query(
      `SELECT DISTINCT lcl.listing_id
         FROM listing_category_listing lcl
         JOIN listing_categories c ON c.id = lcl.category_id
        WHERE lcl.listing_id IN (?)
          AND c.slug IN ('apartments', 'villas', 'guest-houses')`,
      [ids],
    );
    const privateIds = new Set(privateRows.map((row) => row.listing_id));
    expect(privateIds.has(apartmentId)).toBe(true);
    expect(
      res.body.data.map((m) => ({ id: m.id, precision: m.location_precision })),
    ).toEqual(
      ids.map((id) => ({
        id,
        precision: privateIds.has(id) ? 'approximate' : 'exact',
      })),
    );
  });

  test("a map area drawn around a private stay's stored point does not find it", async () => {
    const around = ({ latitude, longitude }, half) =>
      [longitude - half, latitude - half, longitude + half, latitude + half]
        .map((value) => value.toFixed(5))
        .join(',');
    const atStored = `&bbox=${around(APARTMENT_POINT, 0.0005)}`;
    expect((await map(atStored)).body.data.map((m) => m.id)).not.toContain(
      apartmentId,
    );
    expect(await listIds(atStored)).not.toContain(apartmentId);

    const atCentre = `&bbox=${around(
      {
        latitude: cellCentre(APARTMENT_POINT.latitude),
        longitude: cellCentre(APARTMENT_POINT.longitude),
      },
      0.0005,
    )}`;
    expect((await map(atCentre)).body.data.map((m) => m.id)).toContain(
      apartmentId,
    );
  });

  test('nothing about a stored point is changed by searching', async () => {
    const [[before]] = await pool.query(
      'SELECT latitude, longitude FROM listing_locations WHERE listing_id = ?',
      [liveHotelId],
    );
    await map();
    const [[after]] = await pool.query(
      'SELECT latitude, longitude FROM listing_locations WHERE listing_id = ?',
      [liveHotelId],
    );
    expect(after).toEqual(before);
  });
});

describe('the marker cap (real SQL, small limit)', () => {
  test('never more markers than the limit, and `truncated` says so', async () => {
    const repository = new MySqlSearchRepository(pool);
    const sort = resolveSortOption('newest', { hasKeyword: false });
    const filters = {
      onlyPublished: true,
      localeId: languageIds.en,
      defaultLocaleId: languageIds.en,
    };
    const capped = await repository.searchMap(filters, sort, { limit: 1 });
    expect(capped.rows).toHaveLength(1);
    expect(capped.meta).toMatchObject({ returned: 1, truncated: true });
    expect(capped.meta.mappable).toBeGreaterThan(1);

    const full = await repository.searchMap(filters, sort, {
      limit: capped.meta.mappable,
    });
    expect(full.meta).toMatchObject({
      returned: capped.meta.mappable,
      truncated: false,
    });
    expect(full.rows.slice(0, 1).map((row) => row.id)).toEqual(
      capped.rows.map((row) => row.id),
    );
  });
});

describe('GET /search/map — bbox validation', () => {
  test.each([
    ['too few numbers', '44.4,40.1,44.6'],
    ['not numbers', 'a,b,c,d'],
    ['south above north', '44.4,40.3,44.6,40.1'],
    ['west right of east', '44.6,40.1,44.4,40.2'],
    ['latitude out of range', '44.4,-91,44.6,40.2'],
    ['longitude out of range', '-181,40.1,44.6,40.2'],
    ['an injection attempt', "44.4,40.1,44.6,40.2'); DROP TABLE listings;--"],
  ])('%s is rejected with 422', async (_label, bbox) => {
    const res = await map(`&bbox=${encodeURIComponent(bbox)}`);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  test('a repeated bbox is rejected with 422', async () => {
    const res = await map(`&bbox=${FIXTURE_AREA}&bbox=${FIXTURE_AREA}`);
    expect(res.status).toBe(422);
  });

  test('the List validates the area exactly as the Map does', async () => {
    const res = await request(app).get('/api/v1/search?bbox=a,b,c,d');
    expect(res.status).toBe(422);
  });
});

/**
 * Search & Discovery remediation — the filters added on top of Phase 4.2's
 * attribute/amenity engine, proven end to end (request → validation →
 * service → SQL → changed results), plus the catalog that offers them:
 *
 * - `GET /search/filters`: only filters some listing in scope can match,
 *   each with its URL `param`, `is_advanced`, `listing_count` and option
 *   counts; amenity names localized with requested → English → canonical
 *   fallback; category policies, room facts and guest rating as filters.
 * - `GET /search`: `policy_{code}`, `room_meal_plan`, `room_hourly_stays`,
 *   `ratingMin`, `sort=rating_desc`; out-of-category filters dropped;
 *   malformed values rejected with 422.
 * - `GET /search/destinations`: category-scoped counts and localized city
 *   names for every seeded city.
 *
 * Fixtures go through the real partner APIs (listing, policies, rooms with
 * a meal plan and hourly stays, a completed booking's approved review).
 * Only amenity links — which have no partner endpoint — and two disposable
 * amenities for the translation-fallback cases are written directly, and
 * those are removed afterwards. Every fixture listing is in Goris, which
 * no other suite uses, and results default to newest-first, so the
 * listings created here lead each page.
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
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Grace Hopper', email: 'grace@example.com' };
const HOURLY = {
  hourlyEnabled: true,
  hourlyPriceAmount: 8000,
  hourlyPriceCurrency: 'AMD',
  hourlyMinDurationHours: 2,
  hourlyMaxDurationHours: 6,
  hourlyAvailableFrom: '10:00',
  hourlyAvailableUntil: '20:00',
};
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CANONICAL_ONLY_AMENITY = `Remediation canonical ${SUFFIX}`;
const ENGLISH_ONLY_AMENITY = `Remediation english ${SUFFIX}`;

let pool;
let admin;
let vendor;
let partnerId;
let languageIds;
let hotelsCategoryId;
let restaurantsCategoryId;
let gorisCityId;
let wifiAmenityId;
const disposableAmenityIds = [];

let ratedHotelId; // FLEXIBLE, pets, breakfast + hourly room, WiFi, 5★ review
let plainHotelId; // STRICT, plain room, no amenities, no review

/** A fixture step that did not succeed fails setup with the API's own answer. */
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

async function registerCustomer() {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email: `search-remediation-${SUFFIX}@example.com`,
      password: 'SearchRemediation!2026',
      firstName: 'Search',
      lastName: 'Remediation',
    });
  return { accessToken: res.body.data.access_token };
}

async function createPublishedHotel(title, { policyValues, unit }) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId: languageIds.en, title }],
      categoryIds: [hotelsCategoryId],
    });
  const listingId = ensure(createRes, 201).body.data.id;

  const patchRes = await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { cityId: gorisCityId, latitude: 39.5, longitude: 46.34 },
      policyValues: [
        ...policyValues,
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });
  ensure(patchRes, 200);
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1, ...unit });
  ensure(unitRes, 201);
  ensure(
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ publicationPeriodDays: 90 }),
    200,
  );

  return { listingId, unitId: unitRes.body.data.id };
}

/** A real completed stay and its (auto-approved) review. */
async function reviewStay(unitId, rating) {
  const customer = await registerCustomer();
  const dateFrom = '2027-05-10';
  const dateTo = '2027-05-12';
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: 20_000,
      priceOverrideCurrency: 'AMD',
    });
  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  const holdIds = rememberHoldQuotes(ensure(holdRes, 201)).body.data.items[0]
    .hold_ids;
  const bookingRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [quotedItem(holdIds, { guests: [] })],
      guestContactSnapshot: GUEST_CONTACT,
    });
  const bookingId = ensure(bookingRes, 201).body.data.id;
  ensure(
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`),
    200,
  );
  ensure(
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${vendor.accessToken}`),
    200,
  );
  const reviewRes = await request(app)
    .post('/api/v1/reviews')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({ bookingId, rating, title: 'Lovely', content: 'Great stay.' });
  ensure(reviewRes, 201);
}

async function createDisposableAmenity(name, translations) {
  const [result] = await pool.query(
    'INSERT INTO listing_amenities (name) VALUES (?)',
    [name],
  );
  const amenityId = result.insertId;
  disposableAmenityIds.push(amenityId);
  await pool.query(
    'INSERT INTO amenity_category_applicability (amenity_id, category_id) VALUES (?, ?)',
    [amenityId, hotelsCategoryId],
  );
  await Promise.all(
    translations.map(([languageId, translated]) =>
      pool.query(
        'INSERT INTO listing_amenity_translations (listing_amenity_id, language_id, name) VALUES (?, ?, ?)',
        [amenityId, languageId, translated],
      ),
    ),
  );
  return amenityId;
}

function goris(query = '') {
  return request(app).get(
    `/api/v1/search?categoryId=${hotelsCategoryId}&cityId=${gorisCityId}&limit=50${query}`,
  );
}

function resultIds(res) {
  return res.body.data.map((row) => row.id);
}

function findDefinition(res, code) {
  return res.body.data.groups
    .flatMap((group) =>
      group.definitions.map((definition) => ({
        ...definition,
        group: group.code,
      })),
    )
    .find((definition) => definition.code === code);
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
    "SELECT id, slug FROM listing_categories WHERE slug IN ('hotels', 'restaurants')",
  );
  const categoryBySlug = Object.fromEntries(
    categories.map((row) => [row.slug, row.id]),
  );
  hotelsCategoryId = categoryBySlug.hotels;
  restaurantsCategoryId = categoryBySlug.restaurants;
  const [[gorisRow]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'goris'",
  );
  gorisCityId = gorisRow.id;
  const [[wifi]] = await pool.query(
    "SELECT id FROM listing_amenities WHERE name = 'WiFi'",
  );
  wifiAmenityId = wifi.id;

  const rated = await createPublishedHotel(`Remediation Rated ${SUFFIX}`, {
    policyValues: [
      { code: 'cancellation_policy', value: 'FLEXIBLE' },
      { code: 'pets_allowed', value: 'true' },
    ],
    unit: { mealPlan: 'BREAKFAST_INCLUDED', ...HOURLY },
  });
  ratedHotelId = rated.listingId;
  const plain = await createPublishedHotel(`Remediation Plain ${SUFFIX}`, {
    policyValues: [{ code: 'cancellation_policy', value: 'STRICT' }],
    unit: {},
  });
  plainHotelId = plain.listingId;

  await reviewStay(rated.unitId, 5);

  const canonicalOnlyId = await createDisposableAmenity(
    CANONICAL_ONLY_AMENITY,
    [],
  );
  const englishOnlyId = await createDisposableAmenity(ENGLISH_ONLY_AMENITY, [
    [languageIds.en, `${ENGLISH_ONLY_AMENITY} (en)`],
  ]);
  await pool.query(
    'INSERT INTO listing_amenity_listing (listing_id, amenity_id) VALUES (?, ?), (?, ?), (?, ?)',
    [
      ratedHotelId,
      wifiAmenityId,
      ratedHotelId,
      canonicalOnlyId,
      ratedHotelId,
      englishOnlyId,
    ],
  );
}, 120_000);

afterAll(async () => {
  if (disposableAmenityIds.length > 0) {
    const ids = disposableAmenityIds;
    await pool.query(
      'DELETE FROM listing_amenity_listing WHERE amenity_id IN (?)',
      [ids],
    );
    await pool.query(
      'DELETE FROM listing_amenity_translations WHERE listing_amenity_id IN (?)',
      [ids],
    );
    await pool.query(
      'DELETE FROM amenity_category_applicability WHERE amenity_id IN (?)',
      [ids],
    );
    await pool.query('DELETE FROM listing_amenities WHERE id IN (?)', [ids]);
  }
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search/filters — the catalog offers only real, countable filters', () => {
  test('every definition declares its URL param, quick/advanced placement and listing count', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${hotelsCategoryId}`,
    );
    expect(res.status).toBe(200);
    const definitions = res.body.data.groups.flatMap((g) => g.definitions);
    expect(definitions.length).toBeGreaterThan(0);
    definitions.forEach((definition) => {
      expect(definition.param).toEqual(expect.any(String));
      expect(definition.is_advanced).toEqual(expect.any(Boolean));
      expect(definition.listing_count).toBeGreaterThan(0);
    });
  });

  test('category policies are offered as filters, with per-option counts', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${hotelsCategoryId}`,
    );
    const cancellation = findDefinition(res, 'cancellation_policy');
    expect(cancellation).toMatchObject({
      group: 'BOOKING',
      value_source: 'POLICY',
      input_type: 'MULTI_SELECT',
      param: 'policy_cancellation_policy',
    });
    const counts = Object.fromEntries(
      cancellation.options.map((o) => [o.code, o.count]),
    );
    expect(counts.FLEXIBLE).toBeGreaterThanOrEqual(1);
    expect(counts.STRICT).toBeGreaterThanOrEqual(1);

    expect(findDefinition(res, 'pets_allowed')).toMatchObject({
      input_type: 'TOGGLE',
      param: 'policy_pets_allowed',
    });
    // Times are facts, not filters.
    expect(findDefinition(res, 'check_in_time')).toBeUndefined();
  });

  test('room facts and guest rating are offered once some listing has them', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${hotelsCategoryId}`,
    );
    const mealPlan = findDefinition(res, 'meal_plan');
    expect(mealPlan).toMatchObject({
      value_source: 'ROOM',
      param: 'room_meal_plan',
      is_advanced: false,
    });
    expect(
      mealPlan.options.find((o) => o.code === 'BREAKFAST_INCLUDED').count,
    ).toBeGreaterThanOrEqual(1);
    expect(findDefinition(res, 'hourly_stays')).toMatchObject({
      input_type: 'TOGGLE',
      param: 'room_hourly_stays',
    });

    const rating = findDefinition(res, 'guest_rating');
    expect(rating).toMatchObject({
      group: 'RATING',
      value_source: 'REVIEW',
      param: 'ratingMin',
      is_advanced: false,
    });
    expect(rating.options.map((o) => o.code)).toEqual(['3', '4', '4.5']);
    expect(rating.options[2].count).toBeGreaterThanOrEqual(1);
  });

  test('a category with no listing carrying a fact offers no filter for it', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${restaurantsCategoryId}`,
    );
    expect(res.status).toBe(200);
    expect(findDefinition(res, 'meal_plan')).toBeUndefined();
    expect(findDefinition(res, 'hourly_stays')).toBeUndefined();
  });

  test.each([
    ['hy', 'Վայ-ֆայ'],
    ['ru', 'Wi-Fi'],
    ['en', 'WiFi'],
  ])(
    'amenity names are localized (%s), grouped and counted',
    async (locale, wifiLabel) => {
      const res = await request(app).get(
        `/api/v1/search/filters?categoryId=${hotelsCategoryId}&locale=${locale}`,
      );
      const amenities = findDefinition(res, 'amenity_ids');
      expect(amenities.param).toBe('amenityIds');
      const wifi = amenities.options.find((o) => o.value === wifiAmenityId);
      expect(wifi).toMatchObject({ label: wifiLabel, group: 'INTERNET_WORK' });
      expect(wifi.count).toBeGreaterThanOrEqual(1);
    },
  );

  test('a missing translation falls back to English, then to the canonical name', async () => {
    const res = await request(app).get(
      `/api/v1/search/filters?categoryId=${hotelsCategoryId}&locale=hy`,
    );
    const labels = findDefinition(res, 'amenity_ids').options.map(
      (o) => o.label,
    );
    expect(labels).toContain(`${ENGLISH_ONLY_AMENITY} (en)`);
    expect(labels).toContain(CANONICAL_ONLY_AMENITY);
  });
});

describe('GET /search — remediation filters change the results', () => {
  test('both fixtures are found without filters', async () => {
    const res = await goris();
    expect(res.status).toBe(200);
    expect(resultIds(res)).toEqual(
      expect.arrayContaining([ratedHotelId, plainHotelId]),
    );
  });

  test.each([
    ['&policy_cancellation_policy=FLEXIBLE', true, false],
    ['&policy_cancellation_policy=STRICT', false, true],
    ['&policy_cancellation_policy=FLEXIBLE,STRICT', true, true],
    ['&policy_pets_allowed=true', true, false],
    ['&room_meal_plan=BREAKFAST_INCLUDED', true, false],
    ['&room_meal_plan=HALF_BOARD', false, false],
    ['&room_hourly_stays=true', true, false],
    ['&ratingMin=4.5', true, false],
    [`&amenityIds=${'WIFI_PLACEHOLDER'}`, true, false],
  ])('%s', async (rawQuery, expectRated, expectPlain) => {
    const query = rawQuery.replace('WIFI_PLACEHOLDER', String(wifiAmenityId));
    const res = await goris(query);
    expect(res.status).toBe(200);
    const ids = resultIds(res);
    expect(ids.includes(ratedHotelId)).toBe(expectRated);
    expect(ids.includes(plainHotelId)).toBe(expectPlain);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(ids.length);
  });

  test('the total counts exactly what the filters match', async () => {
    const res = await goris('&policy_pets_allowed=true&room_hourly_stays=true');
    expect(res.body.meta.total).toBe(res.body.data.length);
  });

  test('sort=rating_desc puts the reviewed listing ahead of the unreviewed one', async () => {
    const res = await goris('&sort=rating_desc');
    expect(res.status).toBe(200);
    const ids = resultIds(res);
    expect(ids.indexOf(ratedHotelId)).toBeLessThan(ids.indexOf(plainHotelId));
  });

  test('a filter the chosen category does not have is dropped, not applied', async () => {
    const res = await goris('&attr_seats_min=4&attr_transmission=999999');
    expect(res.status).toBe(200);
    expect(resultIds(res)).toEqual(
      expect.arrayContaining([ratedHotelId, plainHotelId]),
    );
  });

  test('a well-formed value the policy does not have is ignored, like an unknown attribute', async () => {
    const res = await goris(
      '&policy_pets_allowed=1&policy_cancellation_policy=NO_SUCH_POLICY',
    );
    expect(res.status).toBe(200);
    expect(resultIds(res)).toEqual(
      expect.arrayContaining([ratedHotelId, plainHotelId]),
    );
  });

  test.each([
    ['ratingMin=6'],
    ['ratingMin=4.3'],
    ['ratingMin=abc'],
    ['room_meal_plan=BOGUS'],
    ['room_hourly_stays=yes'],
    ['room_view=SEA'],
    ['policy_cancellation_policy=%3Cscript%3E'],
  ])('malformed %s is rejected with 422', async (query) => {
    const res = await request(app).get(`/api/v1/search?${query}`);
    expect(res.status).toBe(422);
  });
});

describe('GET /search/destinations — localized, category-scoped', () => {
  test('counts only listings of the chosen category', async () => {
    const hotels = await request(app).get(
      `/api/v1/search/destinations?categoryId=${hotelsCategoryId}`,
    );
    const restaurants = await request(app).get(
      `/api/v1/search/destinations?categoryId=${restaurantsCategoryId}`,
    );
    expect(hotels.status).toBe(200);
    const gorisFor = (res) => res.body.data.find((d) => d.slug === 'goris');
    expect(gorisFor(hotels).listing_count).toBeGreaterThanOrEqual(2);
    expect(gorisFor(restaurants).listing_count).toBe(0);
  });

  test.each([
    ['hy', { goris: 'Գորիս', jermuk: 'Ջերմուկ', ejmiatsin: 'Էջմիածին' }],
    ['ru', { goris: 'Горис', sevan: 'Севан', vanadzor: 'Ванадзор' }],
  ])('every seeded city has its %s name', async (locale, expected) => {
    const res = await request(app).get(
      `/api/v1/search/destinations?locale=${locale}`,
    );
    const english = await request(app).get('/api/v1/search/destinations');
    const englishBySlug = Object.fromEntries(
      english.body.data.map((d) => [d.slug, d.name]),
    );
    res.body.data.forEach((destination) => {
      expect(destination.name).not.toBe(englishBySlug[destination.slug]);
    });
    Object.entries(expected).forEach(([slug, name]) => {
      expect(res.body.data.find((d) => d.slug === slug).name).toBe(name);
    });
  });
});

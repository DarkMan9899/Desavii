/**
 * Partner Listing Wizard rebuild — the listing contract the Wizard relies
 * on, proven end to end (request → validation → service → SQL → DTO):
 *
 * - Category metadata carries the new per-category facts, amenities and
 *   policies, and each conditional fact names the choice it depends on.
 * - Conditional attributes (migration 0055): accepted only while their
 *   condition holds, rejected otherwise (a direct API call cannot store
 *   what the Wizard would never show), cleared automatically when the
 *   condition stops holding, and never required while it does not apply.
 * - A value can be cleared (`value: null`).
 * - Location: the city must exist and is required to publish; the street
 *   address is stored, removable, public for venues, and withheld from the
 *   public for private stays (owners still see it).
 * - Attractions and entertainment venues need a cancellation policy to
 *   publish, like tours.
 * - Category integrity and authorization: another category's attribute,
 *   amenity or option, a wrong type and a non-owner are all refused.
 *
 * Fixtures go through the real partner/admin APIs; everything here is a
 * DRAFT except the listings created to prove publish rules.
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
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const POINT = { latitude: 40.1811, longitude: 44.5136 };

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageIds;
let categoryIds;
let cityIds;

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

const asVendor = (req) =>
  req.set('Authorization', `Bearer ${vendor.accessToken}`);

async function createDraft(categorySlug, body = {}) {
  const res = await asVendor(request(app).post('/api/v1/listings')).send({
    partnerId,
    translations: [
      { languageId: languageIds.en, title: `Wizard ${categorySlug} ${SUFFIX}` },
    ],
    categoryIds: [categoryIds[categorySlug]],
    ...body,
  });
  return ensure(res, 201).body.data.id;
}

const patch = (id, body) =>
  asVendor(request(app).patch(`/api/v1/listings/${id}`)).send(body);

const getAsVendor = (id) =>
  asVendor(request(app).get(`/api/v1/listings/${id}`));

const attributeCodes = (listing) =>
  listing.attribute_values.map((entry) => entry.code);

/** Everything a listing of this category needs to publish, except `omit`. */
async function makePublishable(
  id,
  { unitType, policyValues, location = { cityId: cityIds.yerevan, ...POINT } },
) {
  ensure(await patch(id, { location, policyValues }), 200);
  await asVendor(request(app).post(`/api/v1/listings/${id}/media`))
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  ensure(
    await asVendor(request(app).post('/api/v1/availability/units')).send({
      listingId: id,
      bookableUnitType: unitType,
      capacity: 2,
    }),
    201,
  );
}

const publish = (id) =>
  request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });

const issuesOf = (res) =>
  (res.body.error?.details ?? []).map(
    (detail) => `${detail.field}:${detail.issue}`,
  );

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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
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
  const [cities] = await pool.query('SELECT id, slug FROM cities');
  cityIds = Object.fromEntries(cities.map((row) => [row.slug, row.id]));
}, 120_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('category metadata', () => {
  async function metadata(slug) {
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${categoryIds[slug]}&locale=en`,
    );
    return ensure(res, 200).body.data;
  }

  test.each([
    ['hotels', ['languages_spoken'], ['parties_allowed']],
    [
      'apartments',
      ['space_type', 'check_in_method', 'languages_spoken'],
      ['parties_allowed'],
    ],
    [
      'restaurants',
      ['dining_style', 'dietary_options', 'seating_capacity'],
      [],
    ],
    [
      'tours',
      ['tour_format', 'min_age', 'min_group_size', 'pickup_details'],
      ['cancellation_policy'],
    ],
    [
      'car-rentals',
      ['vehicle_make', 'body_type', 'drive_type', 'daily_distance_limit_km'],
      ['fuel_policy'],
    ],
    [
      'attractions',
      ['attraction_type', 'visit_format', 'setting'],
      ['cancellation_policy'],
    ],
    [
      'entertainment-venues',
      ['venue_type', 'languages_offered'],
      ['cancellation_policy'],
    ],
  ])('%s offers its own facts and policies', async (slug, attrs, policies) => {
    const data = await metadata(slug);
    const codes = data.attributes.map((attribute) => attribute.code);
    expect(codes).toEqual(expect.arrayContaining(attrs));
    expect(data.policies.map((policy) => policy.code)).toEqual(
      expect.arrayContaining(policies),
    );
  });

  test('a conditional fact names the choice it depends on', async () => {
    const cars = await metadata('car-rentals');
    expect(
      cars.attributes.find((a) => a.code === 'daily_distance_limit_km')
        .depends_on,
    ).toEqual({ attribute_code: 'mileage_policy', option_code: 'LIMITED' });
    expect(
      cars.attributes.find((a) => a.code === 'mileage_policy').depends_on,
    ).toBeNull();
    const tours = await metadata('tours');
    expect(
      tours.attributes.find((a) => a.code === 'pickup_details').depends_on,
    ).toEqual({
      attribute_code: 'meeting_point_type',
      option_code: 'HOTEL_PICKUP',
    });
  });

  test("no category is offered another category's facts", async () => {
    const restaurants = await metadata('restaurants');
    const codes = restaurants.attributes.map((attribute) => attribute.code);
    expect(codes).not.toContain('body_type');
    expect(codes).not.toContain('space_type');
  });
});

describe('conditional attributes', () => {
  test('a dependent value is refused while its condition does not hold', async () => {
    const id = await createDraft('car-rentals');
    const res = await patch(id, {
      attributeValues: [
        { code: 'mileage_policy', optionCodes: ['UNLIMITED'] },
        { code: 'daily_distance_limit_km', value: 250 },
      ],
    });
    expect(res.status).toBe(422);
    expect(issuesOf(res)).toContain(
      'attributeValues.daily_distance_limit_km:ATTRIBUTE_NOT_APPLICABLE',
    );

    const onCreate = await asVendor(request(app).post('/api/v1/listings')).send(
      {
        partnerId,
        translations: [{ languageId: languageIds.en, title: `Car ${SUFFIX}` }],
        categoryIds: [categoryIds['car-rentals']],
        attributeValues: [{ code: 'daily_distance_limit_km', value: 250 }],
      },
    );
    expect(onCreate.status).toBe(422);
  });

  test('accepted while it holds, cleared once it stops holding', async () => {
    const id = await createDraft('car-rentals');
    ensure(
      await patch(id, {
        attributeValues: [
          { code: 'mileage_policy', optionCodes: ['LIMITED'] },
          { code: 'daily_distance_limit_km', value: 250 },
        ],
      }),
      200,
    );
    let listing = (await getAsVendor(id)).body.data;
    expect(attributeCodes(listing)).toContain('daily_distance_limit_km');

    ensure(
      await patch(id, {
        attributeValues: [
          { code: 'mileage_policy', optionCodes: ['UNLIMITED'] },
        ],
      }),
      200,
    );
    listing = (await getAsVendor(id)).body.data;
    expect(attributeCodes(listing)).not.toContain('daily_distance_limit_km');
  });

  test("a tour's pickup details follow its meeting point", async () => {
    const id = await createDraft('tours');
    ensure(
      await patch(id, {
        attributeValues: [
          { code: 'meeting_point_type', optionCodes: ['HOTEL_PICKUP'] },
          { code: 'pickup_details', value: 'Hotels in central Yerevan' },
        ],
      }),
      200,
    );
    ensure(
      await patch(id, {
        attributeValues: [
          { code: 'meeting_point_type', optionCodes: ['FIXED_LOCATION'] },
        ],
      }),
      200,
    );
    const listing = (await getAsVendor(id)).body.data;
    expect(attributeCodes(listing)).not.toContain('pickup_details');
  });

  test('a value can be cleared with null', async () => {
    const id = await createDraft('car-rentals');
    ensure(
      await patch(id, {
        attributeValues: [{ code: 'vehicle_make', value: 'Toyota' }],
      }),
      200,
    );
    ensure(
      await patch(id, {
        attributeValues: [{ code: 'vehicle_make', value: null }],
      }),
      200,
    );
    const listing = (await getAsVendor(id)).body.data;
    expect(attributeCodes(listing)).not.toContain('vehicle_make');
  });
});

describe('category integrity', () => {
  test.each([
    [
      "another category's attribute",
      { attributeValues: [{ code: 'body_type', optionCodes: ['SUV'] }] },
      'UNKNOWN_ATTRIBUTE_CODE',
    ],
    [
      'an option the attribute does not have',
      { attributeValues: [{ code: 'dining_style', optionCodes: ['DISCO'] }] },
      'UNKNOWN_OPTION_CODE',
    ],
    [
      'a number out of range',
      { attributeValues: [{ code: 'seating_capacity', value: 999999 }] },
      'ABOVE_MAXIMUM',
    ],
    [
      'text where a number is expected',
      { attributeValues: [{ code: 'seating_capacity', value: 'many' }] },
      'INVALID_NUMBER',
    ],
  ])('%s is refused', async (_label, body, issue) => {
    const id = await createDraft('restaurants');
    const res = await patch(id, body);
    expect(res.status).toBe(422);
    expect(issuesOf(res).some((entry) => entry.endsWith(`:${issue}`))).toBe(
      true,
    );
  });

  test("another category's amenity is refused", async () => {
    const id = await createDraft('restaurants');
    const [[seat]] = await pool.query(
      "SELECT id FROM listing_amenities WHERE name = 'Child Seat'",
    );
    const res = await patch(id, { amenityIds: [seat.id] });
    expect(res.status).toBe(422);
  });

  test('markup is stored as plain text, never interpreted', async () => {
    const id = await createDraft('car-rentals');
    const make = '<script>alert(1)</script>';
    ensure(
      await patch(id, {
        attributeValues: [{ code: 'vehicle_make', value: make }],
      }),
      200,
    );
    const listing = (await getAsVendor(id)).body.data;
    expect(
      listing.attribute_values.find((entry) => entry.code === 'vehicle_make')
        .value,
    ).toBe(make);
  });

  // Several Partners creating listings at the same moment: a replace-style
  // DELETE on a brand-new listing id used to deadlock them (500).
  test('concurrent creations with categories and options all succeed', async () => {
    const creations = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        asVendor(request(app).post('/api/v1/listings')).send({
          partnerId,
          translations: [
            {
              languageId: languageIds.en,
              title: `Concurrent ${index} ${SUFFIX}`,
            },
          ],
          categoryIds: [categoryIds.hotels],
          attributeValues: [{ code: 'star_rating', optionCodes: ['4'] }],
        }),
      ),
    );
    expect(creations.map((res) => res.status)).toEqual(Array(8).fill(201));
  });

  test('a non-owner cannot edit the listing', async () => {
    const id = await createDraft('hotels');
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ location: { cityId: cityIds.yerevan, ...POINT } });
    expect(res.status).toBe(403);
  });
});

describe('location', () => {
  test('an unknown city is refused', async () => {
    const id = await createDraft('hotels');
    const res = await patch(id, { location: { cityId: 999999, ...POINT } });
    expect(res.status).toBe(422);
    expect(issuesOf(res)).toContain('location.cityId:UNKNOWN_CITY');
  });

  test('every new town is a real, localized choice', async () => {
    const res = await request(app).get('/api/v1/search/destinations?locale=hy');
    const names = ensure(res, 200).body.data.map((city) => city.name);
    expect(names).toEqual(expect.arrayContaining(['Գառնի', 'Տաթև']));
  });

  test('the owner reads back the city and street address they saved', async () => {
    const id = await createDraft('apartments');
    ensure(
      await patch(id, {
        location: {
          cityId: cityIds.yerevan,
          addressLine: '5 Abovyan Street',
          ...POINT,
        },
      }),
      200,
    );
    const { location } = (await getAsVendor(id)).body.data;
    expect(location.address_line).toBe('5 Abovyan Street');
    expect(location.city_id).toBe(cityIds.yerevan);
  });

  test('a blank street address removes it', async () => {
    const id = await createDraft('restaurants');
    ensure(
      await patch(id, {
        location: {
          cityId: cityIds.yerevan,
          addressLine: '1 Main St',
          ...POINT,
        },
      }),
      200,
    );
    ensure(await patch(id, { location: { addressLine: '' } }), 200);
    const listing = (await getAsVendor(id)).body.data;
    expect(listing.location.address_line).toBeNull();
    expect(listing.location.latitude).toBeCloseTo(POINT.latitude, 4);
  });
});

describe('publish rules', () => {
  test('a listing without a city cannot publish; with one it can', async () => {
    const id = await createDraft('restaurants');
    await makePublishable(id, {
      unitType: 'RESTAURANT_TABLE',
      policyValues: [],
      location: POINT,
    });
    const refused = await publish(id);
    expect(refused.status).toBe(422);
    expect(issuesOf(refused)).toContain('location.cityId:CITY_REQUIRED');

    ensure(await patch(id, { location: { cityId: cityIds.garni } }), 200);
    ensure(await publish(id), 200);
  });

  test.each(['attractions', 'entertainment-venues'])(
    '%s needs a cancellation policy, like tours',
    async (slug) => {
      const id = await createDraft(slug);
      await makePublishable(id, {
        unitType: 'TOUR_DEPARTURE',
        policyValues: [],
      });
      const refused = await publish(id);
      expect(refused.status).toBe(422);
      expect(issuesOf(refused)).toContain(
        'policyValues.cancellation_policy:REQUIRED_POLICY_MISSING',
      );
      ensure(
        await patch(id, {
          policyValues: [{ code: 'cancellation_policy', value: 'MODERATE' }],
        }),
        200,
      );
      ensure(await publish(id), 200);
    },
  );

  test("a published venue's street address is public", async () => {
    const id = await createDraft('restaurants');
    await makePublishable(id, {
      unitType: 'RESTAURANT_TABLE',
      policyValues: [],
      location: {
        cityId: cityIds.yerevan,
        addressLine: '3 Saryan Street',
        ...POINT,
      },
    });
    ensure(await publish(id), 200);
    const publicRead = ensure(
      await request(app).get(`/api/v1/listings/${id}`),
      200,
    );
    expect(publicRead.body.data.location.address_line).toBe('3 Saryan Street');
  });

  test("a published private stay's street address is withheld from the public", async () => {
    const homeAddress = '12 Tumanyan Street, apt 4';
    const id = await createDraft('apartments');
    await makePublishable(id, {
      unitType: 'PROPERTY_UNIT',
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '15:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
      location: {
        cityId: cityIds.yerevan,
        addressLine: homeAddress,
        ...POINT,
      },
    });
    const published = ensure(await publish(id), 200);
    const { slug } = published.body.data;

    const publicRead = ensure(
      await request(app).get(`/api/v1/listings/${id}`),
      200,
    );
    expect(publicRead.body.data.location.address_line).toBeNull();
    expect(publicRead.body.data.location.city_id).toBe(cityIds.yerevan);

    // Listing Detail places the home exactly where Search Map does — the
    // grid-cell centre the search SQL computes — never at the stored point.
    const mapRead = ensure(
      await request(app).get(
        `/api/v1/search/map?categoryId=${categoryIds.apartments}`,
      ),
      200,
    );
    const marker = mapRead.body.data.find((result) => result.id === id);
    const publicPoint = publicRead.body.data.location;
    expect(publicPoint.location_precision).toBe('approximate');
    expect(marker.location_precision).toBe('approximate');
    expect(Number(publicPoint.latitude)).toBeCloseTo(
      Number(marker.latitude),
      7,
    );
    expect(Number(publicPoint.longitude)).toBeCloseTo(
      Number(marker.longitude),
      7,
    );
    expect(publicPoint.latitude).not.toBeCloseTo(POINT.latitude, 4);

    // No public read anywhere discloses it: by slug, as a signed-in
    // customer, in the plain list, in Search, on the partner's page.
    const publicReads = [
      request(app).get(`/api/v1/listings/${slug}`),
      request(app)
        .get(`/api/v1/listings/${id}`)
        .set('Authorization', `Bearer ${customer.accessToken}`),
      request(app).get(`/api/v1/listings?partnerId=${partnerId}&limit=100`),
      request(app).get(
        `/api/v1/search?categoryId=${categoryIds.apartments}&limit=100`,
      ),
      request(app).get(
        '/api/v1/partners/yerevan-boutique-hospitality/listings?limit=100',
      ),
    ];
    const responses = await Promise.all(publicReads);
    responses.forEach((res) => {
      ensure(res, 200);
      expect(JSON.stringify(res.body)).not.toContain(homeAddress);
    });

    // Those who manage it still see it.
    const ownerRead = ensure(await getAsVendor(id), 200);
    expect(ownerRead.body.data.location.address_line).toBe(homeAddress);
    expect(ownerRead.body.data.location.latitude).toBeCloseTo(
      POINT.latitude,
      7,
    );
    const adminRead = ensure(
      await request(app)
        .get(`/api/v1/listings/admin/${id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`),
      200,
    );
    expect(adminRead.body.data.location.address_line).toBe(homeAddress);
  });

  test("the owner's own save response carries a private stay's address", async () => {
    const id = await createDraft('villas');
    const saved = ensure(
      await patch(id, {
        location: {
          cityId: cityIds.yerevan,
          addressLine: '7 Garden Lane',
          ...POINT,
        },
      }),
      200,
    );
    expect(saved.body.data.location.address_line).toBe('7 Garden Lane');
  });
});

describe('search sees the new structured facts', () => {
  test('a published car with a body type is filterable by it', async () => {
    const id = await createDraft('car-rentals');
    ensure(
      await patch(id, {
        attributeValues: [{ code: 'body_type', optionCodes: ['SUV'] }],
      }),
      200,
    );
    await makePublishable(id, {
      unitType: 'VEHICLE',
      policyValues: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
    });
    ensure(await publish(id), 200);

    const filters = ensure(
      await request(app).get(
        `/api/v1/search/filters?categoryId=${categoryIds['car-rentals']}`,
      ),
      200,
    ).body.data.groups.flatMap((group) => group.definitions);
    const bodyType = filters.find(
      (definition) => definition.code === 'body_type',
    );
    expect(bodyType.param).toBe('attr_body_type');
    const suv = bodyType.options.find((option) => option.code === 'SUV');
    expect(suv.count).toBeGreaterThanOrEqual(1);

    const results = ensure(
      await request(app).get(
        `/api/v1/search?categoryId=${categoryIds['car-rentals']}&attr_body_type=${suv.value}&limit=100`,
      ),
      200,
    ).body.data.map((row) => row.id);
    expect(results).toContain(id);
  });
});

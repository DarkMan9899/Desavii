/**
 * Listing Detail information depth (docs/LISTING_DETAIL_INFORMATION_DEPTH.md)
 * — the new structured facts travel the whole chain over HTTP: category
 * metadata → the partner's save (validation, conditions, category scope) →
 * storage → the public listing response. Also the tenant boundary around
 * them: only the listing's own company (its owner, or a Manager assigned to
 * it) may edit them or read the management shape; another company's owner
 * or Manager reads exactly what the public reads, and nothing of a draft.
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

const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SCRIPT_TEXT = '<script>alert("end")</script> Republic Square';
const TOUR_FACTS = [
  { code: 'guide_type', optionCodes: ['DRIVER_GUIDE'] },
  { code: 'transport_modes', optionCodes: ['MINIBUS', 'ON_FOOT'] },
  { code: 'meals_included', optionCodes: ['LUNCH', 'TASTING'] },
  { code: 'weather_policy', optionCodes: ['ALL_WEATHER'] },
  { code: 'end_point_type', optionCodes: ['ENDS_ELSEWHERE'] },
  { code: 'end_point_details', value: SCRIPT_TEXT },
];

let pool;
let admin;
let vendor;
let customer;
let partnerAId;
let languageId;
let categoryIds;
let otherOwner;
let otherManager;
let ownManager;
let publishedTourId;
let draftTourId;

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
  return res.body.data.access_token;
}

async function registerUser(label) {
  const email = `depth-${label}-${SUFFIX}@example.test`;
  const password = 'Depth-Test-Pass1!';
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Depth',
    lastName: label,
  });
  return { userId: res.body.data.user.id, email, password };
}

const as = (token, req) => req.set('Authorization', `Bearer ${token}`);

async function createTour(title) {
  const res = await as(vendor, request(app).post('/api/v1/listings')).send({
    partnerId: partnerAId,
    listingType: 'TOUR',
    translations: [{ languageId, title: `${title} ${SUFFIX}` }],
    categoryIds: [categoryIds.tours],
  });
  return ensure(res, 201).body.data.id;
}

const patchAs = (token, id, body) =>
  as(token, request(app).patch(`/api/v1/listings/${id}`)).send(body);

const factsOf = (listing) =>
  Object.fromEntries(
    listing.attribute_values.map((entry) => [
      entry.code,
      entry.option_codes ?? entry.value,
    ]),
  );

async function metadata(slug) {
  const res = await request(app).get(
    `/api/v1/listings/metadata?categoryId=${categoryIds[slug]}&locale=en`,
  );
  return ensure(res, 200).body.data;
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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerA]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerAId = partnerA.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [categories] = await pool.query(
    'SELECT id, slug FROM listing_categories',
  );
  categoryIds = Object.fromEntries(categories.map((row) => [row.slug, row.id]));

  // A second, unrelated company with its own owner — the seed has only one
  // partner (same convention as managerLifecycle.test.js).
  const ownerB = await registerUser('owner-b');
  const [[approved]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  const [partnerB] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Depth Partner B LLC',
      'Depth Partner B',
      `depth-partner-b-${SUFFIX}`,
      approved.id,
      approved.id,
      ownerB.userId,
    ],
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerB.insertId, ownerB.userId, ownerRole.id],
  );
  otherOwner = await login(ownerB.email, ownerB.password);

  // Two platform Managers: one assigned to company B, one to company A.
  const managerB = await registerUser('manager-b');
  const managerA = await registerUser('manager-a');
  await Promise.all(
    [managerB, managerA].map((manager) =>
      as(admin, request(app).post('/api/v1/managers/admin/promote')).send({
        userId: manager.userId,
      }),
    ),
  );
  ensure(
    await as(
      admin,
      request(app).post(`/api/v1/managers/admin/${managerB.userId}/companies`),
    ).send({ partnerId: partnerB.insertId }),
    200,
  );
  ensure(
    await as(
      admin,
      request(app).post(`/api/v1/managers/admin/${managerA.userId}/companies`),
    ).send({ partnerId: partnerAId }),
    200,
  );
  // Roles are read into the token at login, so log in after promotion.
  otherManager = await login(managerB.email, managerB.password);
  ownManager = await login(managerA.email, managerA.password);

  publishedTourId = await createTour('Depth published tour');
  ensure(
    await patchAs(vendor, publishedTourId, { attributeValues: TOUR_FACTS }),
    200,
  );
  await pool.query(
    "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id = ?",
    [publishedTourId],
  );
  draftTourId = await createTour('Depth draft tour');
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('category metadata offers the new facts — to the right categories only', () => {
  test('tours: guide, transport, food, weather and where it ends (its details only once it ends elsewhere)', async () => {
    const tours = await metadata('tours');
    const byCode = new Map(tours.attributes.map((a) => [a.code, a]));
    [
      'guide_type',
      'transport_modes',
      'meals_included',
      'weather_policy',
      'end_point_type',
      'end_point_details',
    ].forEach((code) => expect(byCode.has(code)).toBe(true));
    expect(byCode.get('end_point_details').depends_on).toEqual({
      attribute_code: 'end_point_type',
      option_code: 'ENDS_ELSEWHERE',
    });
    expect(byCode.get('guide_type').is_required).toBe(false);
    expect(byCode.has('seating_type')).toBe(false);
  });

  test('entertainment venues: seating; cars are never offered tour facts', async () => {
    const venues = await metadata('entertainment-venues');
    expect(venues.attributes.map((a) => a.code)).toContain('seating_type');
    const cars = await metadata('car-rentals');
    const carCodes = cars.attributes.map((a) => a.code);
    expect(carCodes).not.toContain('guide_type');
    expect(carCodes).not.toContain('seating_type');
  });

  test.each(['restaurants', 'attractions', 'entertainment-venues'])(
    '%s can state step-free access and an accessible bathroom',
    async (slug) => {
      const data = await metadata(slug);
      const keys = data.amenity_groups.flatMap((group) =>
        group.amenities.map((amenity) => amenity.key),
      );
      expect(keys).toEqual(
        expect.arrayContaining(['STEP_FREE_ACCESS', 'ACCESSIBLE_BATHROOM']),
      );
    },
  );
});

describe('partner input → public listing', () => {
  test('every new fact the partner saves reaches the public response, free text as plain data', async () => {
    const res = ensure(
      await request(app).get(`/api/v1/listings/${publishedTourId}`),
      200,
    );
    expect(factsOf(res.body.data)).toEqual(
      expect.objectContaining({
        guide_type: ['DRIVER_GUIDE'],
        transport_modes: expect.arrayContaining(['MINIBUS', 'ON_FOOT']),
        meals_included: expect.arrayContaining(['LUNCH', 'TASTING']),
        weather_policy: ['ALL_WEATHER'],
        end_point_type: ['ENDS_ELSEWHERE'],
        end_point_details: SCRIPT_TEXT,
      }),
    );
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  test('an unknown choice is refused', async () => {
    const res = await patchAs(vendor, draftTourId, {
      attributeValues: [{ code: 'guide_type', optionCodes: ['ROBOT_GUIDE'] }],
    });
    expect(res.status).toBe(422);
    const multi = await patchAs(vendor, draftTourId, {
      attributeValues: [
        { code: 'transport_modes', optionCodes: ['ON_FOOT', 'TELEPORT'] },
      ],
    });
    expect(multi.status).toBe(422);
  });

  test('a single choice takes exactly one option', async () => {
    const res = await patchAs(vendor, draftTourId, {
      attributeValues: [
        {
          code: 'weather_policy',
          optionCodes: ['ALL_WEATHER', 'WEATHER_DEPENDENT'],
        },
      ],
    });
    expect(res.status).toBe(422);
  });

  test('end point details are refused while the tour returns to its start, and cleared when it starts to', async () => {
    const refused = await patchAs(vendor, draftTourId, {
      attributeValues: [
        { code: 'end_point_type', optionCodes: ['RETURNS_TO_START'] },
        { code: 'end_point_details', value: 'Somewhere else' },
      ],
    });
    expect(refused.status).toBe(422);

    ensure(
      await patchAs(vendor, draftTourId, {
        attributeValues: [
          { code: 'end_point_type', optionCodes: ['ENDS_ELSEWHERE'] },
          { code: 'end_point_details', value: 'Republic Square' },
        ],
      }),
      200,
    );
    ensure(
      await patchAs(vendor, draftTourId, {
        attributeValues: [
          { code: 'end_point_type', optionCodes: ['RETURNS_TO_START'] },
        ],
      }),
      200,
    );
    const listing = ensure(
      await as(vendor, request(app).get(`/api/v1/listings/${draftTourId}`)),
      200,
    ).body.data;
    expect(factsOf(listing)).not.toHaveProperty('end_point_details');
  });

  test('free text over 255 characters is refused', async () => {
    const res = await patchAs(vendor, draftTourId, {
      attributeValues: [
        { code: 'end_point_type', optionCodes: ['ENDS_ELSEWHERE'] },
        { code: 'end_point_details', value: 'x'.repeat(256) },
      ],
    });
    expect(res.status).toBe(422);
  });

  test("a tour fact is refused on another category's listing", async () => {
    const res = await as(vendor, request(app).post('/api/v1/listings')).send({
      partnerId: partnerAId,
      listingType: 'CAR_RENTAL',
      translations: [{ languageId, title: `Depth car ${SUFFIX}` }],
      categoryIds: [categoryIds['car-rentals']],
      attributeValues: [{ code: 'guide_type', optionCodes: ['LIVE_GUIDE'] }],
    });
    expect(res.status).toBe(422);
  });

  test('every new fact is optional: a tour without them saves and reads back empty', async () => {
    const id = await createTour('Depth legacy tour');
    const listing = ensure(
      await as(vendor, request(app).get(`/api/v1/listings/${id}`)),
      200,
    ).body.data;
    expect(listing.attribute_values).toEqual([]);
  });
});

describe('who may edit and who sees the management shape — tenant isolation', () => {
  const edit = (token, id) =>
    patchAs(token, id, {
      attributeValues: [{ code: 'guide_type', optionCodes: ['AUDIO_GUIDE'] }],
    });

  test.each([
    ['anonymous', () => null, 401],
    ['a customer', () => customer, 403],
    ["another company's owner", () => otherOwner, 403],
    ["another company's Manager", () => otherManager, 403],
  ])('%s cannot edit the facts', async (_label, token, status) => {
    const req = request(app)
      .patch(`/api/v1/listings/${draftTourId}`)
      .send({
        attributeValues: [{ code: 'guide_type', optionCodes: ['AUDIO_GUIDE'] }],
      });
    const res = token() ? await as(token(), req) : await req;
    expect(res.status).toBe(status);
  });

  test.each([
    ["another company's owner", () => otherOwner],
    ["another company's Manager", () => otherManager],
  ])(
    '%s reads the public shape of a published listing and nothing of a draft',
    async (_label, token) => {
      const published = ensure(
        await as(
          token(),
          request(app).get(`/api/v1/listings/${publishedTourId}`),
        ),
        200,
      ).body.data;
      [
        'partner_id',
        'moderation_status',
        'moderation_notes',
        'created_at',
      ].forEach((field) => expect(published).not.toHaveProperty(field));
      const draft = await as(
        token(),
        request(app).get(`/api/v1/listings/${draftTourId}`),
      );
      expect(draft.status).toBe(404);
    },
  );

  test("the company's own assigned Manager may edit and reads the management shape", async () => {
    ensure(await edit(ownManager, draftTourId), 200);
    const listing = ensure(
      await as(ownManager, request(app).get(`/api/v1/listings/${draftTourId}`)),
      200,
    ).body.data;
    expect(listing.partner_id).toBe(partnerAId);
    expect(factsOf(listing).guide_type).toEqual(['AUDIO_GUIDE']);
  });
});

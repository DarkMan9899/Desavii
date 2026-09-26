/**
 * Step L5 — every rule the Partner UI relies on is also enforced by the
 * API on its own (direct-bypass payloads), and every rejection carries a
 * field path + issue the frontend can attach to the right input:
 *
 * - text caps match their columns and `error.details` carries the limit;
 * - dynamic attributes / policies / pricing models are checked against
 *   the listing's own category and their data type;
 * - dangerous URL schemes, impossible times, reversed CSV ranges and
 *   over-long blackout reasons are rejected before any write;
 * - protected lifecycle/ownership fields cannot be mass-assigned.
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
let auth;
let partnerId;
let languageId;
const categoryIdBySlug = {};
let seq = 0;

function unique(prefix) {
  seq += 1;
  return `${prefix} ${Date.now()}-${seq}`;
}

function details(res) {
  return res.body.error?.details ?? [];
}

async function createListing(slug) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set(auth)
    .send({
      partnerId,
      translations: [{ languageId, title: unique('L5') }],
      categoryIds: [categoryIdBySlug[slug]],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function patchListing(listingId, body) {
  return request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set(auth)
    .send(body);
}

async function getListing(listingId) {
  const res = await request(app).get(`/api/v1/listings/${listingId}`).set(auth);
  return res.body.data;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.vendor.email,
    password: DEV_CREDENTIALS.vendor.password,
  });
  auth = { Authorization: `Bearer ${loginRes.body.data.access_token}` };

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [categories] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug IN ('hotels', 'restaurants')",
  );
  categories.forEach((row) => {
    categoryIdBySlug[row.slug] = row.id;
  });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('text length feedback (translations)', () => {
  let listingId;

  beforeAll(async () => {
    listingId = await createListing('hotels');
  });

  function translation(fields) {
    return { translations: [{ languageId, title: 'Valid title', ...fields }] };
  }

  test.each([
    ['title at 255 characters', { title: 'a'.repeat(255) }],
    ['summary at 500 characters', { summary: 'b'.repeat(500) }],
    ['description at 20000 characters', { description: 'c'.repeat(20000) }],
    ['Armenian and Russian text', { title: 'Հյուրանոց Երևանում — Отель' }],
  ])('%s is accepted', async (_label, fields) => {
    const res = await patchListing(listingId, translation(fields));
    expect(res.status).toBe(200);
  });

  test.each([
    ['title', { title: 'a'.repeat(256) }, 255],
    ['summary', { summary: 'b'.repeat(501) }, 500],
    ['description', { description: 'c'.repeat(20001) }, 20000],
  ])(
    'an over-long %s is rejected with the limit in error.details',
    async (field, fields, maximum) => {
      const res = await patchListing(listingId, translation(fields));
      expect(res.status).toBe(422);
      expect(details(res)).toEqual([
        {
          field: `body.translations.0.${field}`,
          issue: 'too_big',
          maximum,
          type: 'string',
        },
      ]);
    },
  );

  test('a whitespace-only title is rejected (trimmed to empty)', async () => {
    const res = await patchListing(listingId, translation({ title: '   ' }));
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      {
        field: 'body.translations.0.title',
        issue: 'too_small',
        minimum: 1,
        type: 'string',
      },
    ]);
  });

  test('an invalid enum value is never echoed back in error.details', async () => {
    const res = await request(app)
      .get('/api/v1/listings/mine')
      .query({ status: '<script>alert(1)</script>' })
      .set(auth);
    const serialized = JSON.stringify(res.body.error ?? {});
    expect(serialized).not.toContain('<script>');
  });
});

describe('dynamic attributes — category scope, enum options, atomicity', () => {
  test('a known ENUM option is accepted', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      attributeValues: [{ code: 'star_rating', optionCodes: ['4'] }],
    });
    expect(res.status).toBe(200);
  });

  test('an unknown ENUM option is rejected on that attribute field', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      attributeValues: [{ code: 'star_rating', optionCodes: ['7'] }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'attributeValues.star_rating', issue: 'UNKNOWN_OPTION_CODE' },
    ]);
  });

  test('a single-choice ENUM with two options is rejected', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      attributeValues: [{ code: 'star_rating', optionCodes: ['3', '4'] }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      {
        field: 'attributeValues.star_rating',
        issue: 'too_big',
        type: 'array',
        maximum: 1,
      },
    ]);
  });

  test('an attribute from another category is rejected (hotel + car transmission)', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      attributeValues: [{ code: 'transmission', optionCodes: ['MANUAL'] }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      {
        field: 'attributeValues.transmission',
        issue: 'UNKNOWN_ATTRIBUTE_CODE',
      },
    ]);
  });

  test('a MULTI_ENUM with one invalid option is rejected atomically — the previous value survives', async () => {
    const listingId = await createListing('restaurants');
    const first = await patchListing(listingId, {
      attributeValues: [{ code: 'cuisine', optionCodes: ['ARMENIAN'] }],
    });
    expect(first.status).toBe(200);

    const res = await patchListing(listingId, {
      attributeValues: [
        { code: 'cuisine', optionCodes: ['ITALIAN', 'NOT_A_CUISINE'] },
      ],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'attributeValues.cuisine', issue: 'UNKNOWN_OPTION_CODE' },
    ]);

    const listing = await getListing(listingId);
    expect(listing.attribute_values).toEqual([
      { code: 'cuisine', option_codes: ['ARMENIAN'] },
    ]);
  });

  test('a MULTI_ENUM listing the same option twice is rejected', async () => {
    const listingId = await createListing('restaurants');
    const res = await patchListing(listingId, {
      attributeValues: [
        { code: 'cuisine', optionCodes: ['ARMENIAN', 'ARMENIAN'] },
      ],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'attributeValues.cuisine', issue: 'DUPLICATE_OPTION_CODE' },
    ]);
  });

  test('a numeric range error carries the metadata limit', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      attributeValues: [{ code: 'total_rooms', value: 1000 }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      {
        field: 'attributeValues.total_rooms',
        issue: 'ABOVE_MAXIMUM',
        maximum: 999,
      },
    ]);
  });
});

describe('policies and pricing — category scope and type', () => {
  test('a BOOLEAN policy accepts "true" and rejects any other string', async () => {
    const listingId = await createListing('hotels');
    const ok = await patchListing(listingId, {
      policyValues: [{ code: 'pets_allowed', value: 'true' }],
    });
    expect(ok.status).toBe(200);

    const res = await patchListing(listingId, {
      policyValues: [{ code: 'pets_allowed', value: 'maybe' }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'policyValues.pets_allowed', issue: 'invalid_enum_value' },
    ]);
    const listing = await getListing(listingId);
    expect(listing.policy_values).toEqual([
      { code: 'pets_allowed', value: 'true' },
    ]);
  });

  test('a policy from another category is rejected (restaurant + pets_allowed)', async () => {
    const listingId = await createListing('restaurants');
    const res = await patchListing(listingId, {
      policyValues: [{ code: 'pets_allowed', value: 'true' }],
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'policyValues.pets_allowed', issue: 'UNKNOWN_POLICY_CODE' },
    ]);
  });

  test('a pricing model not offered for the category is rejected (hotel + PER_PERSON)', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      pricing: { modelCode: 'PER_PERSON', amount: 50, currencyCode: 'AMD' },
    });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'pricing.modelCode', issue: 'UNKNOWN_PRICING_MODEL' },
    ]);
  });

  test('the category own pricing model is accepted (hotel + PER_NIGHT)', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      pricing: { modelCode: 'PER_NIGHT', amount: 50, currencyCode: 'AMD' },
    });
    expect(res.status).toBe(200);
  });
});

describe('URL scheme', () => {
  test.each([
    // eslint-disable-next-line no-script-url -- the dangerous URL is the input under test
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['ftp:', 'ftp://example.com/listing'],
  ])('a %s canonicalUrl is rejected', async (_label, canonicalUrl) => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, { canonicalUrl });
    expect(res.status).toBe(422);
    expect(details(res).map((d) => d.field)).toContain('body.canonicalUrl');
  });

  test('an https canonicalUrl is accepted', async () => {
    const listingId = await createListing('hotels');
    const res = await patchListing(listingId, {
      canonicalUrl: 'https://desavii.example/hy/listings/hotel',
    });
    expect(res.status).toBe(200);
  });
});

describe('mass assignment', () => {
  test('status, moderation, ownership and lifecycle fields in a PATCH body are ignored', async () => {
    const listingId = await createListing('hotels');
    const before = await getListing(listingId);

    const res = await patchListing(listingId, {
      translations: [{ languageId, title: 'Still a draft' }],
      status: 'PUBLISHED',
      statusCode: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      moderationNotes: 'self-approved',
      partnerId: partnerId + 999,
      publishedAt: '2026-01-01T00:00:00Z',
      expiresAt: '2099-01-01T00:00:00Z',
      categoryIds: [categoryIdBySlug.restaurants],
    });
    expect(res.status).toBe(200);

    const after = await getListing(listingId);
    expect(after.status).toBe(before.status);
    expect(after.moderation_status).toBe(before.moderation_status);
    expect(after.partner_id).toBe(partnerId);
    const [[row]] = await pool.query(
      'SELECT published_at, expires_at FROM listings WHERE id = ?',
      [listingId],
    );
    expect(row.published_at).toBeNull();
    expect(row.expires_at).toBeNull();
    const [categoryRows] = await pool.query(
      'SELECT category_id AS categoryId FROM listing_category_listing WHERE listing_id = ?',
      [listingId],
    );
    expect(categoryRows.map((r) => r.categoryId)).toEqual([
      categoryIdBySlug.hotels,
    ]);
  });
});

describe('availability text and time inputs', () => {
  let listingId;
  let unitId;

  beforeAll(async () => {
    listingId = await createListing('hotels');
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set(auth)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 3 });
    unitId = unitRes.body.data.id;
  });

  test('a blackout reason at the VARCHAR(255) limit is accepted; 256 is rejected', async () => {
    const ok = await request(app)
      .post('/api/v1/availability/blackouts')
      .set(auth)
      .send({
        listingId,
        dateFrom: '2027-09-01',
        dateTo: '2027-09-02',
        reason: 'r'.repeat(255),
      });
    expect(ok.status).toBe(201);

    const res = await request(app)
      .post('/api/v1/availability/blackouts')
      .set(auth)
      .send({
        listingId,
        dateFrom: '2027-09-05',
        dateTo: '2027-09-06',
        reason: 'r'.repeat(256),
      });
    expect(res.status).toBe(422);
    expect(details(res)).toEqual([
      { field: 'body.reason', issue: 'too_big', maximum: 255, type: 'string' },
    ]);
  });

  test.each(['99:99', '24:00', '9:30', '12:60'])(
    'an impossible time slot "%s" is rejected before the DB',
    async (timeSlotStart) => {
      const res = await request(app)
        .post('/api/v1/availability/units')
        .set(auth)
        .send({
          listingId,
          bookableUnitType: 'TOUR_DEPARTURE',
          unitLabel: unique('slot'),
          timeSlotStart,
          timeSlotEnd: '23:00',
        });
      expect(res.status).toBe(422);
      expect(details(res).map((d) => d.field)).toContain('body.timeSlotStart');
    },
  );

  test('a valid time slot is accepted', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set(auth)
      .send({
        listingId,
        bookableUnitType: 'TOUR_DEPARTURE',
        unitLabel: unique('slot'),
        timeSlotStart: '09:30',
        timeSlotEnd: '13:00',
      });
    expect(res.status).toBe(201);
  });

  test('a CSV bulk-import row ending before it starts rejects the batch with no rows written', async () => {
    const [[{ rowsBefore }]] = await pool.query(
      'SELECT COUNT(*) AS rowsBefore FROM external_reservations WHERE bookable_unit_id = ?',
      [unitId],
    );
    const res = await request(app)
      .post('/api/v1/availability/external-reservations/bulk-import')
      .set(auth)
      .send({
        unitId,
        sourceCode: 'OTHER',
        rows: [{ dateFrom: '2027-10-05', dateTo: '2027-10-01' }],
      });
    expect(res.status).toBe(422);
    expect(details(res).map((d) => d.field)).toContain('body.rows.0.dateTo');
    const [[{ rowsAfter }]] = await pool.query(
      'SELECT COUNT(*) AS rowsAfter FROM external_reservations WHERE bookable_unit_id = ?',
      [unitId],
    );
    expect(rowsAfter).toBe(rowsBefore);
  });

  test('external reservation guest text is trimmed before it is stored', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set(auth)
      .send({
        unitId,
        dateFrom: '2027-11-01',
        dateTo: '2027-11-01',
        sourceCode: 'PHONE',
        guestName: '   Ana Smith   ',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.guest_name).toBe('Ana Smith');
  });
});

describe('opening hours direct-API bypass', () => {
  let listingId;

  beforeAll(async () => {
    listingId = await createListing('restaurants');
  });

  function putHours(days) {
    return request(app)
      .put(`/api/v1/listings/${listingId}/opening-hours`)
      .set(auth)
      .send({ days });
  }

  test('a valid week (including an overnight 18:00-02:00 day) is accepted', async () => {
    const res = await putHours([
      { dayOfWeek: 0, opensAt: '09:00', closesAt: '17:00' },
      { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
      { dayOfWeek: 6, isClosed: true },
    ]);
    expect(res.status).toBe(200);
  });

  test.each([
    ['a malformed time', { dayOfWeek: 1, opensAt: '25:00', closesAt: '17:00' }],
    [
      'an invalid weekday',
      { dayOfWeek: 7, opensAt: '09:00', closesAt: '17:00' },
    ],
    [
      'an open day missing its closing time',
      { dayOfWeek: 2, opensAt: '09:00' },
    ],
  ])('%s is rejected', async (_label, day) => {
    const res = await putHours([day]);
    expect(res.status).toBe(422);
    expect(details(res).length).toBeGreaterThan(0);
  });

  test('the same weekday twice is rejected', async () => {
    const res = await putHours([
      { dayOfWeek: 3, opensAt: '09:00', closesAt: '12:00' },
      { dayOfWeek: 3, opensAt: '13:00', closesAt: '17:00' },
    ]);
    expect(res.status).toBe(422);
  });
});

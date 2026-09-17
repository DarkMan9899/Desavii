/**
 * Company Public Profile (Step A1): `GET /partners/:slug/listings` — all
 * of a company's currently PUBLISHED listings, across every category.
 * Uses the seeded, already-APPROVED partner
 * (`seeds/005_dev_accounts.js`: "Yerevan Boutique Hospitality",
 * `yerevan-boutique-hospitality`) as "Company A", plus a fresh,
 * directly-inserted APPROVED "Company B" partner to prove tenant
 * isolation (no established API endpoint publishes a partner
 * immediately, so this test inserts it directly, the same way
 * `mysqlPartnerRepository.js#createApplication` writes a `partners` row
 * — just with APPROVED statuses instead of DRAFT/PENDING).
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

let vendor;
let languageId;
let companyASlug;
let companyAPartnerId;
let companyBSlug;
let hotelListingId;
let tourListingId;
let draftListingId;
let companyBListingId;
let emptyCompanySlug;
let multiLanguageListingId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

// Only HOTEL has required policies among the categories this fixture
// uses (`ListingService#checkPublishReadiness`'s REQUIRED_POLICY_MISSING
// check) — same values the existing advertisementLifecycle.test.js fixture
// already uses successfully.
const REQUIRED_POLICIES_BY_TYPE = {
  HOTEL: [
    { code: 'cancellation_policy', value: 'FLEXIBLE' },
    { code: 'check_in_time', value: '14:00' },
    { code: 'check_out_time', value: '11:00' },
  ],
  TOUR: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
};

async function createListing({ partnerId, listingType, title, categorySlug }) {
  const pool = getMysqlPool();
  // `categoryIds` is the real field `ListingService#createListing` uses
  // to both write the `listing_category_listing` row AND resolve
  // `primaryCategoryId` for policy/attribute/pricing validation
  // (`listingService.js:412`) — a direct `listing_category_listing`
  // INSERT bypasses that resolution entirely and leaves policy values
  // with no category to validate against ("Policy values require a
  // category to validate against").
  let categoryIds;
  if (categorySlug) {
    const [[category]] = await pool.query(
      'SELECT id FROM listing_categories WHERE slug = ?',
      [categorySlug],
    );
    categoryIds = [category.id];
  }
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType,
      translations: [{ languageId, title }],
      ...(categoryIds ? { categoryIds } : {}),
    });
  const listingId = createRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      ...(REQUIRED_POLICIES_BY_TYPE[listingType]
        ? { policyValues: REQUIRED_POLICIES_BY_TYPE[listingType] }
        : {}),
    });
  return listingId;
}

async function publishListing(listingId, bookableUnitType) {
  const ONE_PX_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType, capacity: 1 });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );

  const pool = getMysqlPool();
  const [[vendorUser]] = await pool.query(
    'SELECT id FROM users WHERE email = ?',
    [DEV_CREDENTIALS.vendor.email],
  );
  const vendorUserId = vendorUser.id;
  const [[companyA]] = await pool.query(
    "SELECT id, slug FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  companyAPartnerId = companyA.id;
  companyASlug = companyA.slug;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;

  // Company B — a second, fresh, directly-APPROVED partner (tenant
  // isolation fixture). Same INSERT shape as
  // `mysqlPartnerRepository.js#createApplication`, with APPROVED
  // statuses substituted for DRAFT/PENDING (no self-service endpoint
  // publishes a partner immediately).
  const uniqueSuffix = Date.now();
  companyBSlug = `test-company-b-${uniqueSuffix}`;
  const [companyBResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id, created_by, updated_by)
     VALUES (?, ?, ?,
       (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'),
       (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'),
       ?, ?, ?)`,
    [
      'Test Company B Legal Name',
      'Test Company B',
      companyBSlug,
      vendorUserId,
      vendorUserId,
      vendorUserId,
    ],
  );
  const companyBPartnerId = companyBResult.insertId;
  // `POST /listings` requires the caller to be a member of the target
  // partner — the test's own vendor login only belongs to the seeded
  // Company A by default, so it needs its own OWNER row on Company B
  // too, purely as test fixture setup (same INSERT shape
  // `createApplication` already uses for a real onboarding OWNER row).
  await pool.query(
    `INSERT INTO partner_employees (partner_id, user_id, role_id, created_by, updated_by)
     VALUES (?, ?, (SELECT id FROM partner_employee_roles WHERE code = 'OWNER'), ?, ?)`,
    [companyBPartnerId, vendorUserId, vendorUserId, vendorUserId],
  );

  // A third, fresh, APPROVED partner with zero listings at all.
  emptyCompanySlug = `test-company-empty-${uniqueSuffix}`;
  await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id, created_by, updated_by)
     VALUES (?, ?, ?,
       (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'),
       (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'),
       ?, ?, ?)`,
    [
      'Test Empty Company Legal Name',
      'Test Empty Company',
      emptyCompanySlug,
      vendorUserId,
      vendorUserId,
      vendorUserId,
    ],
  );

  // Company A: one published HOTEL, one published TOUR (multi-category),
  // and one DRAFT (never published) HOTEL — the visibility-rule fixture.
  hotelListingId = await createListing({
    partnerId: companyAPartnerId,
    listingType: 'HOTEL',
    title: `Company A Public Hotel ${uniqueSuffix}`,
    categorySlug: 'hotels',
  });
  await publishListing(hotelListingId, 'HOTEL_ROOM');

  tourListingId = await createListing({
    partnerId: companyAPartnerId,
    listingType: 'TOUR',
    title: `Company A Public Tour ${uniqueSuffix}`,
    categorySlug: 'tours',
  });
  await publishListing(tourListingId, 'TOUR_DEPARTURE');

  draftListingId = await createListing({
    partnerId: companyAPartnerId,
    listingType: 'HOTEL',
    title: `Company A Draft Hotel ${uniqueSuffix}`,
    categorySlug: 'hotels',
  });
  // Deliberately never published — stays DRAFT.

  // Company B: one published listing of its own, to prove Company A's
  // endpoint never returns it.
  companyBListingId = await createListing({
    partnerId: companyBPartnerId,
    listingType: 'HOTEL',
    title: `Company B Public Hotel ${uniqueSuffix}`,
    categorySlug: 'hotels',
  });
  await publishListing(companyBListingId, 'HOTEL_ROOM');

  // A published listing with translations in more than one language —
  // the regression fixture for the row-fan-out bug `listPublicListingsForPartner`
  // used to have (an unscoped `LEFT JOIN listing_translations` duplicated
  // the row once per authored language).
  multiLanguageListingId = await createListing({
    partnerId: companyAPartnerId,
    listingType: 'HOTEL',
    title: `Company A Multilingual Hotel ${uniqueSuffix}`,
    categorySlug: 'hotels',
  });
  const [[hyLanguage]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'hy'",
  );
  await request(app)
    .patch(`/api/v1/listings/${multiLanguageListingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      translations: [
        {
          languageId: hyLanguage.id,
          title: `Company A Multilingual Hotel HY ${uniqueSuffix}`,
        },
      ],
    });
  await publishListing(multiLanguageListingId, 'HOTEL_ROOM');
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /partners/:slug/listings (Company Public Profile — Step A1)', () => {
  test('is public, no auth required, and returns real listings across multiple categories', async () => {
    let allRows = [];
    let cursor;
    let meta;
    do {
      // eslint-disable-next-line no-await-in-loop -- sequential pagination walk, not a hot path
      const res = await request(app)
        .get(`/api/v1/partners/${companyASlug}/listings`)
        .query({ limit: 100, ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      allRows = allRows.concat(res.body.data);
      meta = res.body.meta;
      cursor = meta.next_cursor;
    } while (meta.has_more);

    const hotelRow = allRows.find((row) => row.id === hotelListingId);
    const tourRow = allRows.find((row) => row.id === tourListingId);

    expect(hotelRow).toEqual(
      expect.objectContaining({
        id: hotelListingId,
        listing_type: 'HOTEL',
        category_slug: 'hotels',
        title: expect.stringContaining('Company A Public Hotel'),
      }),
    );
    expect(tourRow).toEqual(
      expect.objectContaining({
        id: tourListingId,
        listing_type: 'TOUR',
        category_slug: 'tours',
        title: expect.stringContaining('Company A Public Tour'),
      }),
    );
  });

  test('only PUBLISHED listings are returned (a draft listing is excluded)', async () => {
    let allRows = [];
    let cursor;
    let meta;
    do {
      // eslint-disable-next-line no-await-in-loop -- sequential pagination walk, not a hot path
      const res = await request(app)
        .get(`/api/v1/partners/${companyASlug}/listings`)
        .query({ limit: 100, ...(cursor ? { cursor } : {}) });
      allRows = allRows.concat(res.body.data);
      meta = res.body.meta;
      cursor = meta.next_cursor;
    } while (meta.has_more);

    expect(allRows.some((row) => row.id === draftListingId)).toBe(false);
  });

  test("never returns another company's listings (tenant isolation)", async () => {
    let allRows = [];
    let cursor;
    let meta;
    do {
      // eslint-disable-next-line no-await-in-loop -- sequential pagination walk, not a hot path
      const res = await request(app)
        .get(`/api/v1/partners/${companyASlug}/listings`)
        .query({ limit: 100, ...(cursor ? { cursor } : {}) });
      allRows = allRows.concat(res.body.data);
      meta = res.body.meta;
      cursor = meta.next_cursor;
    } while (meta.has_more);

    expect(allRows.some((row) => row.id === companyBListingId)).toBe(false);
  });

  test("Company B's own endpoint returns only its own listing, not Company A's", async () => {
    const res = await request(app).get(
      `/api/v1/partners/${companyBSlug}/listings`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ id: companyBListingId }),
    ]);
    expect(res.body.data.some((row) => row.id === hotelListingId)).toBe(false);
    expect(res.body.data.some((row) => row.id === tourListingId)).toBe(false);
  });

  test('a real public company with zero published listings returns 200 with an empty array, never 404', async () => {
    const res = await request(app).get(
      `/api/v1/partners/${emptyCompanySlug}/listings`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual(expect.objectContaining({ has_more: false }));
  });

  test('returns 404 for an unknown company slug', async () => {
    const res = await request(app).get(
      '/api/v1/partners/not-a-real-company-slug/listings',
    );
    expect(res.status).toBe(404);
  });

  test('supports a limit query param', async () => {
    const res = await request(app)
      .get(`/api/v1/partners/${companyASlug}/listings`)
      .query({ limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  test('never exposes partner-internal fields on a listing row', async () => {
    const res = await request(app).get(
      `/api/v1/partners/${companyASlug}/listings`,
    );
    const hotelRow = res.body.data.find((row) => row.id === hotelListingId);
    expect(hotelRow).toBeDefined();
    expect(hotelRow).not.toHaveProperty('owner_user_id');
    expect(hotelRow).not.toHaveProperty('legal_name');
    expect(hotelRow).not.toHaveProperty('review_note');
    expect(hotelRow).not.toHaveProperty('partner_id');
  });

  test('a listing with translations in more than one language appears exactly once (no row fan-out)', async () => {
    let allRows = [];
    let cursor;
    let meta;
    do {
      // eslint-disable-next-line no-await-in-loop -- sequential pagination walk, not a hot path
      const res = await request(app)
        .get(`/api/v1/partners/${companyASlug}/listings`)
        .query({ limit: 100, ...(cursor ? { cursor } : {}) });
      allRows = allRows.concat(res.body.data);
      meta = res.body.meta;
      cursor = meta.next_cursor;
    } while (meta.has_more);

    const matches = allRows.filter((row) => row.id === multiLanguageListingId);
    expect(matches).toHaveLength(1);
  });

  test('response shape is stable: real value or null for every category field, never fabricated', async () => {
    const res = await request(app).get(
      `/api/v1/partners/${companyASlug}/listings`,
    );
    const hotelRow = res.body.data.find((row) => row.id === hotelListingId);
    // This Hotel test fixture never authored a star_rating attribute —
    // real card metadata beyond category_slug/listing_type stays null,
    // never a guessed default.
    expect(hotelRow).toEqual(
      expect.objectContaining({
        star_rating: null,
        cuisine: null,
        price_tier: null,
        transmission: null,
        bedrooms: null,
        duration_minutes: null,
      }),
    );
  });
});

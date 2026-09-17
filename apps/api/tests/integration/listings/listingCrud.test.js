/**
 * Sprint 7: "Create/Update/Delete listing, Publish/Unpublish, Draft
 * support, Listing status management, Slug uniqueness." Exercises the
 * full lifecycle against the real seeded partner
 * (`vendor@travelhub.dev` owns the verified `yerevan-boutique-hospitality`
 * partner, seeds/005_dev_accounts.js) plus a second, unverified partner
 * inserted directly for the `PARTNER_NOT_VERIFIED` case.
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
let vendor;
let customer;
let partnerId;
let unverifiedPartnerId;
let languageId;
let categoryId;
let amenityId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

function buildPayload(overrides = {}) {
  return {
    partnerId,
    listingType: 'HOTEL',
    translations: [
      {
        languageId,
        title: `Test Hotel ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        summary: 'A nice place to stay.',
        description: 'Full description of the listing.',
      },
    ],
    categoryIds: [categoryId],
    amenityIds: [amenityId],
    ...overrides,
  };
}

async function createDraftListing(overrides = {}) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send(buildPayload(overrides));
  return res;
}

/**
 * Phase 5: the `hotels` category has required policies (`cancellation_
 * policy`/`check_in_time`/`check_out_time`, seeds/007_pricing_and_policies
 * .js) and every listing now needs >=1 bookable unit to publish
 * (`ListingService#checkPublishReadiness`) — both satisfied here so this
 * file's publish assertions keep exercising the pre-existing translation/
 * image/location gates, not the newer ones.
 */
async function makePublishable(listingId) {
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
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
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;

  const [[pendingStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'PENDING'",
  );
  const [[approvedStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  const [unverifiedPartnerResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Unverified Partner LLC',
      'Unverified Partner',
      `unverified-partner-${Date.now()}`,
      pendingStatus.id,
      approvedStatus.id,
      vendor.userId,
    ],
  );
  unverifiedPartnerId = unverifiedPartnerResult.insertId;
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [unverifiedPartnerId, vendor.userId, ownerRole.id],
  );

  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[category]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  categoryId = category.id;
  const [[amenity]] = await pool.query(
    "SELECT id FROM listing_amenities WHERE name = 'WiFi'",
  );
  amenityId = amenity.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /listings — create', () => {
  test('creates a listing that always starts in DRAFT', async () => {
    const res = await createDraftListing();
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.partner_id).toBe(partnerId);
    expect(res.body.data.slug).toEqual(expect.any(String));
  });

  test('rejects a duplicate slug with 409 SLUG_ALREADY_EXISTS', async () => {
    const slug = `fixed-slug-${Date.now()}`;
    const first = await createDraftListing({ slug });
    expect(first.status).toBe(201);

    const second = await createDraftListing({ slug });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SLUG_ALREADY_EXISTS');
  });

  test('rejects creation for an unverified partner with 403 PARTNER_NOT_VERIFIED', async () => {
    const res = await createDraftListing({ partnerId: unverifiedPartnerId });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PARTNER_NOT_VERIFIED');
  });

  test('rejects an unknown listing type with 422', async () => {
    const res = await createDraftListing({ listingType: 'SPACESHIP' });
    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'UNKNOWN_LISTING_TYPE'),
    ).toBe(true);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send(buildPayload());
    expect(res.status).toBe(401);
  });
});

describe('GET /listings/:id — visibility', () => {
  test("a stranger gets 404 on someone else's draft (existence not leaked)", async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(404);
  });

  test('the owner can see their own draft', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
  });

  test('an unauthenticated request gets 404 on a draft', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(404);
  });

  test('a published listing is publicly visible', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
  });

  // Phase 20 (SEO): the same public route now also accepts the listing's
  // slug — regression coverage for a real bug found while wiring it up:
  // `findBySlug` was a never-finished stub that returned only the bare
  // row (no translations/media/pricing/etc.), which crashed the DTO
  // mapper with a 500 the first time anything actually called it.
  test('the same listing is reachable by slug, with an identical fully-assembled shape to the id lookup', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const byId = await request(app).get(`/api/v1/listings/${listingId}`);
    const { slug } = byId.body.data;

    const bySlug = await request(app).get(`/api/v1/listings/${slug}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data).toEqual(byId.body.data);
  });

  test('an unknown slug 404s rather than erroring', async () => {
    const res = await request(app).get(
      '/api/v1/listings/this-slug-does-not-exist',
    );
    expect(res.status).toBe(404);
  });

  // Phase 6 (Listing Details): each translation now carries the language's
  // own code, and a location with a cityId resolves to human-readable
  // city/country names — both additive fields the detail page needs.
  test('translations expose language_code and a located listing resolves city_name/country_name', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { cityId: 1, latitude: 40.1772, longitude: 44.5035 } });

    const res = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.translations[0].language_code).toBe('en');
    expect(res.body.data.location.city_name).toBe('Yerevan');
    expect(res.body.data.location.country_name).toBe('Armenia');
  });
});

// Step A3 (Listing → Company Linking): the listing detail page's company
// attribution block reads this `company` field directly off `GET
// /listings/:id`.
describe('GET /listings/:id — company attribution (Step A3)', () => {
  test('a published listing exposes its real, public company identity', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    // `yerevan-boutique-hospitality` (seeds/005_dev_accounts.js) has no
    // logo authored — a real `null`, never a fabricated placeholder URL.
    expect(res.body.data.company).toEqual({
      slug: 'yerevan-boutique-hospitality',
      display_name: 'Yerevan Boutique Hospitality',
      logo_url: null,
      is_verified: true,
    });
  });

  test('never exposes private company fields alongside the public attribution', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(Object.keys(res.body.data.company).sort()).toEqual([
      'display_name',
      'is_verified',
      'logo_url',
      'slug',
    ]);
  });

  // The listing itself never disappears just because its company later
  // stops being publicly eligible (a real admin "suspend company" action,
  // `moderation_status_id` → FLAGGED) — only the attribution block does.
  // A dedicated partner/listing pair, not the shared `partnerId`, so
  // flagging it can't affect any other test in this file.
  test('company is null (never a broken link) once the owning partner is no longer publicly eligible, but the listing itself still renders', async () => {
    const [[approvedStatus]] = await pool.query(
      "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
    );
    const [[flaggedStatus]] = await pool.query(
      "SELECT id FROM moderation_statuses WHERE code = 'FLAGGED'",
    );
    const [[ownerRole]] = await pool.query(
      "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
    );
    const uniqueSuffix = Date.now();
    const [toBeFlaggedResult] = await pool.query(
      `INSERT INTO partners
        (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'To Be Flagged LLC',
        'To Be Flagged Company',
        `to-be-flagged-${uniqueSuffix}`,
        approvedStatus.id,
        approvedStatus.id,
        vendor.userId,
      ],
    );
    const toBeFlaggedPartnerId = toBeFlaggedResult.insertId;
    await pool.query(
      'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
      [toBeFlaggedPartnerId, vendor.userId, ownerRole.id],
    );

    const created = await createDraftListing({
      partnerId: toBeFlaggedPartnerId,
    });
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    await pool.query(
      'UPDATE partners SET moderation_status_id = ? WHERE id = ?',
      [flaggedStatus.id, toBeFlaggedPartnerId],
    );

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.company).toBeNull();
  });
});

// Listing Lifetime / Renewal, Step B2: schema/domain foundation only — no
// API surface exists yet for any of these columns (that's Step B3+). These
// tests prove the migration is safe (every new field defaults NULL,
// nothing existing behaves differently) and that the raw columns
// themselves impose no premature product-value constraint.
describe('Listing publication lifecycle — Step B2 foundation (schema/domain only)', () => {
  async function selectLifecycleColumns(listingId) {
    const [[row]] = await pool.query(
      `SELECT publication_period_days, expires_at, expiry_reminder_sent_at,
              frozen_at, purge_after, renewed_at
       FROM listings WHERE id = ?`,
      [listingId],
    );
    return row;
  }

  test('a newly created (DRAFT) listing has every new lifecycle field NULL', async () => {
    const created = await createDraftListing();
    const row = await selectLifecycleColumns(created.body.data.id);
    expect(row.publication_period_days).toBeNull();
    expect(row.expires_at).toBeNull();
    expect(row.expiry_reminder_sent_at).toBeNull();
    expect(row.frozen_at).toBeNull();
    expect(row.purge_after).toBeNull();
    expect(row.renewed_at).toBeNull();
  });

  test('publishing a listing leaves every new lifecycle field untouched (no expiry is assigned yet)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const publishRes = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(publishRes.status).toBe(200);

    const row = await selectLifecycleColumns(listingId);
    expect(row.expires_at).toBeNull();
    expect(row.frozen_at).toBeNull();
    expect(row.purge_after).toBeNull();
  });

  test('publication_period_days accepts any positive value — no product-list constraint at the schema layer yet (Step B3 owns that decision)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    // No API field exists for this yet — written directly to prove the
    // column itself has no CHECK/enum restricting it to a future fixed
    // list (30/90/180/365 or otherwise).
    await pool.query(
      'UPDATE listings SET publication_period_days = ? WHERE id = ?',
      [999, listingId],
    );
    const row = await selectLifecycleColumns(listingId);
    expect(row.publication_period_days).toBe(999);
  });

  test('GET /listings/:id never exposes any new lifecycle column in the public response', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('publication_period_days');
    expect(res.body.data).not.toHaveProperty('expires_at');
    expect(res.body.data).not.toHaveProperty('expiry_reminder_sent_at');
    expect(res.body.data).not.toHaveProperty('frozen_at');
    expect(res.body.data).not.toHaveProperty('purge_after');
    expect(res.body.data).not.toHaveProperty('renewed_at');
  });
});

describe('PATCH /listings/:id — update, slug history', () => {
  test('changing the slug records the old slug in listing_slug_history', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    const oldSlug = created.body.data.slug;
    const newSlug = `renamed-${Date.now()}`;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ slug: newSlug });

    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe(newSlug);

    const [historyRows] = await pool.query(
      'SELECT old_slug FROM listing_slug_history WHERE listing_id = ?',
      [listingId],
    );
    expect(historyRows.map((row) => row.old_slug)).toContain(oldSlug);
  });

  test('rejects an empty update body with 422', async () => {
    const created = await createDraftListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${created.body.data.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('DELETE /listings/:id — soft delete', () => {
  test('soft-deletes the listing; it 404s afterward', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(getRes.status).toBe(404);
  });
});

describe('POST /listings/:id/publish — readiness gating', () => {
  test('rejects publishing an incomplete listing with 422 and field-level details', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(422);
    const issues = res.body.error.details.map((d) => d.issue);
    expect(issues).toContain('AT_LEAST_ONE_IMAGE_REQUIRED');
    expect(issues).toContain('COMPLETE_LOCATION_REQUIRED');
  });

  test('publishes once translation, image, and location are all present', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.published_at).toEqual(expect.any(String));
  });
});

describe('POST /listings/:id/unpublish', () => {
  test('unpublishes a published listing', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('UNPUBLISHED');
  });

  test('cannot unpublish a listing that was never published (409)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('POST /listings/:id/archive (Phase 9: Partner Dashboard)', () => {
  test('archives a published listing and sets archived_at', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
    expect(res.body.data.archived_at).toEqual(expect.any(String));
  });

  test('archives an unpublished listing too (UNPUBLISHED -> ARCHIVED is also legal)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ARCHIVED');
  });

  test('cannot archive a DRAFT listing (409) — ARCHIVED is only reachable from PUBLISHED/UNPUBLISHED', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('ARCHIVED is terminal — archiving twice fails on the second call (409)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('requires authentication (401)', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;

    const res = await request(app).post(
      `/api/v1/listings/${listingId}/archive`,
    );
    expect(res.status).toBe(401);
  });
});

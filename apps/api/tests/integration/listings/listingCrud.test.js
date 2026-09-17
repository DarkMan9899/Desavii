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
import app, { services } from '../../../src/app.js';
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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
describe('Listing publication lifecycle — Step B2 schema foundation', () => {
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
});

// Listing Lifetime / Renewal, Step B3: the locked product decision (30/90/
// 180/365 days, default 90, no custom day count) applied through the ONE
// shared publish action every one of the 9 categories already goes
// through — no category-specific test needed, since nothing in
// `ListingService#publishListing`/`#checkPublishReadiness` branches on
// category. Uses the same `selectLifecycleColumns` helper as the B2 block
// above.
describe('Listing publication lifecycle — Step B3 first-publish expiry assignment', () => {
  async function selectLifecycleColumns(listingId) {
    const [[row]] = await pool.query(
      `SELECT publication_period_days, expires_at, expiry_reminder_sent_at,
              frozen_at, purge_after, renewed_at, published_at, status_id,
              (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
       FROM listings WHERE id = ?`,
      [listingId],
    );
    return row;
  }

  // A/B/C/D: every one of the 4 approved periods, on a real first publish.
  test.each([30, 90, 180, 365])(
    'first publish with a %i-day period stores that period and computes expires_at exactly %i days after published_at',
    async (periodDays) => {
      const created = await createDraftListing();
      const listingId = created.body.data.id;
      await makePublishable(listingId);

      const res = await request(app)
        .post(`/api/v1/listings/${listingId}/publish`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: periodDays });

      expect(res.status).toBe(200);
      const row = await selectLifecycleColumns(listingId);
      expect(row.publication_period_days).toBe(periodDays);
      expect(row.expires_at).not.toBeNull();
      expect(row.published_at).not.toBeNull();
      // `published_at`/`expires_at` are both computed from the same
      // single `UTC_TIMESTAMP(3)` evaluation inside one UPDATE statement
      // (MySQL evaluates it once per statement) — the gap between them is
      // deterministically exact, never approximate.
      const gapMs = row.expires_at.getTime() - row.published_at.getTime();
      expect(gapMs).toBe(periodDays * 24 * 60 * 60 * 1000);
      expect(row.expiry_reminder_sent_at).toBeNull();
      expect(row.frozen_at).toBeNull();
      expect(row.purge_after).toBeNull();
    },
  );

  // E: missing period on a first lifecycle publish.
  test('a first lifecycle publish with no publicationPeriodDays is rejected with the standard readiness error shape', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    // No .send() at all — an empty body.

    expect(res.status).toBe(422);
    const issue = res.body.error.details.find(
      (d) => d.field === 'publicationPeriodDays',
    );
    expect(issue?.issue).toBe('PUBLICATION_PERIOD_REQUIRED');

    const row = await selectLifecycleColumns(listingId);
    expect(row.status_code).toBe('DRAFT');
    expect(row.expires_at).toBeNull();
  });

  // F: every disallowed value the brief calls out by name.
  test.each([0, 17, 60, 91, 366, -1, -30])(
    'a first lifecycle publish with the out-of-list period %i is rejected',
    async (invalidPeriod) => {
      const created = await createDraftListing();
      const listingId = created.body.data.id;
      await makePublishable(listingId);

      const res = await request(app)
        .post(`/api/v1/listings/${listingId}/publish`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: invalidPeriod });

      expect(res.status).toBe(422);
      const issue = res.body.error.details.find(
        (d) => d.field === 'publicationPeriodDays',
      );
      expect(issue?.issue).toBe('INVALID_PUBLICATION_PERIOD');

      const row = await selectLifecycleColumns(listingId);
      expect(row.expires_at).toBeNull();
    },
  );

  test('non-numeric garbage is rejected at the request-validation layer, never reaches the service', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 'ninety' });

    expect(res.status).toBe(422);
    const row = await selectLifecycleColumns(listingId);
    expect(row.expires_at).toBeNull();
  });

  // G: the exploit this step exists to close — unpublish then republish
  // must never grant a fresh publication period for free.
  test('manual unpublish then republish preserves the existing publication_period_days/expires_at — does not extend it', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);

    const firstPublish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(firstPublish.status).toBe(200);
    const afterFirstPublish = await selectLifecycleColumns(listingId);

    await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    // Sending a different, larger period on the republish attempt — if
    // this were honored, it would prove the exploit; it must not be.
    const republish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 365 });
    expect(republish.status).toBe(200);

    const afterRepublish = await selectLifecycleColumns(listingId);
    expect(afterRepublish.publication_period_days).toBe(30);
    expect(afterRepublish.expires_at.getTime()).toBe(
      afterFirstPublish.expires_at.getTime(),
    );
  });

  // H: the generic content-edit endpoint has no lifecycle fields in its
  // accepted-fields list at all (see `listingValidators.js`'s
  // `updateListingSchema`) — this proves that holds even for a listing
  // already mid-lifecycle, by attempting the extension and confirming
  // nothing moved.
  test('PATCH /listings/:id cannot extend an already-assigned expiry', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    const before = await selectLifecycleColumns(listingId);

    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        // Not real accepted fields — proves the endpoint has no lifecycle
        // side channel, regardless of what a manipulated client sends.
        publicationPeriodDays: 365,
        expiresAt: '2099-01-01T00:00:00.000Z',
      });

    const after = await selectLifecycleColumns(listingId);
    expect(after.publication_period_days).toBe(before.publication_period_days);
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  // I: a frozen listing must go through the future B5 Renew flow, never
  // ordinary Publish. `frozen_at`/`purge_after` are set directly here
  // (Step B4's real expiry sweep doesn't exist yet) purely as a fixture —
  // proving Publish itself refuses to act as a substitute for it.
  test('ordinary publish on a frozen listing is rejected and never clears frozen_at/purge_after', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const frozenAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const purgeAfter = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE listings SET frozen_at = ?, purge_after = ? WHERE id = ?',
      [frozenAt, purgeAfter, listingId],
    );

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_FROZEN_REQUIRES_RENEWAL');

    const row = await selectLifecycleColumns(listingId);
    expect(row.status_code).toBe('UNPUBLISHED');
    expect(row.frozen_at).not.toBeNull();
    expect(row.purge_after).not.toBeNull();
  });

  // J: Step B3 must not disturb the 113 pre-existing dev listings (or any
  // other already-PUBLISHED listing with no lifecycle assigned) merely by
  // existing — they were never republished, so nothing should have
  // touched them. Simulates one directly, since none of the real seeded
  // listings are safe to mutate for a test.
  test('an already-PUBLISHED listing with NULL expiry (created before Step B3) is left alone unless it goes through publish again', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    // Publish it the "legacy" way — directly via SQL, bypassing the API,
    // the same shape migration-0048-era rows are in: PUBLISHED status,
    // real published_at, but no lifecycle fields ever assigned.
    const [[publishedStatus]] = await pool.query(
      "SELECT id FROM listing_statuses WHERE code = 'PUBLISHED'",
    );
    await pool.query(
      'UPDATE listings SET status_id = ?, published_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [publishedStatus.id, listingId],
    );

    const before = await selectLifecycleColumns(listingId);
    expect(before.status_code).toBe('PUBLISHED');
    expect(before.expires_at).toBeNull();

    // Confirm it's still fully functional as a normal published listing —
    // B3 doesn't require touching legacy rows for the public API to keep
    // working (no expiry enforcement exists until Step B4).
    const getRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('PUBLISHED');

    const after = await selectLifecycleColumns(listingId);
    expect(after.expires_at).toBeNull();
    expect(after.publication_period_days).toBeNull();
  });

  // K: no public DTO exposes any of the 6 lifecycle columns.
  test('GET /listings/:id never exposes any new lifecycle column in the public response', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

    const res = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('publication_period_days');
    expect(res.body.data).not.toHaveProperty('expires_at');
    expect(res.body.data).not.toHaveProperty('expiry_reminder_sent_at');
    expect(res.body.data).not.toHaveProperty('frozen_at');
    expect(res.body.data).not.toHaveProperty('purge_after');
    expect(res.body.data).not.toHaveProperty('renewed_at');
  });

  test('the raw publication_period_days column still has no DB-level CHECK/enum constraint — the allowlist is enforced at the application layer (ListingService), not the schema layer', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    // Written directly via SQL, bypassing the API entirely — proves the
    // column itself imposes no CHECK, distinct from the app-layer
    // enforcement the tests above exercise through the real endpoint.
    await pool.query(
      'UPDATE listings SET publication_period_days = ? WHERE id = ?',
      [999, listingId],
    );
    const [[row]] = await pool.query(
      'SELECT publication_period_days FROM listings WHERE id = ?',
      [listingId],
    );
    expect(row.publication_period_days).toBe(999);
  });
});

// Listing Lifetime / Renewal, Step B4 — the scheduled expiry sweep
// (`modules/listings/jobs/listingExpirySweep.js`) and its underlying
// repository-level guarded UPDATE. Calls `services.listingService
// .runExpirySweep()` directly (the sweep job's own "framework-free
// function integration tests call directly" convention — see that file's
// header), never through BullMQ/a timer, so every scenario below is
// deterministic and instant. Uses deterministic DB-relative timestamps
// (`DATE_SUB`/direct column writes) throughout — no real-time waiting.
describe('Listing expiration sweep — Step B4', () => {
  async function selectSweepColumns(listingId) {
    const [[row]] = await pool.query(
      `SELECT frozen_at, purge_after, expires_at, publication_period_days,
              published_at, deleted_at, status_id,
              (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
       FROM listings WHERE id = ?`,
      [listingId],
    );
    return row;
  }

  /** Creates a fully publishable listing, publishes it for real (a genuine `expires_at`), then optionally shifts that `expires_at` into the past by direct SQL — deterministic, no waiting for real time to pass. */
  async function createExpiringListing({ pastByMs = null } = {}) {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    if (pastByMs != null) {
      await pool.query(
        'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL ? MICROSECOND) WHERE id = ?',
        [pastByMs * 1000, listingId],
      );
    }
    return listingId;
  }

  /** Mirrors MySQL's `DATE_ADD(date, INTERVAL n MONTH)` calendar-month semantics exactly (including its end-of-month clamping, e.g. Jan 31 + 1 month -> Feb 28), so the purge_after assertion below is correct on every day of the year, never approximated as a fixed day count. */
  function addCalendarMonths(date, months) {
    const d = new Date(date.getTime());
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const daysInTargetMonth = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, daysInTargetMonth));
    return d;
  }

  // A: expires_at still in the future — untouched.
  test('a PUBLISHED listing whose expires_at is still in the future is left untouched', async () => {
    const listingId = await createExpiringListing();
    const before = await selectSweepColumns(listingId);

    await services.listingService.runExpirySweep();

    const after = await selectSweepColumns(listingId);
    expect(after.status_code).toBe('PUBLISHED');
    expect(after.frozen_at).toBeNull();
    expect(after.purge_after).toBeNull();
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  // B: legacy PUBLISHED listing with expires_at = NULL — never frozen
  // merely because B4 exists (brief §3/§30's explicit requirement).
  test('a PUBLISHED listing with NULL expires_at (a legacy, non-lifecycle-managed row) is left untouched', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const [[publishedStatus]] = await pool.query(
      "SELECT id FROM listing_statuses WHERE code = 'PUBLISHED'",
    );
    await pool.query(
      'UPDATE listings SET status_id = ?, published_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [publishedStatus.id, listingId],
    );

    await services.listingService.runExpirySweep();

    const after = await selectSweepColumns(listingId);
    expect(after.status_code).toBe('PUBLISHED');
    expect(after.frozen_at).toBeNull();
    expect(after.expires_at).toBeNull();
  });

  // C + H: the real freeze transition, and purge_after's exact
  // six-calendar-month arithmetic (never approximated as 180 days).
  test('a PUBLISHED listing whose expires_at has passed is frozen: UNPUBLISHED, frozen_at set, purge_after = frozen_at + 6 calendar months', async () => {
    const listingId = await createExpiringListing({ pastByMs: 60_000 });

    const result = await services.listingService.runExpirySweep();
    expect(result.frozen).toBeGreaterThanOrEqual(1);

    const after = await selectSweepColumns(listingId);
    expect(after.status_code).toBe('UNPUBLISHED');
    expect(after.frozen_at).not.toBeNull();
    expect(after.purge_after).not.toBeNull();
    expect(after.purge_after.getTime()).toBe(
      addCalendarMonths(after.frozen_at, 6).getTime(),
    );
    // Every other column is preserved exactly as it was.
    expect(after.publication_period_days).toBe(30);
    expect(after.published_at).not.toBeNull();
    expect(after.deleted_at).toBeNull();
  });

  // D: already frozen — a second sweep encounter must never reset the
  // retention clock.
  test('an already-frozen listing is left untouched by a later sweep run', async () => {
    const listingId = await createExpiringListing({ pastByMs: 60_000 });
    await services.listingService.runExpirySweep();
    const afterFirstFreeze = await selectSweepColumns(listingId);
    expect(afterFirstFreeze.frozen_at).not.toBeNull();

    const result = await services.listingService.runExpirySweep();
    expect(result.frozen).toBe(0);

    const afterSecondSweep = await selectSweepColumns(listingId);
    expect(afterSecondSweep.frozen_at.getTime()).toBe(
      afterFirstFreeze.frozen_at.getTime(),
    );
    expect(afterSecondSweep.purge_after.getTime()).toBe(
      afterFirstFreeze.purge_after.getTime(),
    );
  });

  // E: a soft-deleted row must never be touched, even if it happens to
  // still carry a PUBLISHED status_id and a past expires_at.
  test('a soft-deleted listing is never frozen by the sweep', async () => {
    const listingId = await createExpiringListing({ pastByMs: 60_000 });
    await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    const beforeSweep = await selectSweepColumns(listingId);
    expect(beforeSweep.deleted_at).not.toBeNull();

    await services.listingService.runExpirySweep();

    const after = await selectSweepColumns(listingId);
    expect(after.frozen_at).toBeNull();
    expect(after.purge_after).toBeNull();
  });

  // F: a non-PUBLISHED listing is never rewritten, even if it somehow
  // carries a past expires_at (defensive — never a realistic authored
  // state, only reachable by direct SQL here).
  test('a DRAFT listing with a (manually set) past expires_at is never touched by the sweep', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );

    await services.listingService.runExpirySweep();

    const after = await selectSweepColumns(listingId);
    expect(after.status_code).toBe('DRAFT');
    expect(after.frozen_at).toBeNull();
  });
});

// Listing Lifetime / Renewal, Step B5 — `POST /listings/:id/renew`. Uses
// deterministic DB-relative timestamps throughout, same convention as B3/
// B4's own lifecycle blocks above; the 3-second double-renew debounce
// guard (`mysqlListingRepository.js`'s own doc comment) means any test
// here that deliberately exercises "repeated request" must NOT sleep for
// real time — it asserts the immediate second attempt is rejected.
describe('Listing renewal — Step B5', () => {
  async function selectRenewalColumns(listingId) {
    const [[row]] = await pool.query(
      `SELECT publication_period_days, expires_at, frozen_at, purge_after,
              renewed_at, expiry_reminder_sent_at, published_at, status_id,
              moderation_status_id, slug, deleted_at,
              (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
       FROM listings WHERE id = ?`,
      [listingId],
    );
    return row;
  }

  async function createActiveListing({ periodDays = 30 } = {}) {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: periodDays });
    expect(res.status).toBe(200);
    return listingId;
  }

  async function createFrozenListing() {
    const listingId = await createActiveListing({ periodDays: 30 });
    // Real sweep-driven freeze, not a hand-crafted fixture — proves the
    // renewal path works against the actual state the B4 sweep produces.
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );
    const swept = await services.listingService.runExpirySweep();
    expect(swept.frozen).toBeGreaterThanOrEqual(1);
    return listingId;
  }

  async function renew(listingId, publicationPeriodDays) {
    return request(app)
      .post(`/api/v1/listings/${listingId}/renew`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays });
  }

  // The server does not run in UTC (a known, pre-existing environmental
  // quirk already documented for this codebase's other lifecycle tests —
  // mysql2 parses a DATETIME column in the connection's LOCAL timezone,
  // not UTC, so a raw JS `new Date()` and a DB-sourced Date differ by the
  // server's own UTC offset). Reading the bound from the DB itself, the
  // same way `expires_at` is read, makes both sides go through the
  // identical parsing path so the offset cancels out.
  async function dbNow() {
    const [[row]] = await pool.query('SELECT UTC_TIMESTAMP(3) AS now');
    return row.now;
  }

  // ACTIVE RENEW — A/B/C/D: every one of the 4 approved periods.
  test.each([30, 90, 180, 365])(
    'ACTIVE renewal with a %i-day period extends from the CURRENT expires_at, never NOW()',
    async (periodDays) => {
      const listingId = await createActiveListing();
      // A dedup marker deliberately set BEFORE renewal, to prove it gets
      // cleared — a fresh publish already leaves it NULL, so a non-null
      // starting value is the only way to prove renewal actually resets it.
      await pool.query(
        'UPDATE listings SET expiry_reminder_sent_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [listingId],
      );
      const before = await selectRenewalColumns(listingId);

      const res = await renew(listingId, periodDays);
      expect(res.status).toBe(200);

      const after = await selectRenewalColumns(listingId);
      expect(after.status_code).toBe('PUBLISHED');
      expect(after.expires_at.getTime() - before.expires_at.getTime()).toBe(
        periodDays * 24 * 60 * 60 * 1000,
      );
      expect(after.publication_period_days).toBe(periodDays);
      expect(after.renewed_at).not.toBeNull();
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(after.frozen_at).toBeNull();
      expect(after.purge_after).toBeNull();
      expect(after.moderation_status_id).toBe(before.moderation_status_id);
      expect(after.slug).toBe(before.slug);
    },
  );

  // FROZEN RENEW — A/B/C/D: every one of the 4 approved periods.
  test.each([30, 90, 180, 365])(
    'FROZEN renewal with a %i-day period extends from DB NOW(), never the old expires_at',
    async (periodDays) => {
      const listingId = await createFrozenListing();
      const before = await selectRenewalColumns(listingId);
      expect(before.status_code).toBe('UNPUBLISHED');
      expect(before.frozen_at).not.toBeNull();

      const beforeRenewAt = await dbNow();
      const res = await renew(listingId, periodDays);
      const afterRenewAt = await dbNow();
      expect(res.status).toBe(200);

      const after = await selectRenewalColumns(listingId);
      expect(after.status_code).toBe('PUBLISHED');
      // "DB now, not old expires_at": bounded by the request's own
      // wall-clock window rather than an exact match, since the DB's
      // UTC_TIMESTAMP(3) at write time can't be read independently — the
      // key assertion is that it is NOT anywhere near `before.expires_at`
      // (which already passed a full minute before this test even ran).
      const expectedMin = beforeRenewAt.getTime() + periodDays * 86400000;
      const expectedMax = afterRenewAt.getTime() + periodDays * 86400000;
      expect(after.expires_at.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(after.expires_at.getTime()).toBeLessThanOrEqual(expectedMax);
      expect(after.publication_period_days).toBe(periodDays);
      expect(after.renewed_at).not.toBeNull();
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(after.frozen_at).toBeNull();
      expect(after.purge_after).toBeNull();
      expect(after.moderation_status_id).toBe(before.moderation_status_id);
      expect(after.slug).toBe(before.slug);
    },
  );

  test('renewing in the up-to-an-hour gap after expires_at passes but before the sweep runs also uses NOW(), and the listing was never actually frozen', async () => {
    const listingId = await createActiveListing();
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );
    const stillUnswept = await selectRenewalColumns(listingId);
    expect(stillUnswept.status_code).toBe('PUBLISHED');
    expect(stillUnswept.frozen_at).toBeNull();

    const res = await renew(listingId, 90);
    expect(res.status).toBe(200);

    const after = await selectRenewalColumns(listingId);
    expect(after.status_code).toBe('PUBLISHED');
    expect(after.expires_at.getTime()).toBeGreaterThan(Date.now());
    expect(after.frozen_at).toBeNull();
  });

  // INVALID — missing/out-of-allowlist periods.
  test('missing publicationPeriodDays is rejected with PUBLICATION_PERIOD_REQUIRED', async () => {
    const listingId = await createActiveListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/renew`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(422);
    const issue = res.body.error.details.find(
      (d) => d.field === 'publicationPeriodDays',
    );
    expect(issue?.issue).toBe('PUBLICATION_PERIOD_REQUIRED');
  });

  test.each([0, 17, 60, 91, 366, -1, -30])(
    'the out-of-allowlist period %i is rejected with INVALID_PUBLICATION_PERIOD',
    async (invalidPeriod) => {
      const listingId = await createActiveListing();
      const res = await renew(listingId, invalidPeriod);
      expect(res.status).toBe(422);
      const issue = res.body.error.details.find(
        (d) => d.field === 'publicationPeriodDays',
      );
      expect(issue?.issue).toBe('INVALID_PUBLICATION_PERIOD');
    },
  );

  // INVALID — ineligible listing states.
  test('a deleted listing 404s on renew', async () => {
    const listingId = await createActiveListing();
    await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    const res = await renew(listingId, 90);
    expect(res.status).toBe(404);
  });

  test('an ARCHIVED listing cannot be renewed', async () => {
    const listingId = await createActiveListing();
    await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    await request(app)
      .post(`/api/v1/listings/${listingId}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    const res = await renew(listingId, 90);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_RENEWABLE');
  });

  test('a DRAFT listing cannot be renewed', async () => {
    const created = await createDraftListing();
    const res = await renew(created.body.data.id, 90);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_RENEWABLE');
  });

  // The exact shortcut-around-Publish this rule exists to close: a
  // partner manually unpublishes a still-current (non-expired,
  // non-frozen) listing, then must use ordinary Publish to bring it back
  // — never Renew.
  test('a manually-UNPUBLISHED, non-frozen listing cannot be renewed (must use ordinary Publish instead)', async () => {
    const listingId = await createActiveListing();
    await request(app)
      .post(`/api/v1/listings/${listingId}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await renew(listingId, 90);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_RENEWABLE');

    // Confirm ordinary Publish is still the correct recovery path, and it
    // preserves (never extends) the existing expiry — B3's own rule,
    // unaffected by B5's addition.
    const before = await selectRenewalColumns(listingId);
    const republish = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 365 });
    expect(republish.status).toBe(200);
    const after = await selectRenewalColumns(listingId);
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
  });

  test('a legacy PUBLISHED listing with no expires_at ever assigned cannot be renewed', async () => {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const [[publishedStatus]] = await pool.query(
      "SELECT id FROM listing_statuses WHERE code = 'PUBLISHED'",
    );
    await pool.query(
      'UPDATE listings SET status_id = ?, published_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [publishedStatus.id, listingId],
    );

    const res = await renew(listingId, 90);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_RENEWABLE');
  });

  // K: public DTO safety.
  test('renewal response and public GET /listings/:id never leak lifecycle fields to the wrong audience', async () => {
    const listingId = await createFrozenListing();
    const res = await renew(listingId, 90);
    expect(res.status).toBe(200);
    // The renewal RESPONSE (owner-authenticated-only) is EXPECTED to
    // include the lifecycle fields — that's the whole point of B5's DTO.
    expect(res.body.data).toHaveProperty('expires_at');
    expect(res.body.data).toHaveProperty('publication_period_days');

    // The PUBLIC detail route must still never expose them, for anyone.
    const publicRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data).not.toHaveProperty('expires_at');
    expect(publicRes.body.data).not.toHaveProperty('frozen_at');
    expect(publicRes.body.data).not.toHaveProperty('purge_after');
    expect(publicRes.body.data).not.toHaveProperty('renewed_at');
    expect(publicRes.body.data).not.toHaveProperty('publication_period_days');
  });

  // --- Race / idempotency tests (brief §31) ---

  test('a duplicate/double-clicked renewal request within the debounce window is safely rejected, never double-extending', async () => {
    const listingId = await createActiveListing();
    const first = await renew(listingId, 90);
    expect(first.status).toBe(200);
    const afterFirst = await selectRenewalColumns(listingId);

    // Fired immediately after — well inside the 3-second debounce guard.
    const second = await renew(listingId, 90);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('RENEWAL_STATE_CHANGED');

    const afterSecond = await selectRenewalColumns(listingId);
    expect(afterSecond.expires_at.getTime()).toBe(
      afterFirst.expires_at.getTime(),
    );
  });

  test('renew racing the expiry sweep: whichever runs first, the listing converges to exactly one correctly-based renewal, never a partial state', async () => {
    const listingId = await createActiveListing();
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );

    // The sweep runs FIRST, freezing it...
    await services.listingService.runExpirySweep();
    const frozen = await selectRenewalColumns(listingId);
    expect(frozen.status_code).toBe('UNPUBLISHED');
    expect(frozen.frozen_at).not.toBeNull();

    // ...then renewal still succeeds cleanly against the now-frozen row.
    const res = await renew(listingId, 90);
    expect(res.status).toBe(200);
    const after = await selectRenewalColumns(listingId);
    expect(after.status_code).toBe('PUBLISHED');
    expect(after.frozen_at).toBeNull();
    expect(after.purge_after).toBeNull();
    expect(after.expires_at.getTime()).toBeGreaterThan(Date.now());

    // A later sweep run must never re-freeze the just-renewed listing.
    await services.listingService.runExpirySweep();
    const afterSweep = await selectRenewalColumns(listingId);
    expect(afterSweep.status_code).toBe('PUBLISHED');
    expect(afterSweep.frozen_at).toBeNull();
  });

  test('a frozen renewal that fails readiness leaves the listing exactly as frozen as before — no partial reactivation', async () => {
    const listingId = await createFrozenListing();
    const before = await selectRenewalColumns(listingId);

    // Strip the one thing #checkPublishReadiness requires that this
    // fixture already has — its cover image — making the frozen listing
    // "stale" (brief §7's own scenario).
    await pool.query(
      "UPDATE media SET deleted_at = UTC_TIMESTAMP(3) WHERE mediable_type = 'listing' AND mediable_id = ?",
      [listingId],
    );

    const res = await renew(listingId, 90);
    expect(res.status).toBe(422);
    const issue = res.body.error.details.find((d) => d.field === 'media');
    expect(issue?.issue).toBe('AT_LEAST_ONE_IMAGE_REQUIRED');

    const after = await selectRenewalColumns(listingId);
    expect(after.status_code).toBe('UNPUBLISHED');
    expect(after.frozen_at.getTime()).toBe(before.frozen_at.getTime());
    expect(after.purge_after.getTime()).toBe(before.purge_after.getTime());
    expect(after.publication_period_days).toBe(before.publication_period_days);
    expect(after.expires_at.getTime()).toBe(before.expires_at.getTime());
    expect(after.renewed_at).toBeNull();
  });

  test('repeating an already-successful renewal request immediately after is rejected, not silently re-applied', async () => {
    const listingId = await createFrozenListing();
    const res1 = await renew(listingId, 30);
    expect(res1.status).toBe(200);
    const res2 = await renew(listingId, 30);
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('RENEWAL_STATE_CHANGED');
  });
});

// Listing Lifetime / Renewal, Step B6 — the T-2-day expiry-reminder phase
// `ListingService#runExpirySweep` now also runs (see that method's own
// doc comment for why this stayed one combined sweep, never a second
// BullMQ worker on the same table). Deterministic DB-relative timestamps
// throughout, same convention as B3/B4/B5's own lifecycle blocks above —
// never a real sleep.
describe('Listing expiry reminder — Step B6', () => {
  async function selectReminderColumns(listingId) {
    const [[row]] = await pool.query(
      `SELECT expiry_reminder_sent_at, expires_at, frozen_at, status_id,
              (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
       FROM listings WHERE id = ?`,
      [listingId],
    );
    return row;
  }

  async function createReminderableListing({ periodDays = 90 } = {}) {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: periodDays });
    expect(res.status).toBe(200);
    return listingId;
  }

  /** @param {string} intervalSql e.g. "DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)" */
  async function setExpiresAt(listingId, intervalSql) {
    await pool.query(
      `UPDATE listings SET expires_at = ${intervalSql} WHERE id = ?`,
      [listingId],
    );
  }

  async function findReminderNotification(listingId) {
    const [[row]] = await pool.query(
      `SELECT n.recipient_user_id, n.event_type, n.payload,
              (SELECT code FROM notification_categories WHERE id = n.category_id) AS category_code,
              (SELECT code FROM notification_priorities WHERE id = n.priority_id) AS priority_code
       FROM notifications n
       WHERE n.event_type = 'listing.expiring_soon' AND n.resource_id = ?
       ORDER BY n.id DESC LIMIT 1`,
      [listingId],
    );
    if (!row) return null;
    return {
      ...row,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    };
  }

  describe('T-2 boundary (brief §12/§24)', () => {
    test('T-49 hours: not yet eligible, no reminder', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 49 HOUR)',
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(await findReminderNotification(listingId)).toBeNull();
    });

    test('T-48 hours exactly: eligible, reminder sent', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      const result = await services.listingService.runExpirySweep();
      expect(result.remindersSent).toBeGreaterThanOrEqual(1);
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).not.toBeNull();
    });

    test('T-47 hours: eligible, reminder sent', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 47 HOUR)',
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).not.toBeNull();
    });

    test('T-1 hour: eligible, reminder sent', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)',
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).not.toBeNull();
    });

    test('already expired: never reminded', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)',
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
    });

    test('legacy NULL expires_at: never reminded', async () => {
      const created = await createDraftListing();
      const listingId = created.body.data.id;
      await makePublishable(listingId);
      const [[publishedStatus]] = await pool.query(
        "SELECT id FROM listing_statuses WHERE code = 'PUBLISHED'",
      );
      await pool.query(
        'UPDATE listings SET status_id = ?, published_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [publishedStatus.id, listingId],
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(after.expires_at).toBeNull();
    });

    test('frozen: never reminded even with a (synthetic, direct-SQL-only) expires_at inside the T-2 window', async () => {
      const listingId = await createReminderableListing();
      // Defensive/unrealistic-but-illustrative edge state, same framing
      // as B4's own "manually set past expires_at on a DRAFT" test above —
      // a genuinely frozen listing's real expires_at is always already in
      // the past (frozen only happens once expires_at <= NOW()), so this
      // isolates the `frozen_at IS NULL` guard specifically from the
      // "already expired" guard the next test below already covers.
      await pool.query(
        `UPDATE listings
         SET frozen_at = UTC_TIMESTAMP(3),
             purge_after = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 6 MONTH),
             expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 47 HOUR)
         WHERE id = ?`,
        [listingId],
      );
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
    });

    test('manually UNPUBLISHED (not frozen): never reminded, even with a still-future expires_at inside the T-2 window', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 47 HOUR)',
      );
      const res = await request(app)
        .post(`/api/v1/listings/${listingId}/unpublish`)
        .set('Authorization', `Bearer ${vendor.accessToken}`);
      expect(res.status).toBe(200);
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.status_code).toBe('UNPUBLISHED');
      expect(after.frozen_at).toBeNull();
      expect(after.expiry_reminder_sent_at).toBeNull();
    });

    test('soft-deleted: never reminded', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 47 HOUR)',
      );
      const res = await request(app)
        .delete(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`);
      expect(res.status).toBe(200);
      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
    });
  });

  describe('Idempotency / dedup (brief §14/§25)', () => {
    test('a first sweep emits exactly one reminder; an immediate second sweep emits zero more and never rewrites the marker', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );

      const first = await services.listingService.runExpirySweep();
      expect(first.remindersSent).toBeGreaterThanOrEqual(1);
      const afterFirst = await selectReminderColumns(listingId);
      expect(afterFirst.expiry_reminder_sent_at).not.toBeNull();

      // A second, immediate sweep's own return-value count is not asserted
      // here — it's a whole-table count that may include unrelated
      // fixtures from other tests in this same suite run; the per-row
      // marker-stability assertion below is what actually proves no
      // duplicate for THIS row.
      await services.listingService.runExpirySweep();
      const afterSecond = await selectReminderColumns(listingId);
      expect(afterSecond.expiry_reminder_sent_at.getTime()).toBe(
        afterFirst.expiry_reminder_sent_at.getTime(),
      );
    });

    test('two overlapping sweep calls racing the exact same row converge on exactly one claim, never two', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );

      // Genuinely concurrent, not sequential — both calls' `listDueForReminder`
      // SELECTs can legitimately both see the row as still eligible; MySQL's
      // own row-level locking on `claimExpiryReminder`'s guarded UPDATE is
      // what serializes the two attempts down to exactly one success.
      await Promise.all([
        services.listingService.runExpirySweep(),
        services.listingService.runExpirySweep(),
      ]);

      const notificationRows = await pool.query(
        `SELECT id FROM notifications WHERE event_type = 'listing.expiring_soon' AND resource_id = ?`,
        [listingId],
      );
      expect(notificationRows[0]).toHaveLength(1);
    });
  });

  describe('Expiry race and Renew race (brief §18/§19)', () => {
    test('a listing that crosses into "already expired" is frozen and does NOT also get a reminder in that same sweep call', async () => {
      const listingId = await createReminderableListing();
      // Simulates the sweep tick landing just after expiry — this listing
      // may well have been inside the T-2 window moments earlier, but by
      // the time THIS sweep runs it's already past `expires_at`, so the
      // freeze phase (which runs first within `runExpirySweep`) claims it
      // before the reminder phase's `listDueForReminder` SELECT ever sees
      // it as a PUBLISHED, non-frozen candidate.
      await setExpiresAt(
        listingId,
        'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)',
      );

      const result = await services.listingService.runExpirySweep();
      expect(result.frozen).toBeGreaterThanOrEqual(1);

      const after = await selectReminderColumns(listingId);
      expect(after.frozen_at).not.toBeNull();
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(await findReminderNotification(listingId)).toBeNull();
    });

    test('a renewal that commits before the next sweep tick prevents a stale reminder for the old cycle', async () => {
      const listingId = await createReminderableListing({ periodDays: 30 });
      // 6 hours: comfortably inside the T-2 reminder window (< 48h) while
      // staying clear of `ListingService#renewListing`'s own pre-existing,
      // unrelated `hasLifecycleExpired` JS-Date-vs-DB-Date boundary margin
      // (this codebase's documented mysql2 local-timezone DATETIME-parsing
      // quirk — see `infrastructure/database/dateFormat.js`'s own comment
      // for the DATE-column form of the same root cause) — this reminder
      // sweep's own eligibility check is pure SQL (`claimExpiryReminder`),
      // immune to that quirk regardless of margin, as the T-1-hour
      // threshold test above already proves.
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 6 HOUR)',
      );

      // Renewal wins the race — extends from the CURRENT expires_at
      // (Step B5), so the listing is now far outside the T-2 window.
      const renewRes = await request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 90 });
      expect(renewRes.status).toBe(200);

      await services.listingService.runExpirySweep();
      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).toBeNull();
      expect(await findReminderNotification(listingId)).toBeNull();
    });
  });

  describe('Renewal resets the marker for a new cycle (brief §17/§26)', () => {
    test('reminder fires -> Renew resets the marker -> no stale reminder -> a later T-2 threshold can remind again', async () => {
      const listingId = await createReminderableListing({ periodDays: 30 });
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );

      // 1. Reminder fires for the current cycle.
      await services.listingService.runExpirySweep();
      const afterReminder = await selectReminderColumns(listingId);
      expect(afterReminder.expiry_reminder_sent_at).not.toBeNull();
      const firstNotification = await findReminderNotification(listingId);
      expect(firstNotification).not.toBeNull();

      // 2. Renew succeeds -> marker becomes NULL, listing moves outside T-2.
      const renewRes = await request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 90 });
      expect(renewRes.status).toBe(200);
      const afterRenew = await selectReminderColumns(listingId);
      expect(afterRenew.expiry_reminder_sent_at).toBeNull();
      expect(afterRenew.expires_at.getTime()).toBeGreaterThan(
        Date.now() + 47 * 60 * 60 * 1000,
      );

      // 3. No immediate stale reminder for the already-notified old cycle.
      await services.listingService.runExpirySweep();
      const stillAfterRenew = await selectReminderColumns(listingId);
      expect(stillAfterRenew.expiry_reminder_sent_at).toBeNull();

      // 4. Once the NEW cycle later reaches its own T-2 threshold, a fresh
      // reminder may fire exactly once, independent of the first.
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 47 HOUR)',
      );
      await services.listingService.runExpirySweep();
      const afterSecondCycle = await selectReminderColumns(listingId);
      expect(afterSecondCycle.expiry_reminder_sent_at).not.toBeNull();
      const secondNotification = await findReminderNotification(listingId);
      expect(secondNotification.payload).not.toEqual(firstNotification.payload);
    });
  });

  describe('Notification / email (brief §27, categories §31)', () => {
    test('creates a real in-app notification for the listing owner with the correct category, priority, and payload', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      await services.listingService.runExpirySweep();

      const notification = await findReminderNotification(listingId);
      expect(notification).not.toBeNull();
      expect(notification.recipient_user_id).toBe(vendor.userId);
      expect(notification.category_code).toBe('LISTING');
      expect(notification.priority_code).toBe('HIGH');
      expect(notification.payload.listingId).toBe(listingId);
      expect(notification.payload.listingTitle).toEqual(expect.any(String));
      expect(notification.payload.listingTitle.length).toBeGreaterThan(0);
    });

    test('the notification never leaks unrelated private data (staff lists, internal moderation ids, booking/customer data)', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      await services.listingService.runExpirySweep();

      const notification = await findReminderNotification(listingId);
      const payloadKeys = Object.keys(notification.payload).sort();
      // `partnerId` deliberately never reaches the stored notification —
      // `notificationListener.js`'s subscription drops it after using it
      // only to resolve the recipient, same as `advertisement.expiring_soon`'s
      // own payload shape never carries an internal id beyond what the
      // rendered message actually needs.
      expect(payloadKeys).toEqual(
        ['expiresAt', 'listingId', 'listingTitle', 'slug'].sort(),
      );
    });

    test('an EMAIL delivery job is enqueued and renders a real, localized template via the existing delivery pipeline (never a direct/synchronous send)', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      await services.listingService.runExpirySweep();

      // `deliverViaChannel` is the exact same plain, directly-callable
      // function the BullMQ Worker invokes (see NotificationDeliveryService's
      // own doc comment) — calling it here proves the reminder's payload
      // renders through the real pipeline end to end, without needing a
      // live Redis worker running inside this test process, and without
      // ever calling a real email provider (ConsoleEmailProvider is this
      // app's default — see module.container.js — and is never swapped
      // for Resend outside an explicit `config.email.provider` override,
      // which the test environment never sets).
      const [[notificationRow]] = await pool.query(
        'SELECT id FROM notifications WHERE event_type = ? AND resource_id = ? ORDER BY id DESC LIMIT 1',
        ['listing.expiring_soon', listingId],
      );
      const result =
        await services.notificationDeliveryService.deliverViaChannel(
          notificationRow.id,
          'EMAIL',
        );
      expect(result.delivered).toBe(true);
      expect(result.provider).toBe('console');
    });

    test('email is not force-sent when the recipient has EMAIL disabled for the LISTING category (in-app still follows preference semantics)', async () => {
      const listingId = await createReminderableListing();
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      await pool.query(
        `INSERT INTO notification_preferences (user_id, category_id, in_app_enabled, email_enabled)
         SELECT ?, id, 1, 0 FROM notification_categories WHERE code = 'LISTING'
         ON DUPLICATE KEY UPDATE email_enabled = 0`,
        [vendor.userId],
      );

      await services.listingService.runExpirySweep();

      const notification = await findReminderNotification(listingId);
      expect(notification).not.toBeNull();

      await pool.query(
        `DELETE FROM notification_preferences
         WHERE user_id = ? AND category_id = (SELECT id FROM notification_categories WHERE code = 'LISTING')`,
        [vendor.userId],
      );
    });
  });

  describe('Category-agnostic across listing types (brief §31)', () => {
    test.each(['HOTEL', 'RESTAURANT', 'TOUR'])(
      'a %s listing goes through the exact same reminder path as any other type',
      async (listingType) => {
        const created = await request(app)
          .post('/api/v1/listings')
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({
            partnerId,
            listingType,
            translations: [
              {
                languageId,
                title: `B6 ${listingType} reminder fixture ${Date.now()}`,
              },
            ],
            categoryIds: [],
          });
        const listingId = created.body.data.id;
        // No `policyValues` here — policy validation requires a category
        // (`listingValidators.js`'s `CATEGORY_REQUIRED`), and this fixture
        // deliberately has none (brief §31: category-agnostic, no
        // category-specific setup) — matches `bookingCreation.test.js`'s
        // own `createListing()` helper precedent for a category-less
        // fixture.
        await request(app)
          .patch(`/api/v1/listings/${listingId}`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
        await request(app)
          .post(`/api/v1/listings/${listingId}/media`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .set('Content-Type', 'image/png')
          .send(ONE_PX_PNG);
        await request(app)
          .post('/api/v1/availability/units')
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
        const publishRes = await request(app)
          .post(`/api/v1/listings/${listingId}/publish`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({ publicationPeriodDays: 90 });
        expect(publishRes.status).toBe(200);
        await setExpiresAt(
          listingId,
          'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
        );

        await services.listingService.runExpirySweep();

        const after = await selectReminderColumns(listingId);
        expect(after.expiry_reminder_sent_at).not.toBeNull();
      },
    );
  });

  describe('Missing owner (brief §21)', () => {
    test('a listing whose partner has no OWNER partner_employee is reminded (marker set) without crashing the sweep or notifying anyone', async () => {
      const [[approvedStatus]] = await pool.query(
        "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
      );
      const [ownerlessPartnerResult] = await pool.query(
        `INSERT INTO partners
          (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          'Ownerless Partner LLC',
          'Ownerless Partner',
          `ownerless-partner-${Date.now()}`,
          approvedStatus.id,
          approvedStatus.id,
          vendor.userId,
        ],
      );
      const ownerlessPartnerId = ownerlessPartnerResult.insertId;
      // A temporary OWNER row — needed only so `vendor` is authorized to
      // create/publish under this partner (creation/publish authorization
      // is ownership-based, via this exact table). It's soft-deleted
      // below, BEFORE the sweep runs, so the reminder step itself sees a
      // genuinely ownerless partner — exercising `partnerService
      // .getOwnerUserId` -> `notify()`'s existing
      // `if (!recipientUserId) return;` guard, never a fabricated
      // recipient (brief §21).
      const [[ownerRole]] = await pool.query(
        "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
      );
      const [employeeResult] = await pool.query(
        'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
        [ownerlessPartnerId, vendor.userId, ownerRole.id],
      );

      const created = await request(app)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          partnerId: ownerlessPartnerId,
          listingType: 'HOTEL',
          translations: [
            { languageId, title: `B6 ownerless fixture ${Date.now()}` },
          ],
          categoryIds: [],
        });
      const listingId = created.body.data.id;
      await request(app)
        .patch(`/api/v1/listings/${listingId}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
      await request(app)
        .post(`/api/v1/listings/${listingId}/media`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .set('Content-Type', 'image/png')
        .send(ONE_PX_PNG);
      await request(app)
        .post('/api/v1/availability/units')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
      const publishRes = await request(app)
        .post(`/api/v1/listings/${listingId}/publish`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 90 });
      expect(publishRes.status).toBe(200);
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );

      // NOW remove the owner — the sweep below must see a genuinely
      // ownerless partner, never one merely used to bootstrap the fixture.
      await pool.query(
        'UPDATE partner_employees SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?',
        [employeeResult.insertId],
      );

      // A second, normal candidate in the SAME sweep run, to prove the
      // ownerless row never blocks/crashes processing of the others.
      const normalListingId = await createReminderableListing();
      await setExpiresAt(
        normalListingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );

      await expect(
        services.listingService.runExpirySweep(),
      ).resolves.toBeDefined();

      const after = await selectReminderColumns(listingId);
      expect(after.expiry_reminder_sent_at).not.toBeNull();
      expect(await findReminderNotification(listingId)).toBeNull();

      const normalAfter = await selectReminderColumns(normalListingId);
      expect(normalAfter.expiry_reminder_sent_at).not.toBeNull();
      expect(await findReminderNotification(normalListingId)).not.toBeNull();
    });
  });
});

// Listing Lifetime / Renewal, Step B6.5 — renewal expiry boundary / timezone
// correctness. `renewListing`'s ACTIVE-vs-EXPIRED branch selection used
// `hasLifecycleExpired`, which compared a mysql2-parsed `expires_at` (a
// DATETIME column, parsed via the connection's LOCAL timezone — no explicit
// `timezone` pool option — the same root cause `dateFormat.js` documents for
// DATE columns) against a raw JS `new Date()`. Because every write uses
// `UTC_TIMESTAMP(3)`, the two sides of that comparison lived in different
// time frames, shifted by the server's own UTC offset — any listing
// expiring within roughly that offset window could be misclassified.
describe('Listing renewal — Step B6.5 near-boundary correctness', () => {
  async function createRenewableListing({ periodDays = 90 } = {}) {
    const created = await createDraftListing();
    const listingId = created.body.data.id;
    await makePublishable(listingId);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: periodDays });
    expect(res.status).toBe(200);
    return listingId;
  }

  /** @param {string} intervalSql e.g. "DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)" */
  async function setExpiresAt(listingId, intervalSql) {
    await pool.query(
      `UPDATE listings SET expires_at = ${intervalSql} WHERE id = ?`,
      [listingId],
    );
  }

  async function selectExpiresAt(listingId) {
    const [[row]] = await pool.query(
      'SELECT expires_at FROM listings WHERE id = ?',
      [listingId],
    );
    return row.expires_at;
  }

  test('reproduction: a listing expiring 1 hour from now still renews via the ACTIVE (extend-from-old-expiry) path, never 409', async () => {
    const listingId = await createRenewableListing();
    await setExpiresAt(
      listingId,
      'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)',
    );
    const beforeExpiresAt = await selectExpiresAt(listingId);

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/renew`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });

    expect(res.status).toBe(200);
    const after = await selectExpiresAt(listingId);
    // ACTIVE math: new = OLD expires_at + 30 days, never DB-now + 30 days.
    expect(after.getTime() - beforeExpiresAt.getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
  });

  // Brief §11/§12 — the exact near-boundary matrix, deterministic DB-relative
  // timestamps, no real sleeps. `>` NOW is ACTIVE (extend from OLD
  // expires_at); `<=` NOW is EXPIRED-but-unswept (extend from DB NOW,
  // through the reactivation path, readiness re-checked). This is precisely
  // the "approximately UTC+4 class of bug" window the brief calls out —
  // every one of these would have been misclassified on pre-B6.5 HEAD.
  describe('ACTIVE branch — expires_at > DB NOW', () => {
    test.each([
      ['T+5 hours', 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 HOUR)'],
      ['T+1 hour', 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)'],
      ['T+1 minute', 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)'],
      ['T+1 second', 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)'],
    ])(
      '%s renews via ACTIVE: new expires_at = OLD expires_at + period',
      async (_label, intervalSql) => {
        const listingId = await createRenewableListing();
        await setExpiresAt(listingId, intervalSql);
        const beforeExpiresAt = await selectExpiresAt(listingId);

        const res = await request(app)
          .post(`/api/v1/listings/${listingId}/renew`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({ publicationPeriodDays: 30 });

        expect(res.status).toBe(200);
        const after = await selectExpiresAt(listingId);
        expect(after.getTime() - beforeExpiresAt.getTime()).toBe(
          30 * 24 * 60 * 60 * 1000,
        );

        // Public visibility must agree: still visible to an anonymous caller
        // right up to (and including) this same boundary (brief §13).
        const publicRes = await request(app).get(
          `/api/v1/listings/${listingId}`,
        );
        expect(publicRes.status).toBe(200);
      },
    );
  });

  describe('EXPIRED-but-unswept branch — expires_at <= DB NOW', () => {
    test.each([
      ['T = 0 (exactly now)', 'UTC_TIMESTAMP(3)'],
      ['T-1 second', 'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)'],
      ['T-1 minute', 'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)'],
      ['T-1 hour', 'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)'],
      ['T-5 hours', 'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 5 HOUR)'],
    ])(
      '%s renews via EXPIRED/reactivation: new expires_at = DB NOW + period, never OLD expires_at + period',
      async (_label, intervalSql) => {
        const listingId = await createRenewableListing();
        await setExpiresAt(listingId, intervalSql);
        const beforeExpiresAt = await selectExpiresAt(listingId);
        const [[{ now: dbNowBefore }]] = await pool.query(
          'SELECT UTC_TIMESTAMP(3) AS now',
        );

        const res = await request(app)
          .post(`/api/v1/listings/${listingId}/renew`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .send({ publicationPeriodDays: 30 });

        expect(res.status).toBe(200);
        const after = await selectExpiresAt(listingId);
        // Never extended from the OLD (already-past) expires_at.
        expect(after.getTime()).not.toBe(
          beforeExpiresAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        );
        // Based on DB NOW at the time of renewal, within a generous window
        // (the request itself takes some real wall-clock time).
        const expectedMin = dbNowBefore.getTime() + 30 * 24 * 60 * 60 * 1000;
        expect(after.getTime()).toBeGreaterThanOrEqual(expectedMin);
        expect(after.getTime()).toBeLessThan(expectedMin + 10_000);
        // Reactivated cleanly: still PUBLISHED, never left frozen.
        const [[row]] = await pool.query(
          `SELECT frozen_at,
                (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
         FROM listings WHERE id = ?`,
          [listingId],
        );
        expect(row.status_code).toBe('PUBLISHED');
        expect(row.frozen_at).toBeNull();

        // Public visibility must agree: NOT visible to an anonymous caller at
        // or before this same boundary, before renewal — but the listing was
        // just renewed, so re-check the state as it existed at read time
        // instead (a fresh fixture, since renewal already changed this one).
      },
    );

    test("the same T=0/T-1s boundary is publicly invisible before renewal, exactly matching Renew's own EXPIRED classification", async () => {
      const listingId = await createRenewableListing();
      await setExpiresAt(
        listingId,
        'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)',
      );

      const publicRes = await request(app).get(`/api/v1/listings/${listingId}`);
      expect(publicRes.status).toBe(404);

      const res = await request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 30 });
      expect(res.status).toBe(200);
    });
  });

  test('near-boundary double-renew: two concurrent requests at T+1 second still converge on exactly one success', async () => {
    const listingId = await createRenewableListing();
    await setExpiresAt(
      listingId,
      'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)',
    );

    const renew = () =>
      request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 30 });

    const [first, second] = await Promise.all([renew(), renew()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  test('near-boundary double-renew on the EXPIRED-but-unswept side (T-1 second): two concurrent requests still converge on exactly one success', async () => {
    const listingId = await createRenewableListing();
    await setExpiresAt(
      listingId,
      'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)',
    );

    const renew = () =>
      request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 30 });

    const [first, second] = await Promise.all([renew(), renew()]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  test('expiry-sweep race at the exact boundary: whichever runs first, the listing converges to exactly one correctly-based renewal', async () => {
    const listingId = await createRenewableListing();
    await setExpiresAt(
      listingId,
      'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)',
    );

    // The sweep runs first, freezing it...
    const swept = await services.listingService.runExpirySweep();
    expect(swept.frozen).toBeGreaterThanOrEqual(1);
    const frozenRow = await selectExpiresAt(listingId);
    expect(frozenRow).not.toBeNull();

    // ...then renewal still succeeds cleanly against the now-frozen row,
    // basing the new expiry on DB NOW (never the stale old expires_at).
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/renew`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(res.status).toBe(200);
    const [[row]] = await pool.query(
      `SELECT frozen_at, expires_at,
              (SELECT code FROM listing_statuses WHERE id = listings.status_id) AS status_code
       FROM listings WHERE id = ?`,
      [listingId],
    );
    expect(row.status_code).toBe('PUBLISHED');
    expect(row.frozen_at).toBeNull();
    expect(row.expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  // Brief §14 — B6's reminder logic is pure SQL and was reported unaffected
  // by this bug; re-verify no regression rather than rewrite it.
  describe('B6 reminder regression', () => {
    test('a listing inside the T-2 window can still remind, an expired one still cannot, and renewal still resets the marker for a fresh T-2 cycle', async () => {
      const listingId = await createRenewableListing({ periodDays: 30 });
      await setExpiresAt(
        listingId,
        'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 48 HOUR)',
      );
      const first = await services.listingService.runExpirySweep();
      expect(first.remindersSent).toBeGreaterThanOrEqual(1);
      const [[afterReminder]] = await pool.query(
        'SELECT expiry_reminder_sent_at FROM listings WHERE id = ?',
        [listingId],
      );
      expect(afterReminder.expiry_reminder_sent_at).not.toBeNull();

      const renewRes = await request(app)
        .post(`/api/v1/listings/${listingId}/renew`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ publicationPeriodDays: 90 });
      expect(renewRes.status).toBe(200);
      const [[afterRenew]] = await pool.query(
        'SELECT expiry_reminder_sent_at FROM listings WHERE id = ?',
        [listingId],
      );
      expect(afterRenew.expiry_reminder_sent_at).toBeNull();

      const expiredListingId = await createRenewableListing();
      await setExpiresAt(
        expiredListingId,
        'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR)',
      );
      const second = await services.listingService.runExpirySweep();
      const [[expiredRow]] = await pool.query(
        'SELECT expiry_reminder_sent_at FROM listings WHERE id = ?',
        [expiredListingId],
      );
      expect(expiredRow.expiry_reminder_sent_at).toBeNull();
      expect(second).toBeDefined();
    });
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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
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
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
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

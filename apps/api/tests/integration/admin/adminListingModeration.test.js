/**
 * Phase 11 Admin Platform (Stage 11.3): Listing Moderation —
 * `GET /listings/admin`, `GET /listings/admin/:id`,
 * `PATCH /listings/admin/:id/moderation-status`. Asserts RBAC across
 * SUPER_ADMIN (full access), MODERATOR (has `listing.moderate` per the
 * seeded role catalog), and a CUSTOMER (denied), against a real listing
 * created via the public listing-creation endpoint (same fixture pattern
 * `listingCrud.test.js` uses).
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

let admin;
let customer;
let vendor;
let moderator;
let pool;
let partnerId;
let listingId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

// Listing Lifetime / Renewal, Step B8 — fixture helpers for the lifecycle
// filter (§21) and Admin Renew (§22) test blocks below, mirroring
// `listingCrud.test.js`'s own `createDraftListing`/`makePublishable`/
// `createActiveListing`/`createFrozenListing` conventions exactly (never a
// second, divergent implementation of the same fixture-building logic).
// No `categoryId`/`amenityId` is passed on creation, matching this file's
// existing `listingId` fixture above — `#checkPublishReadiness` only
// requires translations/media/location when no category is attached, so
// `makePublishable` here only needs to satisfy those three.
async function createDraftListing() {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Lifecycle Test Hotel ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          summary: 'A nice place to stay.',
          description: 'Full description of the listing.',
        },
      ],
    });
  return res.body.data.id;
}

async function makePublishable(id) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: id, bookableUnitType: 'HOTEL_ROOM' });
}

async function createActiveListing({ periodDays = 30 } = {}) {
  const id = await createDraftListing();
  await makePublishable(id);
  const res = await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: periodDays });
  expect(res.status).toBe(200);
  return id;
}

async function setExpiresAt(id, intervalSql) {
  await pool.query(
    `UPDATE listings SET expires_at = ${intervalSql} WHERE id = ?`,
    [id],
  );
}

async function createFrozenListing() {
  const id = await createActiveListing({ periodDays: 30 });
  await setExpiresAt(id, 'DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE)');
  const swept = await services.listingService.runExpirySweep();
  expect(swept.frozen).toBeGreaterThanOrEqual(1);
  return id;
}

async function renew(id, publicationPeriodDays, token = admin.accessToken) {
  return request(app)
    .post(`/api/v1/listings/${id}/renew`)
    .set('Authorization', `Bearer ${token}`)
    .send({ publicationPeriodDays });
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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
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

  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId: language.id,
          title: `Moderation Test Hotel ${Date.now()}`,
          summary: 'A nice place to stay.',
          description: 'Full description of the listing.',
        },
      ],
    });
  listingId = createRes.body.data.id;

  // No dev account is seeded with MODERATOR — assign it directly to a
  // throwaway registered user, same pattern Stage 11.2's test uses.
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: 'listing.moderator@example.com',
    password: 'ListingModerator!2024',
    firstName: 'Listing',
    lastName: 'Moderator',
  });
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'MODERATOR'`,
    [registerRes.body.data.user.id],
  );
  moderator = await login(
    'listing.moderator@example.com',
    'ListingModerator!2024',
  );
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /listings/admin (admin queue)', () => {
  test('a SUPER_ADMIN receives a cursor-paginated list including a DRAFT listing', async () => {
    const res = await request(app)
      .get('/api/v1/listings/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: listingId,
          partner_display_name: 'Yerevan Boutique Hospitality',
          moderation_status: 'PENDING',
        }),
      ]),
    );
    expect(res.body.meta).toEqual(
      expect.objectContaining({ has_more: expect.any(Boolean) }),
    );
  });

  test('a keyword filter narrows to the matching listing title', async () => {
    const res = await request(app)
      .get(`/api/v1/listings/admin?keyword=Moderation Test Hotel`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: listingId })]),
    );
  });

  test('a moderationStatus filter narrows correctly', async () => {
    const res = await request(app)
      .get('/api/v1/listings/admin?moderationStatus=REJECTED')
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: listingId })]),
    );
  });

  test('MODERATOR can list the queue', async () => {
    const res = await request(app)
      .get('/api/v1/listings/admin')
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('a CUSTOMER is rejected with 403', async () => {
    const res = await request(app)
      .get('/api/v1/listings/admin')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /listings/admin/:id (admin detail)', () => {
  test('a SUPER_ADMIN sees the full listing shape even though it is unpublished (DRAFT)', async () => {
    const res = await request(app)
      .get(`/api/v1/listings/admin/${listingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.objectContaining({
        id: listingId,
        status: 'DRAFT',
        moderation_status: 'PENDING',
      }),
    );
  });

  test('a CUSTOMER is rejected with 403', async () => {
    const res = await request(app)
      .get(`/api/v1/listings/admin/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /listings/admin/:id/moderation-status (approve/reject with notes)', () => {
  test('MODERATOR can reject with notes, then approve — writes an audit log entry each time', async () => {
    const rejectRes = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Missing required photos.' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.moderation_status).toBe('REJECTED');

    const approveRes = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.moderation_status).toBe('APPROVED');

    const [logs] = await pool.query(
      `SELECT action FROM audit_logs
       WHERE target_type = 'listing' AND target_id = ? AND action = 'listing.moderation_status_changed'
       ORDER BY id DESC LIMIT 2`,
      [listingId],
    );
    expect(logs.length).toBe(2);
  });

  test('a CUSTOMER is rejected with 403', async () => {
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ status: 'FLAGGED' });
    expect(res.status).toBe(403);
  });

  test('an invalid status is rejected with 422', async () => {
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(422);
  });
});

/**
 * P2.1 (Admin Listing Detail): `moderation_notes` was already fetched by
 * the repository but never exposed by any DTO — the admin detail page
 * this section verifies had no data source for it. Confirms it's now
 * present on the admin response, and deliberately absent from the
 * public one (a moderation/rejection note is internal admin content,
 * not something a public visitor should see).
 */
describe('GET /listings/admin/:id exposes moderation_notes (P2.1)', () => {
  test('a note set via reject is returned on the admin detail response, never on the public one', async () => {
    const rejectRes = await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Please add exterior photos.' });
    expect(rejectRes.status).toBe(200);

    const adminDetailRes = await request(app)
      .get(`/api/v1/listings/admin/${listingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.moderation_notes).toBe(
      'Please add exterior photos.',
    );

    // The vendor owns this listing, so the public route's owner-fallback
    // visibility rule lets them see it despite it being DRAFT/REJECTED —
    // the point here is only that `moderation_notes` itself is absent
    // from this response shape, regardless of who can reach it.
    const publicRes = await request(app)
      .get(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.moderation_notes).toBeUndefined();
  });
});

/**
 * Listing Lifetime / Renewal, Step B8 (brief §4/§9) — the 5 lifecycle
 * fields must appear on both the admin queue row and the admin detail
 * response, and never on the public one (mirroring the `moderation_notes`
 * exposure test above exactly).
 */
describe('GET /listings/admin(/:id) exposes lifecycle fields (Step B8)', () => {
  test('publication_period_days/expires_at/frozen_at/purge_after/renewed_at appear on both the queue row and the detail response, never on the public one', async () => {
    const id = await createActiveListing();

    const listRes = await request(app)
      .get(`/api/v1/listings/admin?keyword=Lifecycle Test Hotel`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id,
          publication_period_days: 30,
          expires_at: expect.any(String),
          frozen_at: null,
          purge_after: null,
          renewed_at: null,
        }),
      ]),
    );

    const detailRes = await request(app)
      .get(`/api/v1/listings/admin/${id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data).toEqual(
      expect.objectContaining({
        publication_period_days: 30,
        expires_at: expect.any(String),
        frozen_at: null,
        purge_after: null,
        renewed_at: null,
      }),
    );
    expect(detailRes.body.data.expiry_reminder_sent_at).toBeUndefined();

    const publicRes = await request(app)
      .get(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.expires_at).toBeUndefined();
    expect(publicRes.body.data.frozen_at).toBeUndefined();
    expect(publicRes.body.data.purge_after).toBeUndefined();
    expect(publicRes.body.data.renewed_at).toBeUndefined();
  });
});

/**
 * Listing Lifetime / Renewal, Step B8 §21 — the Admin `lifecycleFilter`
 * query param (`ACTIVE`/`EXPIRING_SOON`/`EXPIRED_FROZEN`), a purely
 * additive predicate over the existing keyword/moderationStatus/status
 * filters already covered above. Each case builds its own listing(s) so
 * assertions never depend on another test's leftover state.
 */
describe('GET /listings/admin?lifecycleFilter (Step B8 §21)', () => {
  test('A: an ACTIVE listing (expires_at > 2 days out) is included in the Active filter, excluded from Expiring Soon and Expired/Frozen', async () => {
    const id = await createActiveListing({ periodDays: 30 });

    const activeRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=ACTIVE')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const expiringRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRING_SOON')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(expiringRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const frozenRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRED_FROZEN')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(frozenRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('B: a listing expiring within the 2-day window is included in Expiring Soon, excluded from Active', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    await setExpiresAt(id, 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 DAY)');

    const expiringRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRING_SOON')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(expiringRes.status).toBe(200);
    expect(expiringRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const activeRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=ACTIVE')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(activeRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('C: a frozen listing is included in the Expired/Frozen filter, excluded from Active and Expiring Soon', async () => {
    const id = await createFrozenListing();

    const frozenRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRED_FROZEN')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(frozenRes.status).toBe(200);
    expect(frozenRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const activeRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=ACTIVE')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(activeRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const expiringRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRING_SOON')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(expiringRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('D: a manually-unpublished (never frozen) listing is excluded from the Expired/Frozen filter', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const unpublishRes = await request(app)
      .post(`/api/v1/listings/${id}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(unpublishRes.status).toBe(200);

    const frozenRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRED_FROZEN')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(frozenRes.status).toBe(200);
    expect(frozenRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('E: a legacy PUBLISHED listing (expires_at NULL) is excluded from every lifecycle-only filter', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    await pool.query('UPDATE listings SET expires_at = NULL WHERE id = ?', [
      id,
    ]);

    for (const lifecycleFilter of [
      'ACTIVE',
      'EXPIRING_SOON',
      'EXPIRED_FROZEN',
    ]) {
      // eslint-disable-next-line no-await-in-loop -- sequential by design
      const res = await request(app)
        .get(`/api/v1/listings/admin?lifecycleFilter=${lifecycleFilter}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id })]),
      );
    }

    // Still visible on the unfiltered queue — E is about the lifecycle
    // predicate specifically, not about the listing disappearing outright.
    const unfilteredRes = await request(app)
      .get('/api/v1/listings/admin?keyword=Lifecycle Test Hotel')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(unfilteredRes.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('F: a soft-deleted (purged) listing never appears in the admin queue, filtered or not', async () => {
    const id = await createFrozenListing();
    await pool.query(
      'UPDATE listings SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [id],
    );

    const frozenRes = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRED_FROZEN')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(frozenRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );

    const unfilteredRes = await request(app)
      .get('/api/v1/listings/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(unfilteredRes.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });

  test('G: the lifecycle filter is visible to a MODERATOR too, independent of listing ownership', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    await setExpiresAt(id, 'DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 1 DAY)');

    const res = await request(app)
      .get('/api/v1/listings/admin?lifecycleFilter=EXPIRING_SOON')
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id })]),
    );
  });
});

/**
 * Listing Lifetime / Renewal, Step B8 §22 — Admin Renew reuses the
 * existing `POST /listings/:id/renew` endpoint verbatim (Step B5); Admin/
 * Super Admin already hold `listing.publish` via the seeded role catalog,
 * so no RBAC change was needed for this to work.
 */
describe('POST /listings/:id/renew as Admin (Step B8 §22)', () => {
  test('an authorized Admin can renew an ACTIVE listing — same extend semantics as the Partner-facing renew', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const before = await request(app)
      .get(`/api/v1/listings/admin/${id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await renew(id, 30);
    expect(res.status).toBe(200);
    expect(res.body.data.renewed_at).not.toBeNull();
    expect(new Date(res.body.data.expires_at).getTime()).toBeGreaterThan(
      new Date(before.body.data.expires_at).getTime(),
    );
  });

  test('an authorized Admin can renew a FROZEN listing — reactivates it back to PUBLISHED', async () => {
    const id = await createFrozenListing();

    const res = await renew(id, 30);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.frozen_at).toBeNull();
    expect(res.body.data.renewed_at).not.toBeNull();
  });

  test('renewing does not reset moderation_status', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const rejectRes = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Needs more photos.' });
    expect(rejectRes.status).toBe(200);

    const renewRes = await renew(id, 30);
    expect(renewRes.status).toBe(200);

    const detailRes = await request(app)
      .get(`/api/v1/listings/admin/${id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(detailRes.body.data.moderation_status).toBe('REJECTED');
  });

  test('a purged (soft-deleted) listing cannot be renewed', async () => {
    const id = await createFrozenListing();
    await pool.query(
      'UPDATE listings SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [id],
    );

    const res = await renew(id, 30);
    expect(res.status).toBe(404);
  });

  test('a manually-unpublished (never frozen) listing cannot use Renew', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const unpublishRes = await request(app)
      .post(`/api/v1/listings/${id}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(unpublishRes.status).toBe(200);

    const res = await renew(id, 30);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_RENEWABLE');
  });

  test('an invalid publication period is rejected', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const res = await renew(id, 9999);
    expect(res.status).toBe(422);
  });

  test('a CUSTOMER is rejected with 403', async () => {
    const id = await createActiveListing({ periodDays: 30 });
    const res = await renew(id, 30, customer.accessToken);
    expect(res.status).toBe(403);
  });
});

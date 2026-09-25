/**
 * Step M2B (Moderation Backend Core): the real pre-publication workflow —
 * `POST /listings/:id/submit-for-review`, the closed decision matrix
 * behind `PATCH /listings/admin/:id/moderation-status`, the closed
 * direct-publish bypass, the PENDING_REVIEW/PUBLISHED edit-block, and the
 * concurrency/audit/notification/public-visibility invariants the M2B
 * brief requires. Reuses `adminListingModeration.test.js`'s own
 * MODERATOR-seeding convention and `listingCrud.test.js`'s fixture-helper
 * shape — never a second, divergent implementation of either.
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
let admin;
let vendor;
let vendorUserId;
let customer;
let moderator;
let manager;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

/**
 * A `supertest`/superagent `Test` is a lazy thenable — it only calls its
 * own `.end()` (the thing that actually dispatches the HTTP request) once
 * something awaits/`.then()`s it. The concurrency tests below need the
 * request to be genuinely IN FLIGHT (blocked inside MySQL on a real row
 * lock) while the test still holds a separate blocking connection open —
 * `const p = request(app)...send(body)` alone would never fire until it's
 * awaited, which would silently turn the "concurrent" scenario into a
 * plain sequential one. Wrapping `.end()` in its own Promise forces the
 * request to start immediately, synchronously, right where it's called.
 */
function fireRequest(builder) {
  return new Promise((resolve, reject) => {
    builder.end((err, res) => {
      if (err && !res) reject(err);
      else resolve(res);
    });
  });
}

async function registerUser(label) {
  const email = `m2b-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'M2bWorkflowFixture!2024',
    firstName: 'M2B',
    lastName: label,
  });
  return {
    userId: res.body.data.user.id,
    accessToken: res.body.data.access_token,
    email,
  };
}

// Mirrors `adminListingModeration.test.js`'s own `createDraftListing` /
// `makePublishable` exactly — never a second, divergent fixture builder.
async function createDraftListing(token = vendor.accessToken) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${token}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `M2B Workflow Hotel ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          summary: 'A nice place to stay.',
          description: 'Full description of the listing.',
        },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function makePublishable(id, token = vendor.accessToken) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${token}`)
    .send({ listingId: id, bookableUnitType: 'HOTEL_ROOM' });
}

async function createPublishableDraft(token = vendor.accessToken) {
  const id = await createDraftListing(token);
  await makePublishable(id, token);
  return id;
}

function submitForReview(
  id,
  { publicationPeriodDays = 30 } = {},
  token = vendor.accessToken,
) {
  return request(app)
    .post(`/api/v1/listings/${id}/submit-for-review`)
    .set('Authorization', `Bearer ${token}`)
    .send({ publicationPeriodDays });
}

async function createPendingReviewListing({ periodDays = 30 } = {}) {
  const id = await createPublishableDraft();
  const res = await submitForReview(id, { publicationPeriodDays: periodDays });
  expect(res.status).toBe(200);
  return id;
}

async function createPublishedListing({ periodDays = 30 } = {}) {
  const id = await createPendingReviewListing({ periodDays });
  const res = await request(app)
    .patch(`/api/v1/listings/admin/${id}/moderation-status`)
    .set('Authorization', `Bearer ${moderator.accessToken}`)
    .send({ status: 'APPROVED' });
  expect(res.status).toBe(200);
  return id;
}

async function fetchRow(id) {
  const [[row]] = await pool.query(
    `SELECT l.id, ls.code AS status_code, ms.code AS moderation_status_code,
            l.moderation_notes, l.publication_period_days, l.expires_at,
            l.unpublished_at, l.deleted_at
     FROM listings l
     JOIN listing_statuses ls ON ls.id = l.status_id
     JOIN moderation_statuses ms ON ms.id = l.moderation_status_id
     WHERE l.id = ?`,
    [id],
  );
  return row;
}

async function countAuditRows(id, action) {
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM audit_logs WHERE target_type = 'listing' AND target_id = ? AND action = ?`,
    [id, action],
  );
  return c;
}

async function countListingNotifications(recipientUserId) {
  const [[{ c }]] = await pool.query(
    `SELECT COUNT(*) AS c FROM notifications
     WHERE recipient_user_id = ?
       AND category_id = (SELECT id FROM notification_categories WHERE code = 'LISTING')`,
    [recipientUserId],
  );
  return c;
}

/** Assigns the global MANAGER role + a `manager_companies` assignment to `partnerId` — the real "Partner staff with ordinary listing permissions" fixture (Sprint F's Manager-assignment fallback covers exactly `listing.create`/`listing.update`/`listing.publish`, never `listing.moderate`). */
async function createAssignedManager(label) {
  const reg = await registerUser(label);
  await request(app)
    .post('/api/v1/managers/admin/promote')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: reg.userId });
  await request(app)
    .post(`/api/v1/managers/admin/${reg.userId}/companies`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ partnerId });
  return login(reg.email, 'M2bWorkflowFixture!2024');
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

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[vendorRow]] = await pool.query(
    'SELECT id FROM users WHERE normalized_email = ?',
    [DEV_CREDENTIALS.vendor.email.toLowerCase()],
  );
  vendorUserId = vendorRow.id;

  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: 'm2b.moderator@example.com',
    password: 'M2bModerator!2024',
    firstName: 'M2B',
    lastName: 'Moderator',
  });
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id) SELECT id, ? FROM roles WHERE code = 'MODERATOR'`,
    [registerRes.body.data.user.id],
  );
  moderator = await login('m2b.moderator@example.com', 'M2bModerator!2024');

  manager = await createAssignedManager('staff');
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /listings/:id/submit-for-review (brief §5-7, §26)', () => {
  test('the owner submits a ready DRAFT listing -> PENDING_REVIEW, moderation reset to PENDING, notes cleared, audit written', async () => {
    const id = await createPublishableDraft();
    const before = await countAuditRows(id, 'listing.submitted_for_review');

    const res = await submitForReview(id, { publicationPeriodDays: 90 });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_REVIEW');
    expect(res.body.data.moderation_status).toBe('PENDING');

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PENDING_REVIEW');
    expect(row.moderation_status_code).toBe('PENDING');
    expect(row.moderation_notes).toBeNull();

    const after = await countAuditRows(id, 'listing.submitted_for_review');
    expect(after).toBe(before + 1);
  });

  test('a Partner who does not own this listing is denied', async () => {
    const id = await createPublishableDraft();
    const outsider = await registerUser('wrong-owner');
    const res = await submitForReview(id, {}, outsider.accessToken);
    expect(res.status).toBe(403);
  });

  test('an unauthenticated caller is rejected (401)', async () => {
    const id = await createPublishableDraft();
    const res = await request(app)
      .post(`/api/v1/listings/${id}/submit-for-review`)
      .send({ publicationPeriodDays: 30 });
    expect(res.status).toBe(401);
  });

  test('a listing that is not yet publish-ready is rejected with 422 and no state changes', async () => {
    const id = await createDraftListing();
    const res = await submitForReview(id, { publicationPeriodDays: 30 });
    expect(res.status).toBe(422);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('DRAFT');
    expect(row.moderation_status_code).toBe('PENDING');
  });

  test('a listing already in PENDING_REVIEW cannot be submitted again', async () => {
    const id = await createPendingReviewListing();
    const res = await submitForReview(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('an ARCHIVED listing cannot be submitted for review', async () => {
    // Only PUBLISHED/UNPUBLISHED can reach ARCHIVED per
    // `listingStatusTransitions.js` — archive directly from PUBLISHED,
    // the real terminal-state path (DRAFT has no archive edge at all).
    const id = await createPublishedListing();
    const archiveRes = await request(app)
      .post(`/api/v1/listings/${id}/archive`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(archiveRes.status).toBe(200);

    const res = await submitForReview(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('a frozen (expired) listing cannot bypass renewal via submit-for-review — it must go through the existing Renew flow instead', async () => {
    // A frozen listing is UNPUBLISHED with `frozen_at` set (the hourly
    // sweep's own write shape) — reproduced directly here rather than
    // running the real sweep, since only the resulting row shape matters
    // for this guard.
    const id = await createPublishedListing({ periodDays: 30 });
    await pool.query(
      `UPDATE listings
       SET status_id = (SELECT id FROM listing_statuses WHERE code = 'UNPUBLISHED'),
           frozen_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [id],
    );

    const res = await submitForReview(id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_FROZEN_REQUIRES_RENEWAL');
  });
});

describe('Direct-publish bypass is closed (brief §8, §27)', () => {
  test('the Partner owner cannot publish a DRAFT listing directly', async () => {
    const id = await createPublishableDraft();
    const res = await request(app)
      .post(`/api/v1/listings/${id}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(res.status).toBe(403);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('DRAFT');
  });

  test('the Partner owner cannot publish an UNPUBLISHED listing directly', async () => {
    const id = await createPublishedListing();
    await request(app)
      .post(`/api/v1/listings/${id}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/listings/${id}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(res.status).toBe(403);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('UNPUBLISHED');
  });

  test('a Partner-assigned Manager holding ordinary listing.create/update permission still cannot publish directly', async () => {
    const id = await createPublishableDraft(manager.accessToken);
    const res = await request(app)
      .post(`/api/v1/listings/${id}/publish`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(res.status).toBe(403);
  });

  test('no payload field can force a listing to PUBLISHED/APPROVED through the ordinary update route', async () => {
    const id = await createPublishableDraft();
    // `updateListingSchema` has no `status`/`moderation_status` field at
    // all, so Zod's default "strip unknown keys" behavior drops them
    // before the Service ever sees them — a legitimate field
    // (`isIndexable`) rides along so the "at least one field" refine
    // still passes and `updateListing` genuinely runs.
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        statusId: 3,
        isIndexable: true,
      });
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('DRAFT');
    expect(row.moderation_status_code).toBe('PENDING');
  });

  test('a MODERATOR does not need and cannot use listing.publish directly — approval still works through the moderation endpoint alone', async () => {
    const id = await createPendingReviewListing();

    const directPublishRes = await request(app)
      .post(`/api/v1/listings/${id}/publish`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(directPublishRes.status).toBe(403);

    const approveRes = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('PUBLISHED');
  });
});

describe('Moderation decision matrix (brief §9-11/§20-21, §28)', () => {
  test('PENDING_REVIEW + APPROVED -> PUBLISHED, moderation_status APPROVED, notes cleared', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PUBLISHED');
    expect(row.moderation_status_code).toBe('APPROVED');
    expect(row.moderation_notes).toBeNull();
  });

  test('PENDING_REVIEW + REJECTED -> DRAFT, moderation_status REJECTED with the reason retained', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Please add exterior photos.' });
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('DRAFT');
    expect(row.moderation_status_code).toBe('REJECTED');
    expect(row.moderation_notes).toBe('Please add exterior photos.');
  });

  test('a REJECTED return-for-changes requires a non-empty reason (422)', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED' });
    expect(res.status).toBe(422);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PENDING_REVIEW');
  });

  test('PUBLISHED + REJECTED -> UNPUBLISHED, moderation_status REJECTED, unpublished_at set — the listing stops being public', async () => {
    const id = await createPublishedListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Violates content policy.' });
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('UNPUBLISHED');
    expect(row.moderation_status_code).toBe('REJECTED');
    expect(row.unpublished_at).not.toBeNull();

    const publicRes = await request(app).get(`/api/v1/listings/${id}`);
    expect(publicRes.status).toBe(404);
  });

  test('PUBLISHED + FLAGGED -> UNPUBLISHED, moderation_status FLAGGED, no reason required', async () => {
    const id = await createPublishedListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'FLAGGED' });
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('UNPUBLISHED');
    expect(row.moderation_status_code).toBe('FLAGGED');
    expect(row.unpublished_at).not.toBeNull();

    const publicRes = await request(app).get(`/api/v1/listings/${id}`);
    expect(publicRes.status).toBe(404);
  });

  test('PUBLISHED + APPROVED is an idempotent re-confirmation — status_id and unpublished_at are untouched', async () => {
    const id = await createPublishedListing();
    const before = await fetchRow(id);

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(200);

    const after = await fetchRow(id);
    expect(after.status_code).toBe('PUBLISHED');
    expect(after.moderation_status_code).toBe('APPROVED');
    expect(after.unpublished_at).toBe(before.unpublished_at);
  });

  test('an invalid combination (DRAFT + APPROVED) is rejected cleanly, no partial write', async () => {
    const id = await createDraftListing();
    const before = await fetchRow(id);

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_MODERATION_TRANSITION');

    const after = await fetchRow(id);
    expect(after).toEqual(before);
  });

  test('a Partner (owner) cannot call the moderation endpoint', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  test('an unauthorized admin-area role (CUSTOMER) cannot moderate', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  test('a soft-deleted listing cannot be moderated', async () => {
    const id = await createPendingReviewListing();
    await pool.query(
      'UPDATE listings SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [id],
    );

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_DELETED');
  });
});

describe('Edit policy during/after review (brief §12-14/§18, §29)', () => {
  test('a DRAFT listing remains editable', async () => {
    const id = await createDraftListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1, longitude: 44.5 } });
    expect(res.status).toBe(200);
  });

  test('a PENDING_REVIEW listing cannot be edited', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1, longitude: 44.5 } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_UNDER_REVIEW');

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PENDING_REVIEW');
  });

  test('a PUBLISHED listing cannot be edited directly', async () => {
    const id = await createPublishedListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1, longitude: 44.5 } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_PUBLISHED_EDIT_BLOCKED');

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PUBLISHED');
  });

  test('unpublish -> edit -> submit-for-review -> approve is the required round trip for changing a PUBLISHED listing', async () => {
    const id = await createPublishedListing();

    const unpublishRes = await request(app)
      .post(`/api/v1/listings/${id}/unpublish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(unpublishRes.status).toBe(200);

    const editRes = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 41.0, longitude: 45.0 } });
    expect(editRes.status).toBe(200);

    // Direct UNPUBLISHED -> PUBLISHED must no longer be reachable — the
    // Partner must go through submission again (brief §14).
    const directPublishRes = await request(app)
      .post(`/api/v1/listings/${id}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(directPublishRes.status).toBe(403);

    const submitRes = await submitForReview(id, { publicationPeriodDays: 30 });
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.status).toBe('PENDING_REVIEW');

    const approveRes = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('PUBLISHED');
  });

  test('a returned-for-changes DRAFT is editable and resubmission works, clearing the prior note', async () => {
    const id = await createPendingReviewListing();
    const rejectRes = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Missing description.' });
    expect(rejectRes.status).toBe(200);

    const editRes = await request(app)
      .patch(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        translations: [
          {
            languageId,
            title: `M2B Resubmit ${Date.now()}`,
            summary: 'Updated summary.',
            description: 'Updated description addressing the feedback.',
          },
        ],
      });
    expect(editRes.status).toBe(200);

    const resubmitRes = await submitForReview(id, {
      publicationPeriodDays: 30,
    });
    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.data.status).toBe('PENDING_REVIEW');

    const row = await fetchRow(id);
    expect(row.moderation_status_code).toBe('PENDING');
    expect(row.moderation_notes).toBeNull();
  });
});

describe('Concurrency (brief §15-18, §30) — real FOR UPDATE blocking, no arbitrary sleeps', () => {
  test('A: an approval that had to wait for the lock uses the listing state as it stood at commit time, not a stale pre-lock read', async () => {
    const id = await createPendingReviewListing({ periodDays: 30 });

    const blocker = await pool.getConnection();
    await blocker.beginTransaction();
    await blocker.query('SELECT id FROM listings WHERE id = ? FOR UPDATE', [
      id,
    ]);

    // Fired (not merely constructed — see `fireRequest`) but not yet
    // awaited: this real HTTP request's own `lockById` call will
    // genuinely block inside MySQL until `blocker` releases the row lock
    // below. There is no timing race on the outcome — only InnoDB's own
    // lock queue — because `blocker` fully acquired its lock (awaited)
    // before this request was ever fired.
    const approvePromise = fireRequest(
      request(app)
        .patch(`/api/v1/listings/admin/${id}/moderation-status`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ status: 'APPROVED' }),
    );

    // While the approve request is blocked waiting on the row lock,
    // simulate a second, already-committed write to the exact column
    // the approval will read once it acquires the lock.
    await blocker.query(
      'UPDATE listings SET publication_period_days = 90 WHERE id = ?',
      [id],
    );
    await blocker.commit();
    blocker.release();

    const res = await approvePromise;
    expect(res.status).toBe(200);

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PUBLISHED');
    expect(row.publication_period_days).toBe(90);
  });

  test('B: a Partner edit cannot land after a concurrent submission establishes PENDING_REVIEW first', async () => {
    const id = await createPublishableDraft();

    const blocker = await pool.getConnection();
    await blocker.beginTransaction();
    await blocker.query('SELECT id FROM listings WHERE id = ? FOR UPDATE', [
      id,
    ]);

    const editPromise = fireRequest(
      request(app)
        .patch(`/api/v1/listings/${id}`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ location: { latitude: 41.1, longitude: 45.1 } }),
    );

    // Simulates `submitForReview`'s own write, committed while the edit
    // request is still blocked on the same row lock.
    await blocker.query(
      `UPDATE listings
       SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PENDING_REVIEW'),
           moderation_status_id = (SELECT id FROM moderation_statuses WHERE code = 'PENDING'),
           moderation_notes = NULL
       WHERE id = ?`,
      [id],
    );
    await blocker.commit();
    blocker.release();

    const res = await editPromise;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_UNDER_REVIEW');

    const row = await fetchRow(id);
    expect(row.status_code).toBe('PENDING_REVIEW');
  });

  test('C: a moderation attempt whose transition became invalid before the lock was acquired rolls back cleanly, with zero partial writes/audit/notification', async () => {
    const id = await createPendingReviewListing();
    const auditBefore = await countAuditRows(
      id,
      'listing.moderation_status_changed',
    );
    const notificationsBefore = await countListingNotifications(vendorUserId);

    const blocker = await pool.getConnection();
    await blocker.beginTransaction();
    await blocker.query('SELECT id FROM listings WHERE id = ? FOR UPDATE', [
      id,
    ]);

    const approvePromise = fireRequest(
      request(app)
        .patch(`/api/v1/listings/admin/${id}/moderation-status`)
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ status: 'APPROVED' }),
    );

    // Simulates a second moderator having already returned this listing
    // to DRAFT while the first approval was blocked on the lock —
    // DRAFT + APPROVED is not in the closed decision matrix.
    await blocker.query(
      `UPDATE listings
       SET status_id = (SELECT id FROM listing_statuses WHERE code = 'DRAFT'),
           moderation_status_id = (SELECT id FROM moderation_statuses WHERE code = 'REJECTED'),
           moderation_notes = 'Returned by another moderator.'
       WHERE id = ?`,
      [id],
    );
    await blocker.commit();
    blocker.release();

    const res = await approvePromise;
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_MODERATION_TRANSITION');

    const row = await fetchRow(id);
    expect(row.status_code).toBe('DRAFT');
    expect(row.moderation_status_code).toBe('REJECTED');
    expect(row.moderation_notes).toBe('Returned by another moderator.');

    const auditAfter = await countAuditRows(
      id,
      'listing.moderation_status_changed',
    );
    expect(auditAfter).toBe(auditBefore);
    const notificationsAfter = await countListingNotifications(vendorUserId);
    expect(notificationsAfter).toBe(notificationsBefore);
  });
});

describe('Audit trail and notifications (brief §21-22, §31)', () => {
  test('submit-for-review writes exactly one durable audit row', async () => {
    const id = await createPublishableDraft();
    const before = await countAuditRows(id, 'listing.submitted_for_review');
    const res = await submitForReview(id);
    expect(res.status).toBe(200);
    const after = await countAuditRows(id, 'listing.submitted_for_review');
    expect(after).toBe(before + 1);
  });

  test('approval writes exactly one audit row and exactly one notification to the partner owner', async () => {
    const id = await createPendingReviewListing();
    const auditBefore = await countAuditRows(
      id,
      'listing.moderation_status_changed',
    );
    const notificationsBefore = await countListingNotifications(vendorUserId);

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(200);

    expect(await countAuditRows(id, 'listing.moderation_status_changed')).toBe(
      auditBefore + 1,
    );
    expect(await countListingNotifications(vendorUserId)).toBe(
      notificationsBefore + 1,
    );
  });

  test('return-for-changes writes exactly one audit row (with before/after status) and exactly one notification carrying the reason', async () => {
    const id = await createPendingReviewListing();
    const auditBefore = await countAuditRows(
      id,
      'listing.moderation_status_changed',
    );
    const notificationsBefore = await countListingNotifications(vendorUserId);

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Please add a floor plan.' });
    expect(res.status).toBe(200);

    const [[log]] = await pool.query(
      `SELECT before_snapshot, after_snapshot FROM audit_logs
       WHERE target_type = 'listing' AND target_id = ? AND action = 'listing.moderation_status_changed'
       ORDER BY id DESC LIMIT 1`,
      [id],
    );
    const before =
      typeof log.before_snapshot === 'string'
        ? JSON.parse(log.before_snapshot)
        : log.before_snapshot;
    const after =
      typeof log.after_snapshot === 'string'
        ? JSON.parse(log.after_snapshot)
        : log.after_snapshot;
    expect(before.statusCode).toBe('PENDING_REVIEW');
    expect(after.statusCode).toBe('DRAFT');
    expect(after.notes).toBe('Please add a floor plan.');

    expect(await countAuditRows(id, 'listing.moderation_status_changed')).toBe(
      auditBefore + 1,
    );

    const [[notification]] = await pool.query(
      `SELECT payload FROM notifications
       WHERE recipient_user_id = ? AND category_id = (SELECT id FROM notification_categories WHERE code = 'LISTING')
       ORDER BY id DESC LIMIT 1`,
      [vendorUserId],
    );
    expect(await countListingNotifications(vendorUserId)).toBe(
      notificationsBefore + 1,
    );
    const payload =
      typeof notification.payload === 'string'
        ? JSON.parse(notification.payload)
        : notification.payload;
    expect(payload.notes).toBe('Please add a floor plan.');
  });

  test('a failed moderation attempt (invalid transition) produces zero misleading notifications', async () => {
    const id = await createDraftListing();
    const notificationsBefore = await countListingNotifications(vendorUserId);

    const res = await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(409);

    expect(await countListingNotifications(vendorUserId)).toBe(
      notificationsBefore,
    );
  });
});

describe('Public visibility regression after M2B (brief §23, §32)', () => {
  test('a PUBLISHED + APPROVED listing is publicly visible', async () => {
    const id = await createPublishedListing();
    const res = await request(app).get(`/api/v1/listings/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
  });

  test('a PENDING_REVIEW listing is masked from the public and from other customers, but still visible to its owner', async () => {
    const id = await createPendingReviewListing();

    const anonRes = await request(app).get(`/api/v1/listings/${id}`);
    expect(anonRes.status).toBe(404);

    const customerRes = await request(app)
      .get(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(customerRes.status).toBe(404);

    const ownerRes = await request(app)
      .get(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(ownerRes.status).toBe(200);
  });

  test('a returned-for-changes DRAFT listing is masked from the public', async () => {
    const id = await createPendingReviewListing();
    await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Needs more detail.' });

    const res = await request(app).get(`/api/v1/listings/${id}`);
    expect(res.status).toBe(404);
  });

  test('a formerly-PUBLISHED listing rejected/flagged by a Moderator is masked from the public (now UNPUBLISHED)', async () => {
    const id = await createPublishedListing();
    await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'FLAGGED' });

    const res = await request(app).get(`/api/v1/listings/${id}`);
    expect(res.status).toBe(404);
  });

  test('menu and opening-hours stay masked consistently with the parent listing (M2A, not re-litigated here)', async () => {
    const id = await createPendingReviewListing();

    const menuRes = await request(app).get(`/api/v1/listings/${id}/menu`);
    expect(menuRes.status).toBe(404);

    const hoursRes = await request(app).get(
      `/api/v1/listings/${id}/opening-hours`,
    );
    expect(hoursRes.status).toBe(404);
  });

  // Step M4.1: `GET /listings/:id` now deliberately includes
  // `moderation_notes` for the listing's own owner (see
  // `ListingService#canManageListing`) — that's the fix M4.1 shipped, not
  // a regression. This test's original "public response shape" claim
  // used the owner's own token, which conflated the two; it now checks
  // each explicitly (full owner/manager/wrong-partner/anonymous/customer
  // matrix lives in `listingCrud.test.js`'s "private moderation_notes"
  // suite — this is just a targeted regression check in place).
  test('moderation_notes reaches the owner (Step M4.1) but never a genuinely public/anonymous request', async () => {
    const id = await createPendingReviewListing();
    await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Confidential internal note.' });

    const ownerRes = await request(app)
      .get(`/api/v1/listings/${id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.body.data.moderation_notes).toBe(
      'Confidential internal note.',
    );

    // The listing is DRAFT+REJECTED here (PENDING_REVIEW + REJECTED ->
    // DRAFT), so it isn't publicly visible at all — a genuinely anonymous
    // request 404s, never leaking the reason.
    const anonymousRes = await request(app).get(`/api/v1/listings/${id}`);
    expect(anonymousRes.status).toBe(404);
    expect(anonymousRes.body.data).toBeNull();
  });
});

describe('GET /listings/admin/:id/moderation-history (Step M3.1)', () => {
  test("a MODERATOR (holds listing.moderate, not audit.view) can read this listing's own history", async () => {
    const id = await createPendingReviewListing();
    await request(app)
      .patch(`/api/v1/listings/admin/${id}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });

    const res = await request(app)
      .get(`/api/v1/listings/admin/${id}/moderation-history`)
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const actions = res.body.data.map((entry) => entry.action);
    expect(actions).toContain('listing.submitted_for_review');
    expect(actions).toContain('listing.moderation_status_changed');
    expect(
      res.body.data.every((entry) => entry.target_type === 'listing'),
    ).toBe(true);
    expect(res.body.data.every((entry) => entry.target_id === id)).toBe(true);
  });

  test('no audit data from an unrelated listing bleeds into the response', async () => {
    const idA = await createPendingReviewListing();
    const idB = await createPendingReviewListing();
    await request(app)
      .patch(`/api/v1/listings/admin/${idB}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Unrelated listing B rejection.' });

    const res = await request(app)
      .get(`/api/v1/listings/admin/${idA}/moderation-history`)
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((entry) => entry.target_id === idA)).toBe(true);
    expect(res.body.data.some((entry) => entry.target_id === idB)).toBe(false);
  });

  test('the endpoint has no client-controllable targetType — an attempted override via query string has no effect', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .get(`/api/v1/listings/admin/${id}/moderation-history`)
      .query({ targetType: 'booking', targetId: 999999 })
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.every((entry) => entry.target_type === 'listing'),
    ).toBe(true);
    expect(res.body.data.every((entry) => entry.target_id === id)).toBe(true);
  });

  test('a Partner (owner) is denied — 403, matching the moderation-detail endpoint', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .get(`/api/v1/listings/admin/${id}/moderation-history`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('a CUSTOMER is denied — 403', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .get(`/api/v1/listings/admin/${id}/moderation-history`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('an unauthenticated caller is rejected — 401', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app).get(
      `/api/v1/listings/admin/${id}/moderation-history`,
    );
    expect(res.status).toBe(401);
  });

  test('permission is enforced before existence — a nonexistent listing id still returns 403 for a caller lacking listing.moderate, never a 404 that would leak existence', async () => {
    const res = await request(app)
      .get('/api/v1/listings/admin/999999999/moderation-history')
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('an ADMIN (holds listing.moderate via the blanket grant) can also read the scoped history', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .get(`/api/v1/listings/admin/${id}/moderation-history`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('the existing generic ADMIN/audit.view-gated /admin/audit-logs endpoint is unchanged and still reachable', async () => {
    const id = await createPendingReviewListing();
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .query({ targetType: 'listing', targetId: id })
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.every(
        (entry) => entry.target_type === 'listing' && entry.target_id === id,
      ),
    ).toBe(true);
  });

  test('a MODERATOR still cannot reach the generic /admin/audit-logs endpoint — no accidental broadening of audit.view', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${moderator.accessToken}`);
    expect(res.status).toBe(403);
  });
});

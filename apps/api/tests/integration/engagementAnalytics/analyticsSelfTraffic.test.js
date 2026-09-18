/**
 * Step A2.1 — partner self-traffic identity resolution, exercised
 * through the REAL production auth path (never a synthetic principal).
 * `ANALYTICS_COLLECTION_ENABLED` forced true via the same dynamic-
 * import-in-beforeAll technique as `analyticsIngestion.test.js` — see
 * that file's header comment for why.
 *
 * Confirms self-traffic filtering is decided from AUTHORITATIVE current
 * `partner_employees` membership (looked up per resolved target
 * partner), never from a JWT claim — the real access token issued by
 * `POST /auth/login` carries `partnerId: null` regardless of the
 * logging-in user's actual partner membership (see
 * `authenticationService.js#issueTokenPair`), so this file's whole
 * point is proving filtering still works correctly without it.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { v4 as uuid } from 'uuid';

let app;
let up;
let seedAll;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

let pool;
let vendor; // OWNER of partner A (the seeded partner)
let vendorB; // OWNER of partner B (freshly created in this file)
let staffA; // active non-owner employee of partner A
let superAdmin;
let admin;
let customer;

let partnerAId;
let partnerBId;
let languageId;
let hotelCategoryId;
let listingAId;
let listingBId;
let promotionAId;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function register(email, password, firstName, lastName) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName, lastName });
  return res.body.data.user.id;
}

async function publishListing(ownerAuth, partnerId, title) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
      categoryIds: [hotelCategoryId],
      location: { cityId: 1 },
    });
  const listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
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
    .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${ownerAuth.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return listingId;
}

async function fetchEvent(eventId) {
  const [rows] = await pool.query(
    'SELECT * FROM analytics_events WHERE event_id = ?',
    [eventId],
  );
  return rows[0] ?? null;
}

function ingest(authToken, events) {
  const req = request(app).post('/api/v1/analytics/events');
  if (authToken) req.set('Authorization', `Bearer ${authToken}`);
  return req.send({ events });
}

beforeAll(async () => {
  process.env.ANALYTICS_COLLECTION_ENABLED = 'true';

  ({ default: app } = await import('../../../src/app.js'));
  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ closeRedisConnection } =
    await import('../../../src/infrastructure/cache/redisClient.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerARow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerAId = partnerARow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[hotelCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelCategoryId = hotelCategory.id;

  // --- A REAL SUPER_ADMIN, through the real auth path: register, grant
  // the role via role_user directly (same established pattern
  // tests/integration/admin/adminAuditLogs.test.js already uses for
  // SUPPORT/MODERATOR fixtures), then log in normally — the token's
  // `roles` claim is derived fresh from the DB at login time
  // (`userService.getRoleCodes`), never synthesized. ---
  const superAdminEmail = `a21-super-admin-${Date.now()}@example.com`;
  const superAdminUserId = await register(
    superAdminEmail,
    'SuperAdmin!2024',
    'Super',
    'Admin',
  );
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'SUPER_ADMIN'`,
    [superAdminUserId],
  );
  superAdmin = await login(superAdminEmail, 'SuperAdmin!2024');

  // --- A REAL active partner_employees row for partner A, non-owner
  // (EDITOR), through the real auth path: register, insert the
  // membership row directly (the same established direct-SQL
  // partner_employees pattern tests/integration/listings/
  // listingCrud.test.js already uses), then log in normally. ---
  const staffEmail = `a21-staff-a-${Date.now()}@example.com`;
  const staffUserId = await register(staffEmail, 'StaffA!2024', 'Staff', 'A');
  const [[editorRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'EDITOR'",
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, staffUserId, editorRole.id],
  );
  staffA = await login(staffEmail, 'StaffA!2024');

  // --- Partner B: a second, independently-owned APPROVED partner (same
  // direct-SQL creation pattern as listingCrud.test.js's "To Be Flagged"
  // fixture), so its owner's real listing-creation flow is genuinely
  // authorized (they really do own it, not a synthetic principal). ---
  const [[approvedStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  const vendorBEmail = `a21-vendor-b-${Date.now()}@example.com`;
  const vendorBUserId = await register(
    vendorBEmail,
    'VendorB!2024',
    'Vendor',
    'B',
  );
  const [partnerBResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Partner B LLC',
      'Partner B',
      `a21-partner-b-${Date.now()}`,
      approvedStatus.id,
      approvedStatus.id,
      vendorBUserId,
    ],
  );
  partnerBId = partnerBResult.insertId;
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerBId, vendorBUserId, ownerRole.id],
  );
  vendorB = await login(vendorBEmail, 'VendorB!2024');

  listingAId = await publishListing(
    vendor,
    partnerAId,
    `A2.1 Listing A ${Date.now()}`,
  );
  listingBId = await publishListing(
    vendorB,
    partnerBId,
    `A2.1 Listing B ${Date.now()}`,
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const promoRes = await request(app)
    .post('/api/v1/advertising/admin')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      listingId: listingAId,
      placementCode: 'HOMEPAGE_SECTION',
      productId: 5,
      startDate: todayStr,
      markPaidNow: true,
    });
  promotionAId = promoRes.body.data.id;
}, 90_000);

afterAll(async () => {
  delete process.env.ANALYTICS_COLLECTION_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('A2.1 — real-auth-path self-traffic matrix (brief §14)', () => {
  test('A: the real Partner Owner viewing their OWN listing is filtered', async () => {
    const eventId = uuid();
    const res = await ingest(vendor.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingAId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test("B: the same Partner Owner viewing ANOTHER partner's listing still counts", async () => {
    const eventId = uuid();
    const res = await ingest(vendor.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingBId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).not.toBeNull();
  });

  test("C: an active non-owner employee (EDITOR) of partner A viewing partner A's listing is filtered", async () => {
    const eventId = uuid();
    const res = await ingest(staffA.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingAId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test("D: the same staff member viewing a DIFFERENT partner's listing still counts", async () => {
    const eventId = uuid();
    const res = await ingest(staffA.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingBId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).not.toBeNull();
  });

  test('E: a real ADMIN login is filtered regardless of target', async () => {
    const eventId = uuid();
    const res = await ingest(admin.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingBId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test('F: a real SUPER_ADMIN login is filtered regardless of target', async () => {
    const eventId = uuid();
    const res = await ingest(superAdmin.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingBId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test('G: a real CUSTOMER login always counts', async () => {
    const eventId = uuid();
    const res = await ingest(customer.accessToken, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingAId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).not.toBeNull();
  });

  test('H: a fully anonymous request always counts', async () => {
    const eventId = uuid();
    const res = await ingest(null, [
      {
        eventId,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingAId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).not.toBeNull();
  });

  test('mixed-partner batch: one request from the Partner A owner with an A-target and a B-target event — A filtered, B stored, per-event not per-request (brief §16)', async () => {
    const eventIdA = uuid();
    const eventIdB = uuid();
    const res = await ingest(vendor.accessToken, [
      {
        eventId: eventIdA,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingAId,
      },
      {
        eventId: eventIdB,
        eventName: 'listing_viewed',
        sessionId: uuid(),
        listingId: listingBId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventIdA)).toBeNull();
    expect(await fetchEvent(eventIdB)).not.toBeNull();
  });
});

describe('A2.1 — self-filter consistency across target types (brief §15)', () => {
  test('company_profile_view: owner viewing own company is filtered, viewing another company counts', async () => {
    const ownEventId = uuid();
    const ownRes = await ingest(vendor.accessToken, [
      {
        eventId: ownEventId,
        eventName: 'company_profile_view',
        sessionId: uuid(),
        companySlug: 'yerevan-boutique-hospitality',
      },
    ]);
    expect(ownRes.status).toBe(204);
    expect(await fetchEvent(ownEventId)).toBeNull();

    const [[partnerBRow]] = await pool.query(
      'SELECT slug FROM partners WHERE id = ?',
      [partnerBId],
    );
    const otherEventId = uuid();
    const otherRes = await ingest(vendor.accessToken, [
      {
        eventId: otherEventId,
        eventName: 'company_profile_view',
        sessionId: uuid(),
        companySlug: partnerBRow.slug,
      },
    ]);
    expect(otherRes.status).toBe(204);
    expect(await fetchEvent(otherEventId)).not.toBeNull();
  });

  test('promotion_impression: owner viewing own promotion is filtered', async () => {
    const eventId = uuid();
    const res = await ingest(vendor.accessToken, [
      {
        eventId,
        eventName: 'promotion_impression',
        sessionId: uuid(),
        listingId: listingAId,
        promotionId: promotionAId,
        placement: 'home_featured',
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test('contact_click: owner clicking contact on their own listing is filtered', async () => {
    const eventId = uuid();
    const res = await ingest(vendor.accessToken, [
      {
        eventId,
        eventName: 'contact_click',
        sessionId: uuid(),
        listingId: listingAId,
        contactMethod: 'phone',
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test('company_listing_click: staff member of partner A clicking through to their own listing is filtered', async () => {
    const eventId = uuid();
    const res = await ingest(staffA.accessToken, [
      {
        eventId,
        eventName: 'company_listing_click',
        sessionId: uuid(),
        companySlug: 'yerevan-boutique-hospitality',
        listingId: listingAId,
      },
    ]);
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });
});

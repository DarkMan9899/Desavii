/**
 * Step A5.1 — closes the one A5 acceptance criterion the original suite
 * didn't prove: a SINGLE real authenticated user with ACTIVE
 * `partner_employees` memberships in MULTIPLE partners, using the SAME
 * issued access token, can read each authorized workspace independently
 * with zero cross-partner merging and per-membership permission scoping.
 * A5's own `partnerAnalytics.test.js` proved tenant ISOLATION (two
 * different users, two different partners) — a materially different,
 * weaker claim than this file's.
 *
 * Same real-auth-path pattern as every other engagementAnalytics
 * integration test (register -> direct-SQL `partner_employees` rows ->
 * ONE login -> ONE token reused for every request below).
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { v4 as uuid } from 'uuid';

let app;
let up;
let seedAll;
let getMysqlPool;
let closeMysqlPool;
let resetRateLimits;

let pool;
let sharedUser; // ONE user, ONE token, used for every request in this file

let partnerAId; // OWNER membership for sharedUser
let partnerBId; // ANALYTICS_VIEWER membership for sharedUser
let partnerCId; // EDITOR membership (no VIEW_ANALYTICS) for sharedUser
let partnerDId; // NO membership at all for sharedUser

let languageId;
let listingTypeId;
let publishedStatusId;
let approvedModerationStatusId;
let currencyId;
let adPlacementTypeId;
let adProductId;
let adActiveStatusId;

let listingA;
let listingB;
let promotionA;
let promotionB;

async function register(email, password, firstName, lastName) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password, firstName, lastName });
  return res.body.data.user.id;
}

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function insertPartner(displayName) {
  const [[approvedStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [result] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      `${displayName} LLC`,
      displayName,
      `a51-${displayName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      approvedStatus.id,
      approvedStatus.id,
      sharedUser.userId,
    ],
  );
  return result.insertId;
}

async function addMembership(partnerId, roleCode) {
  const [[role]] = await pool.query(
    'SELECT id FROM partner_employee_roles WHERE code = ?',
    [roleCode],
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerId, sharedUser.userId, role.id],
  );
}

async function insertListing({ partnerId, title }) {
  const slug = `a51-listing-${uuid()}`;
  const [result] = await pool.query(
    `INSERT INTO listings
       (partner_id, listing_type_id, slug, status_id, moderation_status_id)
     VALUES (?, ?, ?, ?, ?)`,
    [
      partnerId,
      listingTypeId,
      slug,
      publishedStatusId,
      approvedModerationStatusId,
    ],
  );
  const listingId = result.insertId;
  await pool.query(
    'INSERT INTO listing_translations (listing_id, language_id, title) VALUES (?, ?, ?)',
    [listingId, languageId, title],
  );
  return listingId;
}

async function insertPromotion({ partnerId, listingId }) {
  const today = new Date().toISOString().slice(0, 10);
  const [result] = await pool.query(
    `INSERT INTO advertisements
       (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id,
        price_snapshot_amount, currency_id, start_date, end_date, requested_by)
     VALUES (?, ?, ?, ?, ?, 10000, ?, ?, ?, ?)`,
    [
      listingId,
      partnerId,
      adPlacementTypeId,
      adProductId,
      adActiveStatusId,
      currencyId,
      today,
      today,
      1,
    ],
  );
  return result.insertId;
}

async function insertEvent({
  eventName,
  day,
  listingId = null,
  partnerId = null,
  promotionId = null,
  placement = null,
  anonymousVisitorId = null,
}) {
  await pool.query(
    `INSERT INTO analytics_events
       (event_id, event_name, occurred_at, listing_id, partner_id, promotion_id, placement, anonymous_visitor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      eventName,
      `${day} 08:00:00.000`,
      listingId,
      partnerId,
      promotionId,
      placement,
      anonymousVisitorId,
    ],
  );
}

async function insertNEvents(n, opts) {
  const inserts = Array.from({ length: n }, () => insertEvent(opts));
  await Promise.all(inserts);
}

function getOverview(partnerId, extra = '') {
  return request(app)
    .get(`/api/v1/analytics/partner/overview?partnerId=${partnerId}${extra}`)
    .set('Authorization', `Bearer ${sharedUser.accessToken}`);
}

function getListings(partnerId, extra = '') {
  return request(app)
    .get(`/api/v1/analytics/partner/listings?partnerId=${partnerId}${extra}`)
    .set('Authorization', `Bearer ${sharedUser.accessToken}`);
}

function getListingDetail(partnerId, listingId, extra = '') {
  return request(app)
    .get(
      `/api/v1/analytics/partner/listings/${listingId}?partnerId=${partnerId}${extra}`,
    )
    .set('Authorization', `Bearer ${sharedUser.accessToken}`);
}

function getPromotionDetail(partnerId, promotionId, extra = '') {
  return request(app)
    .get(
      `/api/v1/analytics/partner/promotions/${promotionId}?partnerId=${partnerId}${extra}`,
    )
    .set('Authorization', `Bearer ${sharedUser.accessToken}`);
}

beforeAll(async () => {
  ({ default: app } = await import('../../../src/app.js'));
  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));

  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[listingType]] = await pool.query(
    "SELECT id FROM listing_types WHERE code = 'HOTEL'",
  );
  listingTypeId = listingType.id;
  const [[publishedStatus]] = await pool.query(
    "SELECT id FROM listing_statuses WHERE code = 'PUBLISHED'",
  );
  publishedStatusId = publishedStatus.id;
  const [[approvedModeration]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  approvedModerationStatusId = approvedModeration.id;
  const [[currency]] = await pool.query(
    "SELECT id FROM currencies WHERE code = 'AMD'",
  );
  currencyId = currency.id;
  const [[placementType]] = await pool.query(
    'SELECT id FROM ad_placement_types LIMIT 1',
  );
  adPlacementTypeId = placementType.id;
  const [[product]] = await pool.query(
    'SELECT id FROM ad_products WHERE ad_placement_type_id = ? LIMIT 1',
    [adPlacementTypeId],
  );
  adProductId = product.id;
  const [[activeAdStatus]] = await pool.query(
    "SELECT id FROM advertisement_statuses WHERE code = 'ACTIVE'",
  );
  adActiveStatusId = activeAdStatus.id;

  // --- ONE real user, ONE real login, ONE token — used for every
  // request in this entire file (brief §3: "Use ONE issued access
  // token/session for all requests"). ---
  const email = `a51-multi-partner-${Date.now()}@example.com`;
  const userId = await register(email, 'MultiPartner!2024', 'Multi', 'Partner');
  const { accessToken } = await login(email, 'MultiPartner!2024');
  sharedUser = { userId, accessToken };

  // --- Partner A: OWNER (implicit bypass). Partner B: ANALYTICS_VIEWER
  // (the capability this step exists to prove is evaluated PER
  // membership, not globally). Partner C: EDITOR — active membership,
  // but NO VIEW_ANALYTICS grant (brief §9's "third partner" strong
  // test). Partner D: created by a DIFFERENT owner — sharedUser has NO
  // membership row at all (brief §10). ---
  partnerAId = await insertPartner('A51 Partner A');
  await addMembership(partnerAId, 'OWNER');

  partnerBId = await insertPartner('A51 Partner B');
  await addMembership(partnerBId, 'ANALYTICS_VIEWER');

  partnerCId = await insertPartner('A51 Partner C');
  await addMembership(partnerCId, 'EDITOR');

  const otherOwnerEmail = `a51-other-owner-${Date.now()}@example.com`;
  const otherOwnerUserId = await register(
    otherOwnerEmail,
    'OtherOwner!2024',
    'Other',
    'Owner',
  );
  const [[approvedStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [partnerDResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'A51 Partner D LLC',
      'A51 Partner D',
      `a51-partner-d-${Date.now()}`,
      approvedStatus.id,
      approvedStatus.id,
      otherOwnerUserId,
    ],
  );
  partnerDId = partnerDResult.insertId;
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerDId, otherOwnerUserId, ownerRole.id],
  );
  // sharedUser deliberately gets NO partner_employees row for Partner D.

  // --- Clearly different, deliberately memorable metrics per partner
  // (brief §4): A = 20 impressions / 11 views; B = 9 impressions / 7
  // views — chosen so accidental merging (e.g. 29/18) is impossible to
  // miss in an assertion. ---
  listingA = await insertListing({
    partnerId: partnerAId,
    title: 'A51 Listing A',
  });
  listingB = await insertListing({
    partnerId: partnerBId,
    title: 'A51 Listing B',
  });
  promotionA = await insertPromotion({
    partnerId: partnerAId,
    listingId: listingA,
  });
  promotionB = await insertPromotion({
    partnerId: partnerBId,
    listingId: listingB,
  });

  // Must fall within `range=90` relative to the REAL current Yerevan
  // business date — a fixed historical date would silently fall outside
  // a dynamically-resolved 90-day window and every HTTP-level assertion
  // below would see zero data instead of the seeded counts.
  const { toDateString } =
    await import('../../../src/infrastructure/database/dateFormat.js');
  const [[{ recentDay }]] = await pool.query(
    'SELECT DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 5 DAY) AS recentDay',
  );
  const day = toDateString(recentDay);
  await insertNEvents(20, {
    eventName: 'listing_impression',
    day,
    listingId: listingA,
    partnerId: partnerAId,
    placement: 'home_featured',
  });
  await insertNEvents(11, {
    eventName: 'listing_viewed',
    day,
    listingId: listingA,
    partnerId: partnerAId,
    anonymousVisitorId: uuid(),
  });
  await insertNEvents(9, {
    eventName: 'listing_impression',
    day,
    listingId: listingB,
    partnerId: partnerBId,
    placement: 'home_featured',
  });
  await insertNEvents(7, {
    eventName: 'listing_viewed',
    day,
    listingId: listingB,
    partnerId: partnerBId,
    anonymousVisitorId: uuid(),
  });

  // Distinct company metrics per partner.
  await insertNEvents(5, {
    eventName: 'company_profile_view',
    day,
    partnerId: partnerAId,
  });
  await insertNEvents(2, {
    eventName: 'company_profile_view',
    day,
    partnerId: partnerBId,
  });
  await insertNEvents(3, {
    eventName: 'contact_click',
    day,
    partnerId: partnerAId,
  });
  await insertNEvents(1, {
    eventName: 'contact_click',
    day,
    partnerId: partnerBId,
  });

  // Distinct promotion metrics per partner.
  await insertNEvents(40, {
    eventName: 'promotion_impression',
    day,
    listingId: listingA,
    partnerId: partnerAId,
    promotionId: promotionA,
  });
  await insertNEvents(6, {
    eventName: 'promotion_clicked',
    day,
    listingId: listingA,
    partnerId: partnerAId,
    promotionId: promotionA,
  });
  await insertNEvents(15, {
    eventName: 'promotion_impression',
    day,
    listingId: listingB,
    partnerId: partnerBId,
    promotionId: promotionB,
  });
  await insertNEvents(2, {
    eventName: 'promotion_clicked',
    day,
    listingId: listingB,
    partnerId: partnerBId,
    promotionId: promotionB,
  });

  const { EngagementAnalyticsAggregationService } =
    await import('../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js');
  const { MySqlEngagementAnalyticsAggregationRepository } =
    await import('../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js');
  const aggregationService = new EngagementAnalyticsAggregationService({
    engagementAnalyticsAggregationRepository:
      new MySqlEngagementAnalyticsAggregationRepository(pool),
  });
  await aggregationService.aggregateDay(day);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
});

describe('Same user, same token — overview per workspace (brief §5/§6)', () => {
  test('Partner A workspace returns only Partner A metrics', async () => {
    const res = await getOverview(partnerAId, '&range=90');
    expect(res.status).toBe(200);
    expect(res.body.data.listing_impressions).toBe(20);
    expect(res.body.data.listing_views).toBe(11);
    expect(res.body.data.company_profile_views).toBe(5);
    expect(res.body.data.contact_clicks).toBe(3);
    expect(res.body.data.promotion_impressions).toBe(40);
    expect(res.body.data.promotion_clicks).toBe(6);
  });

  test('the SAME token, Partner B workspace, returns only Partner B metrics — no contribution from A', async () => {
    const res = await getOverview(partnerBId, '&range=90');
    expect(res.status).toBe(200);
    expect(res.body.data.listing_impressions).toBe(9);
    expect(res.body.data.listing_views).toBe(7);
    expect(res.body.data.company_profile_views).toBe(2);
    expect(res.body.data.contact_clicks).toBe(1);
    expect(res.body.data.promotion_impressions).toBe(15);
    expect(res.body.data.promotion_clicks).toBe(2);

    // Explicitly prove no merge: never A's numbers, never A+B summed.
    expect(res.body.data.listing_impressions).not.toBe(20);
    expect(res.body.data.listing_impressions).not.toBe(29); // 20 + 9
  });
});

describe('Same user, same token — listings workspace isolation (brief §7)', () => {
  test('Partner A workspace listings contains only listingA; Partner B workspace contains only listingB', async () => {
    const resA = await getListings(partnerAId, '&range=90&limit=100');
    expect(resA.status).toBe(200);
    const idsA = resA.body.data.map((row) => row.listing_id);
    expect(idsA).toContain(listingA);
    expect(idsA).not.toContain(listingB);

    const resB = await getListings(partnerBId, '&range=90&limit=100');
    expect(resB.status).toBe(200);
    const idsB = resB.body.data.map((row) => row.listing_id);
    expect(idsB).toContain(listingB);
    expect(idsB).not.toContain(listingA);
  });

  test('listing detail: A+A allowed, B+B allowed, B+A blocked, A+B blocked', async () => {
    const resAA = await getListingDetail(partnerAId, listingA, '&range=90');
    expect(resAA.status).toBe(200);
    expect(resAA.body.data.listing_id).toBe(listingA);

    const resBB = await getListingDetail(partnerBId, listingB, '&range=90');
    expect(resBB.status).toBe(200);
    expect(resBB.body.data.listing_id).toBe(listingB);

    const resBA = await getListingDetail(partnerAId, listingB, '&range=90');
    expect(resBA.status).toBe(404);

    const resAB = await getListingDetail(partnerBId, listingA, '&range=90');
    expect(resAB.status).toBe(404);
  });
});

describe('Same user, same token — promotion workspace isolation (brief §8)', () => {
  test('promotion detail: A+A allowed, B+B allowed, crossed combinations blocked', async () => {
    const resAA = await getPromotionDetail(partnerAId, promotionA, '&range=90');
    expect(resAA.status).toBe(200);
    expect(resAA.body.data.promotion_id).toBe(promotionA);
    expect(resAA.body.data.impressions).toBe(40);
    expect(resAA.body.data.clicks).toBe(6);

    const resBB = await getPromotionDetail(partnerBId, promotionB, '&range=90');
    expect(resBB.status).toBe(200);
    expect(resBB.body.data.promotion_id).toBe(promotionB);
    expect(resBB.body.data.impressions).toBe(15);
    expect(resBB.body.data.clicks).toBe(2);

    const resBA = await getPromotionDetail(partnerAId, promotionB, '&range=90');
    expect(resBA.status).toBe(404);

    const resAB = await getPromotionDetail(partnerBId, promotionA, '&range=90');
    expect(resAB.status).toBe(404);
  });
});

describe('Per-membership permission scoping (brief §9/§10/§11)', () => {
  test('Partner C (same user, EDITOR — no VIEW_ANALYTICS) is blocked with 403, proving VIEW_ANALYTICS is not globally granted', async () => {
    const res = await getOverview(partnerCId, '&range=90');
    expect(res.status).toBe(403);
  });

  test('Partner D (same user, NO membership row at all — distinct from Partner C, which HAS an active row that merely lacks the capability) is blocked with exactly 403', async () => {
    // Verified directly against the fixture data: zero partner_employees
    // rows exist for (sharedUser, partnerD) — Partner D is owned by a
    // completely different user, and sharedUser was never added to it.
    const [membershipRows] = await pool.query(
      'SELECT * FROM partner_employees WHERE user_id = ? AND partner_id = ?',
      [sharedUser.userId, partnerDId],
    );
    expect(membershipRows).toHaveLength(0);

    // `#assertAnalyticsAccess` has exactly one throw path for both "no
    // membership row" and "membership exists but role lacks the
    // capability" — `getPartnerEmployeeRoleCode` returns `null` here
    // (vs. `'EDITOR'` for Partner C), and `roleHasCapability(null, ...)`
    // returns `false` via its own `if (!roleCode) return false` guard,
    // falling through to the identical `AuthorizationError` (403) — this
    // codebase's established anti-enumeration convention never
    // distinguishes "not a member" from "a member without permission"
    // by status code.
    const res = await getOverview(partnerDId, '&range=90');
    expect(res.status).toBe(403);
  });

  test('changing partnerId on consecutive requests with the identical token always re-authorizes fresh — A succeeds, D fails, A succeeds again', async () => {
    const first = await getOverview(partnerAId, '&range=90');
    expect(first.status).toBe(200);
    const second = await getOverview(partnerDId, '&range=90');
    expect(second.status).toBe(403);
    const third = await getOverview(partnerAId, '&range=90');
    expect(third.status).toBe(200);
    expect(third.body.data.listing_impressions).toBe(20);
  });
});

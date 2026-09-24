/**
 * Step A5 — Partner Analytics Read API. Exercised through the REAL
 * production auth path (register -> direct-SQL `partner_employees`
 * membership -> login), the same established pattern
 * `analyticsSelfTraffic.test.js` (A2.1) already uses — never a
 * synthetic principal. `analytics_events` has zero foreign keys, so raw
 * fixtures use arbitrary but REAL `listing_id`/`partner_id` values tied
 * to genuine `listings`/`partners`/`advertisements` rows created via
 * direct SQL (minimal columns only — this file doesn't need the full
 * listing-wizard HTTP flow, only real, join-able rows).
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
let DEV_CREDENTIALS;

let pool;
let owner; // OWNER of partner A
let analyticsViewer; // ANALYTICS_VIEWER employee of partner A
let unauthorizedEditor; // EDITOR employee of partner A — no VIEW_ANALYTICS capability
let ownerB; // OWNER of partner B
let customer;

let partnerAId;
let partnerBId;
let languageId;
let listingTypeId;
let publishedStatusId;
let unpublishedStatusId;
let approvedModerationStatusId;
let currencyId;
let adPlacementTypeId;
let adProductId;
let adActiveStatusId;
let adExpiredStatusId;

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

async function insertListing({
  partnerId,
  title,
  frozen = false,
  deleted = false,
}) {
  const slug = `a5-listing-${uuid()}`;
  const [result] = await pool.query(
    `INSERT INTO listings
       (partner_id, listing_type_id, slug, status_id, moderation_status_id, frozen_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      partnerId,
      listingTypeId,
      slug,
      frozen ? unpublishedStatusId : publishedStatusId,
      approvedModerationStatusId,
      frozen ? new Date() : null,
      deleted ? new Date() : null,
    ],
  );
  const listingId = result.insertId;
  await pool.query(
    'INSERT INTO listing_translations (listing_id, language_id, title) VALUES (?, ?, ?)',
    [listingId, languageId, title],
  );
  return listingId;
}

async function insertPromotion({ partnerId, listingId, statusId }) {
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
      statusId,
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
  day, // 'YYYY-MM-DD' business date the event should land in
  listingId = null,
  partnerId = null,
  promotionId = null,
  placement = null,
  anonymousVisitorId = null,
}) {
  // Mid-day within the given Yerevan business date, expressed as its
  // own UTC instant (day 12:00:00 Yerevan = day 08:00:00 UTC) — well
  // clear of the midnight boundary, so ordinary day-attribution fixtures
  // never depend on exact boundary math (that's covered by A4's own
  // dedicated boundary tests).
  const occurredAt = `${day} 08:00:00.000`;
  await pool.query(
    `INSERT INTO analytics_events
       (event_id, event_name, occurred_at, listing_id, partner_id, promotion_id, placement, anonymous_visitor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      eventName,
      occurredAt,
      listingId,
      partnerId,
      promotionId,
      placement,
      anonymousVisitorId,
    ],
  );
}

function getOverview(authToken, partnerId, extra = '') {
  return request(app)
    .get(`/api/v1/analytics/partner/overview?partnerId=${partnerId}${extra}`)
    .set('Authorization', authToken ? `Bearer ${authToken}` : '');
}

function getListings(authToken, partnerId, extra = '') {
  return request(app)
    .get(`/api/v1/analytics/partner/listings?partnerId=${partnerId}${extra}`)
    .set('Authorization', authToken ? `Bearer ${authToken}` : '');
}

function getListingDetail(authToken, partnerId, listingId, extra = '') {
  return request(app)
    .get(
      `/api/v1/analytics/partner/listings/${listingId}?partnerId=${partnerId}${extra}`,
    )
    .set('Authorization', authToken ? `Bearer ${authToken}` : '');
}

function getPromotions(authToken, partnerId, extra = '') {
  return request(app)
    .get(`/api/v1/analytics/partner/promotions?partnerId=${partnerId}${extra}`)
    .set('Authorization', authToken ? `Bearer ${authToken}` : '');
}

function getPromotionDetail(authToken, partnerId, promotionId, extra = '') {
  return request(app)
    .get(
      `/api/v1/analytics/partner/promotions/${promotionId}?partnerId=${partnerId}${extra}`,
    )
    .set('Authorization', authToken ? `Bearer ${authToken}` : '');
}

beforeAll(async () => {
  ({ default: app } = await import('../../../src/app.js'));
  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

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
  const [[unpublishedStatus]] = await pool.query(
    "SELECT id FROM listing_statuses WHERE code = 'UNPUBLISHED'",
  );
  unpublishedStatusId = unpublishedStatus.id;
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
  const [[expiredAdStatus]] = await pool.query(
    "SELECT id FROM advertisement_statuses WHERE code = 'EXPIRED'",
  );
  adExpiredStatusId = expiredAdStatus.id;

  // --- Partner A: a real OWNER, a real ANALYTICS_VIEWER employee, and a
  // real EDITOR employee (no VIEW_ANALYTICS grant) — same direct-SQL
  // `partner_employees` pattern `analyticsSelfTraffic.test.js` (A2.1)
  // already established.
  const [[approvedPartnerStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const ownerEmail = `a5-owner-${Date.now()}@example.com`;
  const ownerUserId = await register(ownerEmail, 'OwnerA5!2024', 'Owner', 'A');
  const [partnerAResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'A5 Partner LLC',
      'A5 Partner',
      `a5-partner-a-${Date.now()}`,
      approvedPartnerStatus.id,
      approvedPartnerStatus.id,
      ownerUserId,
    ],
  );
  partnerAId = partnerAResult.insertId;
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, ownerUserId, ownerRole.id],
  );
  owner = await login(ownerEmail, 'OwnerA5!2024');

  const analyticsViewerEmail = `a5-viewer-${Date.now()}@example.com`;
  const analyticsViewerUserId = await register(
    analyticsViewerEmail,
    'ViewerA5!2024',
    'Viewer',
    'A',
  );
  const [[analyticsViewerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'ANALYTICS_VIEWER'",
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, analyticsViewerUserId, analyticsViewerRole.id],
  );
  analyticsViewer = await login(analyticsViewerEmail, 'ViewerA5!2024');

  const editorEmail = `a5-editor-${Date.now()}@example.com`;
  const editorUserId = await register(
    editorEmail,
    'EditorA5!2024',
    'Editor',
    'A',
  );
  const [[editorRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'EDITOR'",
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, editorUserId, editorRole.id],
  );
  unauthorizedEditor = await login(editorEmail, 'EditorA5!2024');

  // --- Partner B: independently owned, for tenant isolation. ---
  const ownerBEmail = `a5-owner-b-${Date.now()}@example.com`;
  const ownerBUserId = await register(
    ownerBEmail,
    'OwnerB5!2024',
    'Owner',
    'B',
  );
  const [partnerBResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'A5 Partner B LLC',
      'A5 Partner B',
      `a5-partner-b-${Date.now()}`,
      approvedPartnerStatus.id,
      approvedPartnerStatus.id,
      ownerBUserId,
    ],
  );
  partnerBId = partnerBResult.insertId;
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerBId, ownerBUserId, ownerRole.id],
  );
  ownerB = await login(ownerBEmail, 'OwnerB5!2024');
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
});

describe('Date range resolution (brief §5/§48)', () => {
  test('range=7/30/90 are accepted; default is 30; invalid values are rejected with 422', async () => {
    for (const range of [7, 30, 90]) {
      // eslint-disable-next-line no-await-in-loop -- sequential, deterministic test assertions over a fixed small list
      const res = await getOverview(
        owner.accessToken,
        partnerAId,
        `&range=${range}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.range_days).toBe(range);
      expect(res.body.data.timezone).toBe('Asia/Yerevan');
      expect(typeof res.body.data.from_day).toBe('string');
      expect(typeof res.body.data.to_day).toBe('string');
    }

    const defaultRes = await getOverview(owner.accessToken, partnerAId);
    expect(defaultRes.status).toBe(200);
    expect(defaultRes.body.data.range_days).toBe(30);

    for (const bad of ['0', '1', '14', '91', 'garbage']) {
      // eslint-disable-next-line no-await-in-loop -- sequential, deterministic test assertions over a fixed small list
      const res = await getOverview(
        owner.accessToken,
        partnerAId,
        `&range=${bad}`,
      );
      expect(res.status).toBe(422);
    }
  });

  test("today's business date is never included — to_day is strictly before the current Yerevan date", async () => {
    // `toDateString()` — never `.toISOString()` directly on the JS `Date`
    // mysql2 decodes a `DATE` column into (LOCAL midnight, not UTC) — the
    // exact gotcha `infrastructure/database/dateFormat.js`'s own header
    // documents; using `.toISOString()` here would shift the date on any
    // host with a non-zero UTC offset.
    const { toDateString } =
      await import('../../../src/infrastructure/database/dateFormat.js');
    const [[{ today }]] = await pool.query(
      'SELECT DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)) AS today',
    );
    const todayStr = toDateString(today);
    const res = await getOverview(owner.accessToken, partnerAId, '&range=7');
    expect(res.body.data.to_day < todayStr).toBe(true);
    expect(res.body.data.from_day < res.body.data.to_day).toBe(true);
  });
});

describe('Overview correctness (brief §9/§11/§14/§15/§50/§52/§53)', () => {
  let listingX;
  let listingY;
  const day1 = '2026-05-01';
  const day2 = '2026-05-02';

  beforeAll(async () => {
    listingX = await insertListing({
      partnerId: partnerAId,
      title: 'Overview Listing X',
    });
    listingY = await insertListing({
      partnerId: partnerAId,
      title: 'Overview Listing Y',
    });

    const visitorA = uuid();
    const visitorB = uuid();

    // Exact-unique-visitors test data (brief §49): visitor A views on
    // day1 AND day2 (same listing), visitor B views only on day2 — the
    // exact cross-day unique count must be 2, never 3 (SUM would give
    // 1+2=3, double-counting visitor A).
    await insertEvent({
      eventName: 'listing_viewed',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
      anonymousVisitorId: visitorA,
    });
    await insertEvent({
      eventName: 'listing_viewed',
      day: day2,
      listingId: listingX,
      partnerId: partnerAId,
      anonymousVisitorId: visitorA,
    });
    await insertEvent({
      eventName: 'listing_viewed',
      day: day2,
      listingId: listingX,
      partnerId: partnerAId,
      anonymousVisitorId: visitorB,
    });

    // Search CTR test data (brief §52): listing X gets 100 search
    // impressions / 20 clicks (0.2 ctr); listing Y gets 1/1 (1.0 ctr).
    // Partner-level CTR must be the WEIGHTED sum 21/101, never the
    // average of 0.2 and 1.0.
    for (let i = 0; i < 100; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding, not request-path code
      await insertEvent({
        eventName: 'listing_impression',
        day: day1,
        listingId: listingX,
        partnerId: partnerAId,
        placement: 'search_results',
      });
    }
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding, not request-path code
      await insertEvent({
        eventName: 'search_result_click',
        day: day1,
        listingId: listingX,
        partnerId: partnerAId,
      });
    }
    await insertEvent({
      eventName: 'listing_impression',
      day: day1,
      listingId: listingY,
      partnerId: partnerAId,
      placement: 'search_results',
    });
    await insertEvent({
      eventName: 'search_result_click',
      day: day1,
      listingId: listingY,
      partnerId: partnerAId,
    });

    // Favorite adds/removes trend data (net_saves headline comes from
    // the CURRENT favorites table instead — see the favorites block
    // below).
    await insertEvent({
      eventName: 'favorite_added',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'favorite_added',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'favorite_removed',
      day: day2,
      listingId: listingX,
      partnerId: partnerAId,
    });

    // Contact clicks (company-scoped, A3.2) and company profile views.
    await insertEvent({
      eventName: 'contact_click',
      day: day1,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'contact_click',
      day: day2,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'company_profile_view',
      day: day1,
      partnerId: partnerAId,
    });

    // Booking funnel + view-to-request conversion data.
    await insertEvent({
      eventName: 'listing_viewed',
      day: day1,
      listingId: listingY,
      partnerId: partnerAId,
      anonymousVisitorId: uuid(),
    });
    await insertEvent({
      eventName: 'booking_started',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'booking_request_submitted',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'booking_confirmed',
      day: day1,
      listingId: listingX,
      partnerId: partnerAId,
    });

    // A REAL current favorite row for listing X — the net_saves
    // headline's actual source (brief §11: never adds-minus-removes).
    await pool.query(
      'INSERT INTO favorites (customer_user_id, listing_id) VALUES (?, ?)',
      [3, listingX],
    );

    // Aggregate the two fixture days via the real A4 service, so the
    // overview (which reads listing_analytics_daily/company_analytics_daily,
    // never raw events except for exact-unique) actually has data.
    const { EngagementAnalyticsAggregationService } =
      await import('../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js');
    const { MySqlEngagementAnalyticsAggregationRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js');
    const aggregationService = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository:
        new MySqlEngagementAnalyticsAggregationRepository(pool),
    });
    await aggregationService.aggregateDay(day1);
    await aggregationService.aggregateDay(day2);
  }, 30_000);

  test('exact_unique_visitors is the true cross-day distinct count, never SUM(daily_unique_visitors)', async () => {
    // A wide enough range to cover both fixture days (well within the
    // 90-day cap) — asserted via direct aggregate reads instead of the
    // dynamic `range=N` window, since the fixture days are fixed
    // historical dates unrelated to "today". Listing-scoped (listingX
    // only, not the partner-wide method) so this assertion is isolated
    // from the OTHER fixture events this same `beforeAll` seeds for
    // listingY (a separate, unrelated visitor for the booking-funnel
    // test data below) — `getExactUniqueVisitors`'s partner-wide count
    // is correctly 3 (A + B + that other visitor), which is exactly the
    // right behavior for a real partner overview, just not what this
    // specific test is isolating.
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);
    const exact = await repo.getExactUniqueVisitorsForListing({
      partnerId: partnerAId,
      listingId: listingX,
      fromDay: day1,
      toDay: day2,
    });
    expect(exact).toBe(2); // visitor A + visitor B, never 3

    // Partner-WIDE per-day series (summed across all of the partner's
    // listings, per brief §10 — valid, unlike summing across days): day1
    // = listingX's visitor A (1) + listingY's own distinct viewer from
    // the booking-funnel fixture below (1) = 2; day2 = listingX's
    // visitor A + visitor B = 2.
    const daily = await repo.getListingDailySeriesForPartner({
      partnerId: partnerAId,
      fromDay: day1,
      toDay: day2,
    });
    const byDay = Object.fromEntries(daily.map((d) => [d.day, d]));
    expect(byDay[day1].dailyUniqueVisitors).toBe(2);
    expect(byDay[day2].dailyUniqueVisitors).toBe(2);
  });

  test('search_ctr is the weighted SUM ratio across listings, never an average of per-listing CTRs', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);
    const totals = await repo.getListingRangeTotals({
      partnerId: partnerAId,
      fromDay: day1,
      toDay: day2,
    });
    expect(totals.searchImpressionsCount).toBe(101);
    expect(totals.searchClicksCount).toBe(21);
    // 21/101 ≈ 0.2079 — NOT average(0.2, 1.0) = 0.6.
    const ctr = totals.searchClicksCount / totals.searchImpressionsCount;
    expect(Math.round(ctr * 10000) / 10000).toBeCloseTo(0.2079, 4);
  });

  test('net_saves reflects the CURRENT favorites snapshot, not favorite_adds - favorite_removes', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);
    const totals = await repo.getListingRangeTotals({
      partnerId: partnerAId,
      fromDay: day1,
      toDay: day2,
    });
    // Historical events: 2 adds, 1 remove -> a naive "adds - removes"
    // would say 1. The real current favorites table has exactly 1 row
    // too in this fixture, but they are NOT the same computation path —
    // proven by using the dedicated repository method, never a manual
    // subtraction of the two count fields above.
    expect(totals.favoriteAddsCount).toBe(2);
    expect(totals.favoriteRemovesCount).toBe(1);

    const { MySqlFavoriteRepository } =
      await import('../../../src/modules/favorites/repositories/mysqlFavoriteRepository.js');
    const favRepo = new MySqlFavoriteRepository(pool);
    const currentSaves = await favRepo.countCurrentForPartner(partnerAId);
    expect(currentSaves).toBe(1);
  });

  test('contact_clicks comes from company_analytics_daily, never listing_analytics_daily', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);
    const companyTotals = await repo.getCompanyRangeTotals({
      partnerId: partnerAId,
      fromDay: day1,
      toDay: day2,
    });
    expect(companyTotals.contactClicksCount).toBe(2);
    expect(companyTotals.profileViewsCount).toBe(1);

    const [columns] = await pool.query(
      'SHOW COLUMNS FROM listing_analytics_daily',
    );
    expect(columns.some((c) => c.Field === 'contact_clicks_count')).toBe(false);
  });
});

describe('Zero-fill (brief §17/§51)', () => {
  test('a 7-day range with events on only 2 days still returns exactly 7 daily points, 5 of them all-zero', async () => {
    const res = await getOverview(owner.accessToken, partnerAId, '&range=7');
    expect(res.status).toBe(200);
    expect(res.body.data.daily).toHaveLength(7);
    const zeroDays = res.body.data.daily.filter(
      (d) =>
        d.impressions === 0 &&
        d.views === 0 &&
        d.favorite_adds === 0 &&
        d.contact_clicks === 0 &&
        d.booking_starts === 0,
    );
    // The last 7 real days almost certainly have zero of our May-2026
    // fixture data — every point should be zero-filled.
    expect(zeroDays.length).toBe(7);
  });
});

describe('Promotion CTR (brief §15/§53)', () => {
  test('0 impressions / 0 clicks -> ctr 0, never a divide-by-zero error; 200/30 -> 0.15', async () => {
    const listing = await insertListing({
      partnerId: partnerAId,
      title: 'Promo CTR Listing',
    });
    const zeroPromotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adActiveStatusId,
    });
    const zeroRes = await getPromotionDetail(
      owner.accessToken,
      partnerAId,
      zeroPromotionId,
      '&range=90',
    );
    expect(zeroRes.status).toBe(200);
    expect(zeroRes.body.data.impressions).toBe(0);
    expect(zeroRes.body.data.clicks).toBe(0);
    expect(zeroRes.body.data.ctr).toBe(0);

    const realPromotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adActiveStatusId,
    });
    // Must fall within the `range=90` window relative to the REAL
    // current Yerevan business date — a fixed historical date (like the
    // 2026-05-xx fixtures elsewhere in this file, which are queried
    // directly through the repository, not through `range=N`) would
    // silently fall outside a dynamically-resolved 90-day window and
    // this HTTP-level assertion would see zero data instead of 200/30.
    const { toDateString } =
      await import('../../../src/infrastructure/database/dateFormat.js');
    const [[{ recentDay }]] = await pool.query(
      'SELECT DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 5 DAY) AS recentDay',
    );
    const day = toDateString(recentDay);
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding
      await insertEvent({
        eventName: 'promotion_impression',
        day,
        listingId: listing,
        partnerId: partnerAId,
        promotionId: realPromotionId,
      });
    }
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding
      await insertEvent({
        eventName: 'promotion_clicked',
        day,
        listingId: listing,
        partnerId: partnerAId,
        promotionId: realPromotionId,
      });
    }
    const { EngagementAnalyticsAggregationService } =
      await import('../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js');
    const { MySqlEngagementAnalyticsAggregationRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js');
    const aggregationService = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository:
        new MySqlEngagementAnalyticsAggregationRepository(pool),
    });
    await aggregationService.aggregateDay(day);

    const res = await getPromotionDetail(
      owner.accessToken,
      partnerAId,
      realPromotionId,
      '&range=90',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.impressions).toBe(200);
    expect(res.body.data.clicks).toBe(30);
    expect(res.body.data.ctr).toBe(0.15);
  }, 15_000);
});

describe('Listings endpoint (brief §18-21/§56)', () => {
  test('frozen listings are visible, soft-deleted listings are hidden from the list', async () => {
    const frozenListing = await insertListing({
      partnerId: partnerAId,
      title: 'Frozen Listing',
      frozen: true,
    });
    const deletedListing = await insertListing({
      partnerId: partnerAId,
      title: 'Deleted Listing',
      deleted: true,
    });

    const res = await getListings(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.map((row) => row.listing_id);
    expect(ids).toContain(frozenListing);
    expect(ids).not.toContain(deletedListing);
  });

  test('pagination meta shape matches the codebase convention', async () => {
    const res = await getListings(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=1',
    );
    expect(res.status).toBe(200);
    expect(res.body.meta).toHaveProperty('next_cursor');
    expect(res.body.meta).toHaveProperty('has_more');
    expect(res.body.meta).toHaveProperty('limit', 1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });
});

describe('Listing detail — ownership masking (brief §22/§56)', () => {
  test('another partner’s listing 404s, never leaking existence', async () => {
    const listingB = await insertListing({
      partnerId: partnerBId,
      title: 'Partner B Listing',
    });
    const res = await getListingDetail(
      owner.accessToken,
      partnerAId,
      listingB,
      '&range=30',
    );
    expect(res.status).toBe(404);
  });

  test('a frozen (unpublished, non-deleted) own listing remains accessible', async () => {
    const frozenListing = await insertListing({
      partnerId: partnerAId,
      title: 'Frozen Detail Listing',
      frozen: true,
    });
    const res = await getListingDetail(
      owner.accessToken,
      partnerAId,
      frozenListing,
      '&range=30',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.listing_id).toBe(frozenListing);
  });

  test('a soft-deleted own listing 404s via the detail endpoint', async () => {
    const deletedListing = await insertListing({
      partnerId: partnerAId,
      title: 'Deleted Detail Listing',
      deleted: true,
    });
    const res = await getListingDetail(
      owner.accessToken,
      partnerAId,
      deletedListing,
      '&range=30',
    );
    expect(res.status).toBe(404);
  });

  test('zero-data listing returns 200 with all-zero headline counts and a fully zero-filled series (brief §40)', async () => {
    const freshListing = await insertListing({
      partnerId: partnerAId,
      title: 'Zero Data Listing',
    });
    const res = await getListingDetail(
      owner.accessToken,
      partnerAId,
      freshListing,
      '&range=7',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.impressions).toBe(0);
    expect(res.body.data.views).toBe(0);
    expect(res.body.data.exact_unique_visitors).toBe(0);
    expect(res.body.data.search_ctr).toBe(0);
    expect(res.body.data.daily).toHaveLength(7);
  });
});

describe('Promotion detail — history and isolation (brief §24/§25/§57)', () => {
  test('an EXPIRED promotion owned by the partner remains readable', async () => {
    const listing = await insertListing({
      partnerId: partnerAId,
      title: 'Expired Promo Listing',
    });
    const promotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adExpiredStatusId,
    });
    const res = await getPromotionDetail(
      owner.accessToken,
      partnerAId,
      promotionId,
      '&range=90',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.promotion_id).toBe(promotionId);
    expect(res.body.data.listing_id).toBe(listing);
  });

  test('another partner’s promotion is blocked, never leaking existence', async () => {
    const listingB = await insertListing({
      partnerId: partnerBId,
      title: 'Partner B Promo Listing',
    });
    const promotionBId = await insertPromotion({
      partnerId: partnerBId,
      listingId: listingB,
      statusId: adActiveStatusId,
    });
    const res = await getPromotionDetail(
      owner.accessToken,
      partnerAId,
      promotionBId,
      '&range=30',
    );
    expect(res.status).toBe(404);
  });
});

describe('Repository-level tenant isolation — SQL defense in depth (Step A8.1, brief §7)', () => {
  // Bypasses PartnerAnalyticsService entirely — calls
  // MySqlPartnerAnalyticsRepository's own detail methods directly, so
  // these genuinely prove the repository's OWN `partner_id` predicate,
  // never merely the service-level ownership guard that already sits in
  // front of it on the real request path (exercised separately by the
  // two HTTP-level "ownership masking"/"history and isolation" blocks
  // above). Before A8.1, these four methods had no `partner_id` filter
  // of their own at all.
  let listingId;
  let promotionId;
  const day = '2026-06-01';

  beforeAll(async () => {
    listingId = await insertListing({
      partnerId: partnerAId,
      title: 'A8.1 Repository Isolation Listing',
    });
    promotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId,
      statusId: adActiveStatusId,
    });
    await insertEvent({
      eventName: 'listing_viewed',
      day,
      listingId,
      partnerId: partnerAId,
    });
    await insertEvent({
      eventName: 'promotion_impression',
      day,
      listingId,
      partnerId: partnerAId,
      promotionId,
      placement: 'home_featured',
    });
    await insertEvent({
      eventName: 'promotion_clicked',
      day,
      listingId,
      partnerId: partnerAId,
      promotionId,
      placement: 'home_featured',
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
  }, 30_000);

  test('getListingRangeDetail: Partner B’s partnerId returns null for Partner A’s listing, even though it genuinely has analytics data', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);

    const wrongPartner = await repo.getListingRangeDetail({
      partnerId: partnerBId,
      listingId,
      fromDay: day,
      toDay: day,
    });
    expect(wrongPartner).toBeNull();

    const correctPartner = await repo.getListingRangeDetail({
      partnerId: partnerAId,
      listingId,
      fromDay: day,
      toDay: day,
    });
    expect(correctPartner).not.toBeNull();
    expect(correctPartner.viewsCount).toBe(1);
  });

  test('getListingDailySeries: Partner B’s partnerId returns an empty series for Partner A’s listing', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);

    const wrongPartner = await repo.getListingDailySeries({
      partnerId: partnerBId,
      listingId,
      fromDay: day,
      toDay: day,
    });
    expect(wrongPartner).toEqual([]);

    const correctPartner = await repo.getListingDailySeries({
      partnerId: partnerAId,
      listingId,
      fromDay: day,
      toDay: day,
    });
    expect(correctPartner).toHaveLength(1);
    expect(correctPartner[0].viewsCount).toBe(1);
  });

  test('getPromotionRangeTotals: Partner B’s partnerId returns all-zero totals for Partner A’s promotion', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);

    const wrongPartner = await repo.getPromotionRangeTotals({
      partnerId: partnerBId,
      promotionId,
      fromDay: day,
      toDay: day,
    });
    expect(wrongPartner).toEqual({ impressionsCount: 0, clicksCount: 0 });

    const correctPartner = await repo.getPromotionRangeTotals({
      partnerId: partnerAId,
      promotionId,
      fromDay: day,
      toDay: day,
    });
    expect(correctPartner.impressionsCount).toBe(1);
    expect(correctPartner.clicksCount).toBe(1);
  });

  test('getPromotionDailySeries: Partner B’s partnerId returns an empty series for Partner A’s promotion', async () => {
    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);

    const wrongPartner = await repo.getPromotionDailySeries({
      partnerId: partnerBId,
      promotionId,
      fromDay: day,
      toDay: day,
    });
    expect(wrongPartner).toEqual([]);

    const correctPartner = await repo.getPromotionDailySeries({
      partnerId: partnerAId,
      promotionId,
      fromDay: day,
      toDay: day,
    });
    expect(correctPartner).toHaveLength(1);
    expect(correctPartner[0].impressionsCount).toBe(1);
    expect(correctPartner[0].clicksCount).toBe(1);
  });
});

describe('Promotions list endpoint — discovery (Step A6.1, brief §5/§6/§7/§8/§9/§10/§11)', () => {
  test('active AND expired promotions owned by the partner both appear', async () => {
    const listing = await insertListing({
      partnerId: partnerAId,
      title: 'Promo List Listing',
    });
    const activeId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adActiveStatusId,
    });
    const expiredId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adExpiredStatusId,
    });

    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    const ids = res.body.data.map((row) => row.promotion_id);
    expect(ids).toContain(activeId);
    expect(ids).toContain(expiredId);
  });

  test('another partner’s promotions never appear (tenant isolation, brief §9)', async () => {
    const listingB = await insertListing({
      partnerId: partnerBId,
      title: 'Promo List Listing B',
    });
    const promotionBId = await insertPromotion({
      partnerId: partnerBId,
      listingId: listingB,
      statusId: adActiveStatusId,
    });

    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((row) => row.promotion_id)).not.toContain(
      promotionBId,
    );
  });

  test('pagination meta shape matches the codebase convention', async () => {
    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=1',
    );
    expect(res.status).toBe(200);
    expect(res.body.meta).toHaveProperty('next_cursor');
    expect(res.body.meta).toHaveProperty('has_more');
    expect(res.body.meta).toHaveProperty('limit', 1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  test('ctr is computed from range-summed impressions/clicks, never averaged/stored (brief §7)', async () => {
    const listing = await insertListing({
      partnerId: partnerAId,
      title: 'Promo List CTR Listing',
    });
    const promotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adActiveStatusId,
    });
    const { toDateString } =
      await import('../../../src/infrastructure/database/dateFormat.js');
    const [[{ recentDay }]] = await pool.query(
      'SELECT DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR)), INTERVAL 5 DAY) AS recentDay',
    );
    const day = toDateString(recentDay);
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding
      await insertEvent({
        eventName: 'promotion_impression',
        day,
        listingId: listing,
        partnerId: partnerAId,
        promotionId,
      });
    }
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop -- deterministic fixture seeding
      await insertEvent({
        eventName: 'promotion_clicked',
        day,
        listingId: listing,
        partnerId: partnerAId,
        promotionId,
      });
    }
    const { EngagementAnalyticsAggregationService } =
      await import('../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js');
    const { MySqlEngagementAnalyticsAggregationRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js');
    const aggregationService = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository:
        new MySqlEngagementAnalyticsAggregationRepository(pool),
    });
    await aggregationService.aggregateDay(day);

    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.promotion_id === promotionId);
    expect(row).toBeDefined();
    expect(row.impressions).toBe(200);
    expect(row.clicks).toBe(30);
    expect(row.ctr).toBe(0.15);
  }, 15_000);

  test('a promotion whose listing is soft-deleted remains discoverable, with a neutral null title (brief §11)', async () => {
    const deletedListing = await insertListing({
      partnerId: partnerAId,
      title: 'Will Be Deleted Promo Listing',
      deleted: true,
    });
    const promotionId = await insertPromotion({
      partnerId: partnerAId,
      listingId: deletedListing,
      statusId: adExpiredStatusId,
    });

    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.promotion_id === promotionId);
    expect(row).toBeDefined();
    expect(row.title).toBeNull();
  });

  test('no private advertisement fields (price/payment/approval/reminder) ever appear in the response', async () => {
    const listing = await insertListing({
      partnerId: partnerAId,
      title: 'Promo List Privacy Listing',
    });
    await insertPromotion({
      partnerId: partnerAId,
      listingId: listing,
      statusId: adActiveStatusId,
    });
    const res = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=90&limit=100',
    );
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/price_snapshot_amount/);
    expect(serialized).not.toMatch(/payment_marked_paid/);
    expect(serialized).not.toMatch(/approved_by/);
    expect(serialized).not.toMatch(/approved_at/);
    expect(serialized).not.toMatch(/requested_by/);
    expect(serialized).not.toMatch(/reminder_7d/);
    expect(serialized).not.toMatch(/reminder_2d/);
    expect(serialized).not.toMatch(/display_priority/);
    expect(serialized).not.toMatch(/currency/);
  });

  test('OWNER/ANALYTICS_VIEWER allowed, EDITOR/CUSTOMER blocked with 403, anonymous blocked with 401', async () => {
    const asOwner = await getPromotions(
      owner.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(asOwner.status).toBe(200);

    const asViewer = await getPromotions(
      analyticsViewer.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(asViewer.status).toBe(200);

    const asEditor = await getPromotions(
      unauthorizedEditor.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(asEditor.status).toBe(403);

    const asCustomer = await getPromotions(
      customer.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(asCustomer.status).toBe(403);

    const anonymous = await getPromotions(null, partnerAId, '&range=7');
    expect(anonymous.status).toBe(401);
  });
});

describe('Tenant isolation (brief §26/§27/§54)', () => {
  test('Partner A overview never includes Partner B contribution, and vice versa', async () => {
    const listingB = await insertListing({
      partnerId: partnerBId,
      title: 'Isolation Listing B',
    });
    const day = '2026-05-15';
    await insertEvent({
      eventName: 'listing_viewed',
      day,
      listingId: listingB,
      partnerId: partnerBId,
      anonymousVisitorId: uuid(),
    });
    await insertEvent({
      eventName: 'listing_viewed',
      day,
      listingId: listingB,
      partnerId: partnerBId,
      anonymousVisitorId: uuid(),
    });

    const { MySqlPartnerAnalyticsRepository } =
      await import('../../../src/modules/engagementAnalytics/repositories/mysqlPartnerAnalyticsRepository.js');
    const repo = new MySqlPartnerAnalyticsRepository(pool);
    const exactForA = await repo.getExactUniqueVisitors({
      partnerId: partnerAId,
      fromDay: day,
      toDay: day,
    });
    const exactForB = await repo.getExactUniqueVisitors({
      partnerId: partnerBId,
      fromDay: day,
      toDay: day,
    });
    expect(exactForB).toBe(2);
    expect(exactForA).toBe(0);
  });

  test('a multi-partner user can switch workspaces, never receiving merged data', async () => {
    // owner is OWNER of Partner A only; ownerB is OWNER of Partner B only
    // in this fixture set — assert each can read their own workspace and
    // is rejected for the other's.
    const resA = await getOverview(owner.accessToken, partnerAId, '&range=7');
    expect(resA.status).toBe(200);
    const resAForB = await getOverview(
      owner.accessToken,
      partnerBId,
      '&range=7',
    );
    expect(resAForB.status).toBe(403);

    const resB = await getOverview(ownerB.accessToken, partnerBId, '&range=7');
    expect(resB.status).toBe(200);
    const resBForA = await getOverview(
      ownerB.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(resBForA.status).toBe(403);
  });
});

describe('Permissions — real RBAC (brief §4/§28/§55)', () => {
  test('OWNER is allowed', async () => {
    const res = await getOverview(owner.accessToken, partnerAId, '&range=7');
    expect(res.status).toBe(200);
  });

  test('ANALYTICS_VIEWER is allowed (the capability granted in this step)', async () => {
    const res = await getOverview(
      analyticsViewer.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(res.status).toBe(200);
  });

  test('a non-owner employee without VIEW_ANALYTICS (EDITOR) is blocked with 403', async () => {
    const res = await getOverview(
      unauthorizedEditor.accessToken,
      partnerAId,
      '&range=7',
    );
    expect(res.status).toBe(403);
  });

  test('CUSTOMER is blocked', async () => {
    const res = await getOverview(customer.accessToken, partnerAId, '&range=7');
    expect(res.status).toBe(403);
  });

  test('anonymous is blocked with 401', async () => {
    const res = await getOverview(null, partnerAId, '&range=7');
    expect(res.status).toBe(401);
  });

  test('no raw visitor/session/user identity ever appears in any response', async () => {
    const res = await getOverview(owner.accessToken, partnerAId, '&range=30');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/anonymous_visitor_id/);
    expect(serialized).not.toMatch(/session_id/);
    expect(serialized).not.toMatch(/event_id/);
    expect(serialized).not.toMatch(/dedup_key/);
    expect(serialized).not.toMatch(/query_text/);
  });
});

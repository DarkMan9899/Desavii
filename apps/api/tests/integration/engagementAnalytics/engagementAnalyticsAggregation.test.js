/**
 * Step A4 — daily aggregation. `analytics_events` has zero foreign keys
 * (migration 0049's own design), so every fixture here inserts raw rows
 * directly with arbitrary integer `listing_id`/`partner_id`/
 * `promotion_id` values — no real listing/partner/promotion needs to
 * exist first, and no `seedAll()` is required (only `up()`, to ensure
 * the schema itself is present).
 *
 * Every `occurred_at` fixture is an explicit `'YYYY-MM-DD HH:MM:SS.mmm'`
 * string bound parameter, never a JS `Date` — `mysql2` sends a string
 * parameter to MySQL verbatim (no timezone reinterpretation), which is
 * the only way to plant an exact, unambiguous UTC instant for the
 * Yerevan-midnight boundary tests below without depending on the host
 * process's own timezone (brief §5/§32).
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { v4 as uuid } from 'uuid';
import { up } from '../../../src/infrastructure/database/migrate.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { MySqlEngagementAnalyticsAggregationRepository } from '../../../src/modules/engagementAnalytics/repositories/mysqlEngagementAnalyticsAggregationRepository.js';
import { EngagementAnalyticsAggregationService } from '../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js';

let pool;
let service;

// A fixed test business day, deliberately far from "today" so it never
// collides with the retention-purge test file's own fixtures/deletes.
const DAY = '2026-06-15';
// The exact half-open Yerevan-day boundary for DAY (brief §5): start =
// previous UTC date 20:00:00, end = DAY 20:00:00.
const DAY_START = '2026-06-14 20:00:00.000';
const DAY_END = '2026-06-15 20:00:00.000';
const JUST_BEFORE_END = '2026-06-15 19:59:59.999';
const JUST_AFTER_START = '2026-06-14 20:00:00.001';

function futureListingId() {
  return 900_000 + Math.floor(Math.random() * 90_000);
}
function futurePartnerId() {
  return 800_000 + Math.floor(Math.random() * 90_000);
}
function futurePromotionId() {
  return 700_000 + Math.floor(Math.random() * 90_000);
}

async function insertEvent({
  eventName,
  occurredAt,
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
      occurredAt,
      listingId,
      partnerId,
      promotionId,
      placement,
      anonymousVisitorId,
    ],
  );
}

async function getListingDaily(listingId, day = DAY) {
  const [[row]] = await pool.query(
    `SELECT * FROM listing_analytics_daily WHERE listing_id = ? AND day = ?`,
    [listingId, day],
  );
  return row ?? null;
}

async function getCompanyDaily(partnerId, day = DAY) {
  const [[row]] = await pool.query(
    `SELECT * FROM company_analytics_daily WHERE partner_id = ? AND day = ?`,
    [partnerId, day],
  );
  return row ?? null;
}

async function getPromotionDaily(promotionId, day = DAY) {
  const [[row]] = await pool.query(
    `SELECT * FROM promotion_analytics_daily WHERE promotion_id = ? AND day = ?`,
    [promotionId, day],
  );
  return row ?? null;
}

beforeAll(async () => {
  await up();
  pool = getMysqlPool();
  const engagementAnalyticsAggregationRepository =
    new MySqlEngagementAnalyticsAggregationRepository(pool);
  service = new EngagementAnalyticsAggregationService({
    engagementAnalyticsAggregationRepository,
  });
});

afterAll(async () => {
  await closeMysqlPool();
});

describe('Listing daily aggregation (brief §8/§28)', () => {
  test('maps every listing-scoped event type to its exact counter', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();
    const promotionId = futurePromotionId();

    await Promise.all([
      insertEvent({
        eventName: 'listing_impression',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        placement: 'home_featured',
      }),
      insertEvent({
        eventName: 'listing_impression',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        placement: 'home_featured',
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'favorite_added',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'favorite_added',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'favorite_added',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'favorite_removed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'booking_started',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'booking_request_submitted',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'booking_confirmed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      // one listing_impression at a NON-search placement — must NOT count into search_impressions_count
      insertEvent({
        eventName: 'listing_impression',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        placement: 'search_results',
      }),
      insertEvent({
        eventName: 'search_result_click',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        promotionId,
      }),
      insertEvent({
        eventName: 'promotion_clicked',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        promotionId,
      }),
      // contact_click carries no listing_id in real usage (A3.2) — this
      // one is deliberately malformed (listing_id set anyway) to prove
      // it is excluded from listing daily regardless.
      insertEvent({
        eventName: 'contact_click',
        occurredAt: DAY_START,
        listingId,
        partnerId,
      }),
    ]);

    await service.aggregateDay(DAY);
    const row = await getListingDaily(listingId);

    expect(row).not.toBeNull();
    expect(row.partner_id).toBe(partnerId);
    expect(Number(row.impressions_count)).toBe(3); // 2 home_featured + 1 search_results
    expect(Number(row.views_count)).toBe(1);
    expect(Number(row.favorite_adds_count)).toBe(3);
    expect(Number(row.favorite_removes_count)).toBe(1);
    expect(Number(row.booking_starts_count)).toBe(1);
    expect(Number(row.booking_requests_count)).toBe(1);
    expect(Number(row.booking_confirmations_count)).toBe(1);
    expect(Number(row.search_impressions_count)).toBe(1); // only the search_results-placement one
    expect(Number(row.search_clicks_count)).toBe(1);
    expect(Number(row.promotion_impressions_count)).toBe(1);
    expect(Number(row.promotion_clicks_count)).toBe(1);
    // contact_click must never affect listing daily (brief §8/§28).
    expect(row.contact_clicks_count).toBeUndefined();
  });

  test('a promoted card double-firing listing_impression AND promotion_impression never double-counts into one counter (brief §14)', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();
    const promotionId = futurePromotionId();

    await insertEvent({
      eventName: 'listing_impression',
      occurredAt: DAY_START,
      listingId,
      partnerId,
      placement: 'home_featured',
    });
    await insertEvent({
      eventName: 'promotion_impression',
      occurredAt: DAY_START,
      listingId,
      partnerId,
      promotionId,
      placement: 'home_featured',
    });

    await service.aggregateDay(DAY);
    const row = await getListingDaily(listingId);

    expect(Number(row.impressions_count)).toBe(1);
    expect(Number(row.promotion_impressions_count)).toBe(1);
  });
});

describe('Listing daily unique visitors (brief §13/§29)', () => {
  test('the same visitor viewing 3 times counts as 1; three distinct visitors count as 3', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();
    const visitorA = uuid();
    const visitorB = uuid();
    const visitorC = uuid();

    await Promise.all([
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
    ]);
    await service.aggregateDay(DAY);
    expect(
      Number((await getListingDaily(listingId)).daily_unique_visitors),
    ).toBe(1);

    const listingId2 = futureListingId();
    await Promise.all([
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingId2,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingId2,
        partnerId,
        anonymousVisitorId: visitorB,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingId2,
        partnerId,
        anonymousVisitorId: visitorC,
      }),
    ]);
    await service.aggregateDay(DAY);
    expect(
      Number((await getListingDaily(listingId2)).daily_unique_visitors),
    ).toBe(3);
  });

  test('a NULL anonymous_visitor_id (a server-authoritative event with no browser identity) never inflates the unique count', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();

    await Promise.all([
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: null,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: null,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId,
        partnerId,
        anonymousVisitorId: uuid(),
      }),
    ]);
    await service.aggregateDay(DAY);
    const row = await getListingDaily(listingId);
    expect(Number(row.views_count)).toBe(3);
    // COUNT(DISTINCT ...) in SQL never counts NULL — only the one real visitor id.
    expect(Number(row.daily_unique_visitors)).toBe(1);
  });
});

describe('Company daily aggregation (brief §10/§30)', () => {
  test('maps company_profile_view / company_listing_click / contact_click, with no listing-level contact metric', async () => {
    const partnerId = futurePartnerId();
    const visitorA = uuid();
    const visitorB = uuid();

    await Promise.all([
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId,
        anonymousVisitorId: visitorA,
      }),
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId,
        anonymousVisitorId: visitorB,
      }),
      insertEvent({
        eventName: 'company_listing_click',
        occurredAt: DAY_START,
        partnerId,
      }),
      insertEvent({
        eventName: 'company_listing_click',
        occurredAt: DAY_START,
        partnerId,
      }),
      insertEvent({
        eventName: 'contact_click',
        occurredAt: DAY_START,
        partnerId,
      }),
      insertEvent({
        eventName: 'contact_click',
        occurredAt: DAY_START,
        partnerId,
      }),
      insertEvent({
        eventName: 'contact_click',
        occurredAt: DAY_START,
        partnerId,
      }),
    ]);

    await service.aggregateDay(DAY);
    const row = await getCompanyDaily(partnerId);

    expect(row).not.toBeNull();
    expect(Number(row.profile_views_count)).toBe(3);
    expect(Number(row.daily_unique_visitors)).toBe(2);
    expect(Number(row.listing_clicks_count)).toBe(2);
    expect(Number(row.contact_clicks_count)).toBe(3);

    // No listing-level contact metric exists anywhere (A3.2 lock).
    const columns = Object.keys(
      (await pool.query(`SHOW COLUMNS FROM listing_analytics_daily`))[0].reduce(
        (acc, c) => ({ ...acc, [c.Field]: true }),
        {},
      ),
    );
    expect(columns).not.toContain('contact_clicks_count');
  });
});

describe('Promotion daily aggregation (brief §11/§31)', () => {
  test('aggregates to exact promotion_id + partner_id + day, storing no CTR', async () => {
    const promotionId = futurePromotionId();
    const partnerId = futurePartnerId();
    const listingId = futureListingId();

    await Promise.all([
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId,
        partnerId,
        listingId,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId,
        partnerId,
        listingId,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId,
        partnerId,
        listingId,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId,
        partnerId,
        listingId,
      }),
      insertEvent({
        eventName: 'promotion_clicked',
        occurredAt: DAY_START,
        promotionId,
        partnerId,
        listingId,
      }),
    ]);

    await service.aggregateDay(DAY);
    const row = await getPromotionDaily(promotionId);

    expect(row).not.toBeNull();
    expect(row.partner_id).toBe(partnerId);
    expect(Number(row.impressions_count)).toBe(4);
    expect(Number(row.clicks_count)).toBe(1);
    expect(row.ctr).toBeUndefined();
    expect(row.click_through_rate).toBeUndefined();
  });
});

describe('Zero / missing metrics (brief §12)', () => {
  test('no daily row is created for an entity with zero relevant events that day', async () => {
    const listingId = futureListingId();
    // A day with genuinely nothing for this listing — aggregateDay(DAY)
    // ran many times above by other tests, never touching this id.
    await service.aggregateDay(DAY);
    expect(await getListingDaily(listingId)).toBeNull();
  });

  test('a listing with SOME event types but not others stores the missing ones as 0, not NULL', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();
    await insertEvent({
      eventName: 'listing_impression',
      occurredAt: DAY_START,
      listingId,
      partnerId,
      placement: 'home_featured',
    });

    await service.aggregateDay(DAY);
    const row = await getListingDaily(listingId);
    expect(Number(row.impressions_count)).toBe(1);
    expect(Number(row.views_count)).toBe(0);
    expect(Number(row.booking_confirmations_count)).toBe(0);
    expect(Number(row.daily_unique_visitors)).toBe(0);
  });
});

describe('Yerevan business-day midnight boundary (brief §5/§32)', () => {
  test('19:59:59.999 UTC belongs to the PREVIOUS Yerevan date; 20:00:00.000 UTC belongs to the NEXT one', async () => {
    const listingBefore = futureListingId();
    const listingAtStart = futureListingId();
    const listingJustBeforeEnd = futureListingId();
    const listingAtEnd = futureListingId();
    const partnerId = futurePartnerId();

    // Exactly at DAY's start boundary (belongs to DAY).
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: DAY_START,
      listingId: listingAtStart,
      partnerId,
    });
    // One ms after the start boundary (still belongs to DAY).
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: JUST_AFTER_START,
      listingId: listingBefore,
      partnerId,
    });
    // One ms before DAY's end boundary (still belongs to DAY, NOT the next day).
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: JUST_BEFORE_END,
      listingId: listingJustBeforeEnd,
      partnerId,
    });
    // Exactly at DAY's end boundary (belongs to the NEXT Yerevan date, not DAY).
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: DAY_END,
      listingId: listingAtEnd,
      partnerId,
    });

    await service.aggregateDay(DAY);

    expect(await getListingDaily(listingAtStart)).not.toBeNull();
    expect(await getListingDaily(listingBefore)).not.toBeNull();
    expect(await getListingDaily(listingJustBeforeEnd)).not.toBeNull();
    // The 20:00:00.000 event must NOT have landed in DAY's aggregate.
    expect(await getListingDaily(listingAtEnd)).toBeNull();

    // It DOES belong to the next business date instead.
    const NEXT_DAY = '2026-06-16';
    await service.aggregateDay(NEXT_DAY);
    expect(await getListingDaily(listingAtEnd, NEXT_DAY)).not.toBeNull();
  });
});

describe('Idempotency (brief §7/§33)', () => {
  test('re-running aggregateDay for the same day produces identical counts, never incremented, never duplicated', async () => {
    const listingId = futureListingId();
    const partnerId = futurePartnerId();
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: DAY_START,
      listingId,
      partnerId,
    });

    await service.aggregateDay(DAY);
    const first = await getListingDaily(listingId);
    expect(Number(first.views_count)).toBe(1);

    await service.aggregateDay(DAY);
    const second = await getListingDaily(listingId);
    expect(Number(second.views_count)).toBe(1);

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM listing_analytics_daily WHERE listing_id = ? AND day = ?`,
      [listingId, DAY],
    );
    expect(Number(countRows[0].c)).toBe(1);

    // Add one more raw event, rerun — the recomputed total reflects it exactly once.
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: DAY_START,
      listingId,
      partnerId,
    });
    await service.aggregateDay(DAY);
    const third = await getListingDaily(listingId);
    expect(Number(third.views_count)).toBe(2);
  });
});

describe('Multiple listings/partners — tenant isolation (brief §34)', () => {
  test('Partner A (2 listings) and Partner B (1 listing) aggregate to fully isolated rows', async () => {
    const partnerA = futurePartnerId();
    const partnerB = futurePartnerId();
    const listingA1 = futureListingId();
    const listingA2 = futureListingId();
    const listingB1 = futureListingId();

    await Promise.all([
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingA1,
        partnerId: partnerA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingA1,
        partnerId: partnerA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingA2,
        partnerId: partnerA,
      }),
      insertEvent({
        eventName: 'listing_viewed',
        occurredAt: DAY_START,
        listingId: listingB1,
        partnerId: partnerB,
      }),
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId: partnerA,
      }),
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId: partnerB,
      }),
      insertEvent({
        eventName: 'company_profile_view',
        occurredAt: DAY_START,
        partnerId: partnerB,
      }),
    ]);

    await service.aggregateDay(DAY);

    expect(Number((await getListingDaily(listingA1)).views_count)).toBe(2);
    expect(Number((await getListingDaily(listingA2)).views_count)).toBe(1);
    expect(Number((await getListingDaily(listingB1)).views_count)).toBe(1);
    expect(Number((await getCompanyDaily(partnerA)).profile_views_count)).toBe(
      1,
    );
    expect(Number((await getCompanyDaily(partnerB)).profile_views_count)).toBe(
      2,
    );
  });

  test('a promotion row never leaks into a different promotion/partner’s row', async () => {
    const promotionX = futurePromotionId();
    const promotionY = futurePromotionId();
    const partnerX = futurePartnerId();
    const partnerY = futurePartnerId();

    await Promise.all([
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId: promotionX,
        partnerId: partnerX,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId: promotionX,
        partnerId: partnerX,
      }),
      insertEvent({
        eventName: 'promotion_impression',
        occurredAt: DAY_START,
        promotionId: promotionY,
        partnerId: partnerY,
      }),
      insertEvent({
        eventName: 'promotion_clicked',
        occurredAt: DAY_START,
        promotionId: promotionY,
        partnerId: partnerY,
      }),
    ]);

    await service.aggregateDay(DAY);

    const rowX = await getPromotionDaily(promotionX);
    const rowY = await getPromotionDaily(promotionY);
    expect(Number(rowX.impressions_count)).toBe(2);
    expect(Number(rowX.clicks_count)).toBe(0);
    expect(rowX.partner_id).toBe(partnerX);
    expect(Number(rowY.impressions_count)).toBe(1);
    expect(Number(rowY.clicks_count)).toBe(1);
    expect(rowY.partner_id).toBe(partnerY);
  });
});

describe('Partner-id conflict fail-safe (brief §9)', () => {
  const CONFLICT_DAY = '2026-06-20';
  const CONFLICT_DAY_START = '2026-06-19 20:00:00.000';

  test('a listing with two conflicting server-resolved partner_id values aborts aggregation instead of guessing one', async () => {
    const listingId = futureListingId();
    const partnerOne = futurePartnerId();
    const partnerTwo = futurePartnerId();

    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: CONFLICT_DAY_START,
      listingId,
      partnerId: partnerOne,
    });
    await insertEvent({
      eventName: 'listing_viewed',
      occurredAt: CONFLICT_DAY_START,
      listingId,
      partnerId: partnerTwo,
    });

    await expect(service.aggregateDay(CONFLICT_DAY)).rejects.toThrow(
      /conflicting server-resolved partner_id/,
    );
    // Nothing was written for the conflicting listing.
    expect(await getListingDaily(listingId, CONFLICT_DAY)).toBeNull();
  });

  test('a promotion with two conflicting server-resolved partner_id values aborts aggregation instead of guessing one', async () => {
    const promotionId = futurePromotionId();
    const partnerOne = futurePartnerId();
    const partnerTwo = futurePartnerId();
    const otherDay = '2026-06-21';
    const otherDayStart = '2026-06-20 20:00:00.000';

    await insertEvent({
      eventName: 'promotion_impression',
      occurredAt: otherDayStart,
      promotionId,
      partnerId: partnerOne,
    });
    await insertEvent({
      eventName: 'promotion_impression',
      occurredAt: otherDayStart,
      promotionId,
      partnerId: partnerTwo,
    });

    await expect(service.aggregateDay(otherDay)).rejects.toThrow(
      /conflicting server-resolved partner_id/,
    );
    expect(await getPromotionDaily(promotionId, otherDay)).toBeNull();
  });
});

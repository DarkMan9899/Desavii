/**
 * MySQL-backed Partner Analytics READ repository — Step A5. Reads the
 * three daily rollup tables (`listing_analytics_daily`,
 * `company_analytics_daily`, `promotion_analytics_daily`, A4) for
 * counts/trends, and `analytics_events` directly ONLY for the exact
 * cross-day unique-visitor headline (never for ordinary counts — brief
 * §42). Deliberately a THIRD, separate repository in this module,
 * alongside the A2 ingestion repository (`analytics_events` INSERT-only)
 * and the A4 aggregation repository (daily-table UPSERT/DELETE) — this
 * one is read-only and knows nothing about writing either table (brief
 * §33's "keep ingestion and aggregation repository responsibilities
 * separate" extended to this one too).
 *
 * Also reads `listings`/`listing_translations` directly (read-only JOIN,
 * never a write) for listing display metadata — the same established
 * precedent `mysqlFavoriteRepository.js`/`mysqlSearchRepository.js`
 * already use for "duplicate a small, self-contained read JOIN here
 * rather than thread a cross-module query-builder dependency" (this
 * file's own header comments, unchanged, document that choice for their
 * own modules). Listing/promotion OWNERSHIP decisions themselves are
 * never made here — `PartnerAnalyticsService` resolves those through
 * `listingService`/`advertisementService`'s own methods first; every
 * query below is additionally partner-scoped as defense in depth (brief
 * §26), never the sole authorization boundary.
 *
 * Every business-day boundary is computed entirely DB-side from MySQL's
 * own `UTC_TIMESTAMP(3)` — the exact same fixed UTC+04:00, no-DST
 * arithmetic `mysqlEngagementAnalyticsAggregationRepository.js` (A4)
 * already established. Deliberately NOT imported from that file (A4 is
 * left untouched per this step's brief §44) — the ~10 lines of shared
 * SQL fragment are duplicated here instead, matching how every other
 * "day boundary" constant in this codebase already stays a small local
 * const rather than shared infrastructure.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

/** `DATE(UTC_TIMESTAMP(3) + 4h)` — today's Asia/Yerevan calendar date, computed DB-side. Same expression as A4's own repository. */
const YEREVAN_TODAY_EXPR = 'DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR))';

/**
 * A `[fromDay, toDay]` business-date range's half-open UTC instant
 * interval (brief §31): start = `fromDay`'s own Yerevan-midnight start
 * (the previous UTC date at 20:00:00), end = `toDay`'s Yerevan-midnight
 * END (`toDay` itself at 20:00:00 UTC, i.e. the start of `toDay + 1`).
 * Both placeholders bind to plain `YYYY-MM-DD` strings — never a JS
 * `Date`.
 */
const RANGE_START_UTC_EXPR =
  "TIMESTAMP(DATE_SUB(?, INTERVAL 1 DAY), '20:00:00')";
const RANGE_END_UTC_EXPR = "TIMESTAMP(?, '20:00:00')";

const LISTING_TITLE_JOIN = `
       LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
       LEFT JOIN listing_translations lt2 ON lt2.listing_id = l.id`;
const LISTING_TITLE_SELECT = "COALESCE(lt.title, lt2.title, '') AS title";

const LISTINGS_SORT_COLUMNS = Object.freeze({
  views: 'views_count',
  impressions: 'impressions_count',
  booking_requests: 'booking_requests_count',
  promotion_clicks: 'promotion_clicks_count',
});

/** camelCase field on {@link toListingRangeRow}'s output for each bounded sort key — used to build the pagination cursor's keyset value. */
const LISTINGS_SORT_FIELDS = Object.freeze({
  views: 'viewsCount',
  impressions: 'impressionsCount',
  booking_requests: 'bookingRequestsCount',
  promotion_clicks: 'promotionClicksCount',
});

function toListingRangeRow(row) {
  return {
    listingId: row.listing_id,
    title: row.title,
    listingTypeCode: row.listing_type_code,
    impressionsCount: Number(row.impressions_count),
    viewsCount: Number(row.views_count),
    favoriteAddsCount: Number(row.favorite_adds_count),
    favoriteRemovesCount: Number(row.favorite_removes_count),
    bookingStartsCount: Number(row.booking_starts_count),
    bookingRequestsCount: Number(row.booking_requests_count),
    bookingConfirmationsCount: Number(row.booking_confirmations_count),
    searchImpressionsCount: Number(row.search_impressions_count),
    searchClicksCount: Number(row.search_clicks_count),
    promotionImpressionsCount: Number(row.promotion_impressions_count),
    promotionClicksCount: Number(row.promotion_clicks_count),
  };
}

export class MySqlPartnerAnalyticsRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * Resolves `range=N` (brief §5/§31/§32) into `{fromDay, toDay}`
   * `YYYY-MM-DD` Asia/Yerevan business dates — `fromDay = today - N`,
   * `toDay = today - 1` (today itself is never included, matching A4's
   * own "never aggregate the still-open business day" rule). Computed
   * in one DB round trip so `fromDay`/`toDay` are never derived from a
   * JS clock read.
   */
  async resolveBusinessDateRange(rangeDays) {
    const [[row]] = await this.#pool.query(
      `SELECT
         DATE_SUB(${YEREVAN_TODAY_EXPR}, INTERVAL ? DAY) AS from_day,
         DATE_SUB(${YEREVAN_TODAY_EXPR}, INTERVAL 1 DAY) AS to_day`,
      [rangeDays],
    );
    return {
      fromDay: toDateString(row.from_day),
      toDay: toDateString(row.to_day),
    };
  }

  /**
   * Partner-wide range sums from `listing_analytics_daily` — every
   * count field the overview needs EXCEPT `daily_unique_visitors`
   * (which is a per-day chart value only, never summed as an exact
   * cross-day headline — brief §10, see {@link getExactUniqueVisitors}
   * for the real headline source).
   */
  async getListingRangeTotals({ partnerId, fromDay, toDay }) {
    const [[row]] = await this.#pool.query(
      `SELECT
         COALESCE(SUM(impressions_count), 0) AS impressions_count,
         COALESCE(SUM(views_count), 0) AS views_count,
         COALESCE(SUM(favorite_adds_count), 0) AS favorite_adds_count,
         COALESCE(SUM(favorite_removes_count), 0) AS favorite_removes_count,
         COALESCE(SUM(booking_starts_count), 0) AS booking_starts_count,
         COALESCE(SUM(booking_requests_count), 0) AS booking_requests_count,
         COALESCE(SUM(booking_confirmations_count), 0) AS booking_confirmations_count,
         COALESCE(SUM(search_impressions_count), 0) AS search_impressions_count,
         COALESCE(SUM(search_clicks_count), 0) AS search_clicks_count,
         COALESCE(SUM(promotion_impressions_count), 0) AS promotion_impressions_count,
         COALESCE(SUM(promotion_clicks_count), 0) AS promotion_clicks_count
       FROM listing_analytics_daily
       WHERE partner_id = ? AND day >= ? AND day <= ?`,
      [partnerId, fromDay, toDay],
    );
    return {
      impressionsCount: Number(row.impressions_count),
      viewsCount: Number(row.views_count),
      favoriteAddsCount: Number(row.favorite_adds_count),
      favoriteRemovesCount: Number(row.favorite_removes_count),
      bookingStartsCount: Number(row.booking_starts_count),
      bookingRequestsCount: Number(row.booking_requests_count),
      bookingConfirmationsCount: Number(row.booking_confirmations_count),
      searchImpressionsCount: Number(row.search_impressions_count),
      searchClicksCount: Number(row.search_clicks_count),
      promotionImpressionsCount: Number(row.promotion_impressions_count),
      promotionClicksCount: Number(row.promotion_clicks_count),
    };
  }

  /** Partner-wide range sums from `company_analytics_daily`. */
  async getCompanyRangeTotals({ partnerId, fromDay, toDay }) {
    const [[row]] = await this.#pool.query(
      `SELECT
         COALESCE(SUM(profile_views_count), 0) AS profile_views_count,
         COALESCE(SUM(listing_clicks_count), 0) AS listing_clicks_count,
         COALESCE(SUM(contact_clicks_count), 0) AS contact_clicks_count
       FROM company_analytics_daily
       WHERE partner_id = ? AND day >= ? AND day <= ?`,
      [partnerId, fromDay, toDay],
    );
    return {
      profileViewsCount: Number(row.profile_views_count),
      listingClicksCount: Number(row.listing_clicks_count),
      contactClicksCount: Number(row.contact_clicks_count),
    };
  }

  /**
   * The exact-unique-visitors headline (brief §9) — `COUNT(DISTINCT
   * anonymous_visitor_id)` straight from retained raw `analytics_events`
   * for `listing_viewed`, never `SUM(daily_unique_visitors)` (which
   * would double-count a visitor who returned on multiple days). Uses
   * `idx_analytics_events_partner_id_event_name_occurred_at
   * (partner_id, event_name, occurred_at)` — equality on both leading
   * columns plus a range on the third, the index's exact designed shape.
   */
  async getExactUniqueVisitors({ partnerId, fromDay, toDay }) {
    const [[row]] = await this.#pool.query(
      `SELECT COUNT(DISTINCT anonymous_visitor_id) AS cnt
       FROM analytics_events
       WHERE partner_id = ?
         AND event_name = 'listing_viewed'
         AND anonymous_visitor_id IS NOT NULL
         AND occurred_at >= ${RANGE_START_UTC_EXPR}
         AND occurred_at < ${RANGE_END_UTC_EXPR}`,
      [partnerId, fromDay, toDay],
    );
    return Number(row.cnt);
  }

  /** Single-listing exact-unique-visitors — same query, `listing_id`-scoped (still index-compatible: `partner_id` + `event_name` equality, `occurred_at` range, `listing_id` filters the narrowed rowset). */
  async getExactUniqueVisitorsForListing({
    partnerId,
    listingId,
    fromDay,
    toDay,
  }) {
    const [[row]] = await this.#pool.query(
      `SELECT COUNT(DISTINCT anonymous_visitor_id) AS cnt
       FROM analytics_events
       WHERE partner_id = ?
         AND listing_id = ?
         AND event_name = 'listing_viewed'
         AND anonymous_visitor_id IS NOT NULL
         AND occurred_at >= ${RANGE_START_UTC_EXPR}
         AND occurred_at < ${RANGE_END_UTC_EXPR}`,
      [partnerId, listingId, fromDay, toDay],
    );
    return Number(row.cnt);
  }

  /**
   * Exact-unique-visitors grouped by listing, ONE query for a whole page
   * of listings (brief §19 — never N+1). `listingIds` is always the
   * already-paginated page from {@link listListingsRange}, so this never
   * scans a partner's full raw-event history per request.
   */
  async getExactUniqueVisitorsGroupedByListings({
    partnerId,
    listingIds,
    fromDay,
    toDay,
  }) {
    if (listingIds.length === 0) return new Map();
    const placeholders = listingIds.map(() => '?').join(', ');
    const [rows] = await this.#pool.query(
      `SELECT listing_id, COUNT(DISTINCT anonymous_visitor_id) AS cnt
       FROM analytics_events
       WHERE partner_id = ?
         AND event_name = 'listing_viewed'
         AND anonymous_visitor_id IS NOT NULL
         AND listing_id IN (${placeholders})
         AND occurred_at >= ${RANGE_START_UTC_EXPR}
         AND occurred_at < ${RANGE_END_UTC_EXPR}
       GROUP BY listing_id`,
      [partnerId, ...listingIds, fromDay, toDay],
    );
    return new Map(rows.map((row) => [row.listing_id, Number(row.cnt)]));
  }

  /** One row per day in `[fromDay, toDay]` present in `listing_analytics_daily` for this partner — zero-fill happens in the Service, this only returns rows that exist. */
  async getListingDailySeriesForPartner({ partnerId, fromDay, toDay }) {
    const [rows] = await this.#pool.query(
      `SELECT day,
         SUM(impressions_count) AS impressions_count,
         SUM(views_count) AS views_count,
         SUM(daily_unique_visitors) AS daily_unique_visitors,
         SUM(favorite_adds_count) AS favorite_adds_count,
         SUM(favorite_removes_count) AS favorite_removes_count,
         SUM(booking_starts_count) AS booking_starts_count,
         SUM(booking_requests_count) AS booking_requests_count,
         SUM(booking_confirmations_count) AS booking_confirmations_count,
         SUM(search_impressions_count) AS search_impressions_count,
         SUM(search_clicks_count) AS search_clicks_count,
         SUM(promotion_impressions_count) AS promotion_impressions_count,
         SUM(promotion_clicks_count) AS promotion_clicks_count
       FROM listing_analytics_daily
       WHERE partner_id = ? AND day >= ? AND day <= ?
       GROUP BY day`,
      [partnerId, fromDay, toDay],
    );
    return rows.map((row) => ({
      day: toDateString(row.day),
      impressionsCount: Number(row.impressions_count),
      viewsCount: Number(row.views_count),
      dailyUniqueVisitors: Number(row.daily_unique_visitors),
      favoriteAddsCount: Number(row.favorite_adds_count),
      favoriteRemovesCount: Number(row.favorite_removes_count),
      bookingStartsCount: Number(row.booking_starts_count),
      bookingRequestsCount: Number(row.booking_requests_count),
      bookingConfirmationsCount: Number(row.booking_confirmations_count),
      searchImpressionsCount: Number(row.search_impressions_count),
      searchClicksCount: Number(row.search_clicks_count),
      promotionImpressionsCount: Number(row.promotion_impressions_count),
      promotionClicksCount: Number(row.promotion_clicks_count),
    }));
  }

  /** Same shape as {@link getListingDailySeriesForPartner}, from `company_analytics_daily`. */
  async getCompanyDailySeriesForPartner({ partnerId, fromDay, toDay }) {
    const [rows] = await this.#pool.query(
      `SELECT day,
         SUM(profile_views_count) AS profile_views_count,
         SUM(listing_clicks_count) AS listing_clicks_count,
         SUM(contact_clicks_count) AS contact_clicks_count
       FROM company_analytics_daily
       WHERE partner_id = ? AND day >= ? AND day <= ?
       GROUP BY day`,
      [partnerId, fromDay, toDay],
    );
    return rows.map((row) => ({
      day: toDateString(row.day),
      profileViewsCount: Number(row.profile_views_count),
      listingClicksCount: Number(row.listing_clicks_count),
      contactClicksCount: Number(row.contact_clicks_count),
    }));
  }

  /** Single-listing range sums, joined with `listings`/`listing_translations` for identity metadata — used by the listing-detail endpoint. Returns `null` if the listing has no analytics rows this range (a valid, zero-data outcome, never an error). */
  async getListingRangeDetail({ listingId, fromDay, toDay }) {
    const [[row]] = await this.#pool.query(
      `SELECT
         l.id AS listing_id, l.slug, ltype.code AS listing_type_code,
         ${LISTING_TITLE_SELECT},
         COALESCE(SUM(lad.impressions_count), 0) AS impressions_count,
         COALESCE(SUM(lad.views_count), 0) AS views_count,
         COALESCE(SUM(lad.favorite_adds_count), 0) AS favorite_adds_count,
         COALESCE(SUM(lad.favorite_removes_count), 0) AS favorite_removes_count,
         COALESCE(SUM(lad.booking_starts_count), 0) AS booking_starts_count,
         COALESCE(SUM(lad.booking_requests_count), 0) AS booking_requests_count,
         COALESCE(SUM(lad.booking_confirmations_count), 0) AS booking_confirmations_count,
         COALESCE(SUM(lad.search_impressions_count), 0) AS search_impressions_count,
         COALESCE(SUM(lad.search_clicks_count), 0) AS search_clicks_count,
         COALESCE(SUM(lad.promotion_impressions_count), 0) AS promotion_impressions_count,
         COALESCE(SUM(lad.promotion_clicks_count), 0) AS promotion_clicks_count
       FROM listings l
       JOIN listing_types ltype ON ltype.id = l.listing_type_id
       LEFT JOIN listing_analytics_daily lad
         ON lad.listing_id = l.id AND lad.day >= ? AND lad.day <= ?
       ${LISTING_TITLE_JOIN}
       WHERE l.id = ?
       GROUP BY l.id, l.slug, ltype.code, lt.title, lt2.title`,
      [fromDay, toDay, listingId],
    );
    if (!row) return null;
    return {
      listingId: row.listing_id,
      slug: row.slug,
      listingTypeCode: row.listing_type_code,
      title: row.title,
      impressionsCount: Number(row.impressions_count),
      viewsCount: Number(row.views_count),
      favoriteAddsCount: Number(row.favorite_adds_count),
      favoriteRemovesCount: Number(row.favorite_removes_count),
      bookingStartsCount: Number(row.booking_starts_count),
      bookingRequestsCount: Number(row.booking_requests_count),
      bookingConfirmationsCount: Number(row.booking_confirmations_count),
      searchImpressionsCount: Number(row.search_impressions_count),
      searchClicksCount: Number(row.search_clicks_count),
      promotionImpressionsCount: Number(row.promotion_impressions_count),
      promotionClicksCount: Number(row.promotion_clicks_count),
    };
  }

  /** Single-listing daily series from `listing_analytics_daily` (no zero-fill — the Service fills gaps). */
  async getListingDailySeries({ listingId, fromDay, toDay }) {
    const [rows] = await this.#pool.query(
      `SELECT day, impressions_count, views_count, daily_unique_visitors,
              favorite_adds_count, favorite_removes_count,
              booking_starts_count, booking_requests_count, booking_confirmations_count,
              search_impressions_count, search_clicks_count,
              promotion_impressions_count, promotion_clicks_count
       FROM listing_analytics_daily
       WHERE listing_id = ? AND day >= ? AND day <= ?
       ORDER BY day ASC`,
      [listingId, fromDay, toDay],
    );
    return rows.map((row) => ({
      day: toDateString(row.day),
      impressionsCount: Number(row.impressions_count),
      viewsCount: Number(row.views_count),
      dailyUniqueVisitors: Number(row.daily_unique_visitors),
      favoriteAddsCount: Number(row.favorite_adds_count),
      favoriteRemovesCount: Number(row.favorite_removes_count),
      bookingStartsCount: Number(row.booking_starts_count),
      bookingRequestsCount: Number(row.booking_requests_count),
      bookingConfirmationsCount: Number(row.booking_confirmations_count),
      searchImpressionsCount: Number(row.search_impressions_count),
      searchClicksCount: Number(row.search_clicks_count),
      promotionImpressionsCount: Number(row.promotion_impressions_count),
      promotionClicksCount: Number(row.promotion_clicks_count),
    }));
  }

  /**
   * Cursor-paginated per-listing range rollup (brief §18/§20) — one row
   * per current (non-soft-deleted) partner listing, joined against a
   * `LEFT JOIN`ed range-scoped `listing_analytics_daily` slice (a listing
   * with zero events this range still appears, with all-zero counts).
   * Sort is a bounded enum mapped to a fixed column (never a raw client
   * sort field, brief §18's explicit "no arbitrary SQL sort fields"
   * rule) — `search_ctr` is deliberately NOT a sort key in v1 (brief
   * §39 explicitly permits keeping this minimal rather than building a
   * computed-expression sort/keyset).
   */
  async listListingsRange({ partnerId, fromDay, toDay, sort, cursor, limit }) {
    const sortColumn =
      LISTINGS_SORT_COLUMNS[sort] ?? LISTINGS_SORT_COLUMNS.views;
    const sortField = LISTINGS_SORT_FIELDS[sort] ?? LISTINGS_SORT_FIELDS.views;
    const decoded = decodeCursor(cursor);
    const hasCursor =
      decoded &&
      decoded.sortValue !== undefined &&
      decoded.listingId !== undefined;
    // The keyset condition compares against the GROUP BY's aggregated
    // sum, so it belongs in HAVING, not WHERE — MySQL supports a
    // row-value comparison there the same way `(created_at, id) < (?, ?)`
    // is already used on a real column elsewhere in this codebase
    // (`mysqlFavoriteRepository.js#listForCustomer`), just against an
    // aggregate expression instead.
    const havingClause = hasCursor
      ? `HAVING (COALESCE(SUM(lad.${sortColumn}), 0), l.id) < (?, ?)`
      : '';

    const [rows] = await this.#pool.query(
      `SELECT
         l.id AS listing_id, l.slug, ltype.code AS listing_type_code,
         ${LISTING_TITLE_SELECT},
         COALESCE(SUM(lad.impressions_count), 0) AS impressions_count,
         COALESCE(SUM(lad.views_count), 0) AS views_count,
         COALESCE(SUM(lad.favorite_adds_count), 0) AS favorite_adds_count,
         COALESCE(SUM(lad.favorite_removes_count), 0) AS favorite_removes_count,
         COALESCE(SUM(lad.booking_starts_count), 0) AS booking_starts_count,
         COALESCE(SUM(lad.booking_requests_count), 0) AS booking_requests_count,
         COALESCE(SUM(lad.booking_confirmations_count), 0) AS booking_confirmations_count,
         COALESCE(SUM(lad.search_impressions_count), 0) AS search_impressions_count,
         COALESCE(SUM(lad.search_clicks_count), 0) AS search_clicks_count,
         COALESCE(SUM(lad.promotion_impressions_count), 0) AS promotion_impressions_count,
         COALESCE(SUM(lad.promotion_clicks_count), 0) AS promotion_clicks_count
       FROM listings l
       JOIN listing_types ltype ON ltype.id = l.listing_type_id
       LEFT JOIN listing_analytics_daily lad
         ON lad.listing_id = l.id AND lad.day >= ? AND lad.day <= ?
       ${LISTING_TITLE_JOIN}
       WHERE l.partner_id = ? AND l.deleted_at IS NULL
       GROUP BY l.id, l.slug, ltype.code, lt.title, lt2.title
       ${havingClause}
       ORDER BY ${sortColumn} DESC, l.id DESC
       LIMIT ?`,
      [
        fromDay,
        toDay,
        partnerId,
        ...(hasCursor ? [decoded.sortValue, decoded.listingId] : []),
        limit + 1,
      ],
    );

    return buildPageMeta(rows.map(toListingRangeRow), limit, (row) => ({
      sortValue: row[sortField],
      listingId: row.listingId,
    }));
  }

  /** Single-promotion range sums from `promotion_analytics_daily`. Returns `null` if no rows exist this range (valid zero-data outcome). */
  async getPromotionRangeTotals({ promotionId, fromDay, toDay }) {
    const [[row]] = await this.#pool.query(
      `SELECT
         COALESCE(SUM(impressions_count), 0) AS impressions_count,
         COALESCE(SUM(clicks_count), 0) AS clicks_count
       FROM promotion_analytics_daily
       WHERE promotion_id = ? AND day >= ? AND day <= ?`,
      [promotionId, fromDay, toDay],
    );
    return {
      impressionsCount: Number(row.impressions_count),
      clicksCount: Number(row.clicks_count),
    };
  }

  /** Single-promotion daily series (no zero-fill — the Service fills gaps). */
  async getPromotionDailySeries({ promotionId, fromDay, toDay }) {
    const [rows] = await this.#pool.query(
      `SELECT day, impressions_count, clicks_count
       FROM promotion_analytics_daily
       WHERE promotion_id = ? AND day >= ? AND day <= ?
       ORDER BY day ASC`,
      [promotionId, fromDay, toDay],
    );
    return rows.map((row) => ({
      day: toDateString(row.day),
      impressionsCount: Number(row.impressions_count),
      clicksCount: Number(row.clicks_count),
    }));
  }
}

export default MySqlPartnerAnalyticsRepository;

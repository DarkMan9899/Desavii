/**
 * MySQL-backed Engagement Analytics AGGREGATION repository — Step A4.
 * Owns the read side of `analytics_events` and the write side of the
 * three daily rollup tables (`listing_analytics_daily`,
 * `company_analytics_daily`, `promotion_analytics_daily`, migration
 * 0049, counter ownership corrected by 0050). Kept deliberately separate
 * from `mysqlEngagementAnalyticsRepository.js` (the A2 ingestion
 * repository, `analytics_events` INSERT-only) — a different read/write
 * shape and a different caller (a daily maintenance job, never an HTTP
 * request), matching this codebase's existing precedent of a dedicated
 * repository per distinct access pattern rather than one repository
 * accreting unrelated responsibilities.
 *
 * Every date boundary in this file is computed entirely DB-side, from
 * MySQL's own `UTC_TIMESTAMP(3)` — never from a JS `Date`/`new Date()`
 * read or JS-side date arithmetic. `mysql2` (without an explicit
 * `timezone` pool option) decodes a DATETIME/DATE column into a JS
 * `Date` constructed at LOCAL midnight/instant, not UTC (see
 * `infrastructure/database/dateFormat.js`'s own header) — the only way
 * to stay host-timezone-independent for date-range comparisons is to
 * never let a boundary round-trip through JS at all. The one place a
 * `DATE` value IS read back into JS (the business-date getters below)
 * goes through `toDateString()`, the repository's own established fix
 * for that exact decode gotcha.
 *
 * Armenia (Asia/Yerevan) is a fixed UTC+04:00 offset with no DST
 * (locked in migration 0049's own header and
 * `ENGAGEMENT_BUSINESS_TIMEZONE`) — every business-day boundary in this
 * file is therefore a plain `+4 hours` / `-4 hours` arithmetic shift,
 * never a real IANA timezone-database lookup.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';

/** `DATE(UTC_TIMESTAMP(3) + 4h)` — today's Asia/Yerevan calendar date, computed DB-side. */
const YEREVAN_TODAY_EXPR = 'DATE(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 4 HOUR))';

/**
 * A business date's Asia/Yerevan midnight-to-midnight window, expressed
 * as a half-open UTC instant interval (brief A4 §5): start = the
 * PREVIOUS UTC calendar date at 20:00:00 (`DATE_SUB(day, INTERVAL 1
 * DAY)` + `20:00:00`), end = `day` itself at 20:00:00. Both `?`
 * placeholders bind to the same `YYYY-MM-DD` business-date string.
 */
const DAY_START_UTC_EXPR = "TIMESTAMP(DATE_SUB(?, INTERVAL 1 DAY), '20:00:00')";
const DAY_END_UTC_EXPR = "TIMESTAMP(?, '20:00:00')";

/**
 * Every client-ingestible or server-authoritative event that carries a
 * `listing_id` and is in scope for `listing_analytics_daily` (brief §8).
 * `contact_click` is deliberately excluded — Step A3.2 locked it as
 * company/partner-scoped, never listing-scoped (migration 0050).
 */
const LISTING_EVENT_NAMES = [
  'listing_impression',
  'listing_viewed',
  'favorite_added',
  'favorite_removed',
  'booking_started',
  'booking_request_submitted',
  'booking_confirmed',
  'search_result_click',
  'promotion_impression',
  'promotion_clicked',
];

const COMPANY_EVENT_NAMES = [
  'company_profile_view',
  'company_listing_click',
  'contact_click',
];

const PROMOTION_EVENT_NAMES = ['promotion_impression', 'promotion_clicked'];

function inClause(names) {
  return names.map(() => '?').join(', ');
}

export class MySqlEngagementAnalyticsAggregationRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /** Today's Asia/Yerevan business date, as `YYYY-MM-DD` — never itself a completed day. */
  async getCurrentBusinessDate() {
    const [[row]] = await this.#pool.query(
      `SELECT ${YEREVAN_TODAY_EXPR} AS business_date`,
    );
    return toDateString(row.business_date);
  }

  /**
   * The `count` most recently COMPLETED Asia/Yerevan business dates
   * (yesterday first), computed entirely DB-side from the same
   * `UTC_TIMESTAMP(3)` read as {@link getCurrentBusinessDate} — never
   * today's own (still-open) business date, per brief §15.
   */
  async getRecentCompletedBusinessDates(count) {
    const columns = Array.from(
      { length: count },
      (_, i) =>
        `DATE_SUB(${YEREVAN_TODAY_EXPR}, INTERVAL ${i + 1} DAY) AS d${i + 1}`,
    ).join(', ');
    const [[row]] = await this.#pool.query(`SELECT ${columns}`);
    return Array.from({ length: count }, (_, i) =>
      toDateString(row[`d${i + 1}`]),
    );
  }

  /**
   * Listings whose `analytics_events` rows for `day` carry more than one
   * distinct non-null `partner_id` — a data-integrity fault (A2 always
   * resolves `partner_id` server-side alongside `listing_id` in the same
   * write), never something to silently resolve via `MIN()` (brief §9).
   * Scoped to the same `LISTING_EVENT_NAMES` filter the real aggregation
   * uses, so this check is compatible with
   * `idx_analytics_events_event_name_occurred_at` exactly like the
   * aggregation query itself — no separate full-table scan.
   */
  async findListingPartnerIdConflicts({ day }) {
    const [rows] = await this.#pool.query(
      `SELECT listing_id, COUNT(DISTINCT partner_id) AS partner_id_variety
       FROM analytics_events
       WHERE listing_id IS NOT NULL
         AND event_name IN (${inClause(LISTING_EVENT_NAMES)})
         AND occurred_at >= ${DAY_START_UTC_EXPR}
         AND occurred_at < ${DAY_END_UTC_EXPR}
       GROUP BY listing_id
       HAVING COUNT(DISTINCT partner_id) > 1`,
      [...LISTING_EVENT_NAMES, day, day],
    );
    return rows.map((row) => ({
      listingId: row.listing_id,
      partnerIdVariety: Number(row.partner_id_variety),
    }));
  }

  /** Same fault class as {@link findListingPartnerIdConflicts}, scoped to `promotion_id`. */
  async findPromotionPartnerIdConflicts({ day }) {
    const [rows] = await this.#pool.query(
      `SELECT promotion_id, COUNT(DISTINCT partner_id) AS partner_id_variety
       FROM analytics_events
       WHERE promotion_id IS NOT NULL
         AND event_name IN (${inClause(PROMOTION_EVENT_NAMES)})
         AND occurred_at >= ${DAY_START_UTC_EXPR}
         AND occurred_at < ${DAY_END_UTC_EXPR}
       GROUP BY promotion_id
       HAVING COUNT(DISTINCT partner_id) > 1`,
      [...PROMOTION_EVENT_NAMES, day, day],
    );
    return rows.map((row) => ({
      promotionId: row.promotion_id,
      partnerIdVariety: Number(row.partner_id_variety),
    }));
  }

  /**
   * Full recompute of `listing_analytics_daily` for `day` — one
   * `INSERT ... SELECT ... ON DUPLICATE KEY UPDATE`, so a rerun for the
   * same day always overwrites every counter with the freshly-recomputed
   * total (never increments — brief §7). Inserts no row at all for a
   * listing with zero relevant events that day (brief §12). A promoted
   * card's `listing_impression` and `promotion_impression` are counted
   * into separate columns from their own distinct `event_name` — never
   * summed into one (brief §14).
   */
  async upsertListingDaily({ day }) {
    try {
      const [result] = await this.#pool.query(
        `INSERT INTO listing_analytics_daily
           (listing_id, day, partner_id, impressions_count, views_count,
            daily_unique_visitors, favorite_adds_count, favorite_removes_count,
            booking_starts_count, booking_requests_count, booking_confirmations_count,
            search_impressions_count, search_clicks_count,
            promotion_impressions_count, promotion_clicks_count)
         SELECT
           listing_id,
           ? AS day,
           MIN(partner_id) AS partner_id,
           SUM(CASE WHEN event_name = 'listing_impression' THEN 1 ELSE 0 END) AS impressions_count,
           SUM(CASE WHEN event_name = 'listing_viewed' THEN 1 ELSE 0 END) AS views_count,
           COUNT(DISTINCT CASE WHEN event_name = 'listing_viewed' THEN anonymous_visitor_id END) AS daily_unique_visitors,
           SUM(CASE WHEN event_name = 'favorite_added' THEN 1 ELSE 0 END) AS favorite_adds_count,
           SUM(CASE WHEN event_name = 'favorite_removed' THEN 1 ELSE 0 END) AS favorite_removes_count,
           SUM(CASE WHEN event_name = 'booking_started' THEN 1 ELSE 0 END) AS booking_starts_count,
           SUM(CASE WHEN event_name = 'booking_request_submitted' THEN 1 ELSE 0 END) AS booking_requests_count,
           SUM(CASE WHEN event_name = 'booking_confirmed' THEN 1 ELSE 0 END) AS booking_confirmations_count,
           SUM(CASE WHEN event_name = 'listing_impression' AND placement = 'search_results' THEN 1 ELSE 0 END) AS search_impressions_count,
           SUM(CASE WHEN event_name = 'search_result_click' THEN 1 ELSE 0 END) AS search_clicks_count,
           SUM(CASE WHEN event_name = 'promotion_impression' THEN 1 ELSE 0 END) AS promotion_impressions_count,
           SUM(CASE WHEN event_name = 'promotion_clicked' THEN 1 ELSE 0 END) AS promotion_clicks_count
         FROM analytics_events
         WHERE listing_id IS NOT NULL
           AND event_name IN (${inClause(LISTING_EVENT_NAMES)})
           AND occurred_at >= ${DAY_START_UTC_EXPR}
           AND occurred_at < ${DAY_END_UTC_EXPR}
         GROUP BY listing_id
         ON DUPLICATE KEY UPDATE
           partner_id = VALUES(partner_id),
           impressions_count = VALUES(impressions_count),
           views_count = VALUES(views_count),
           daily_unique_visitors = VALUES(daily_unique_visitors),
           favorite_adds_count = VALUES(favorite_adds_count),
           favorite_removes_count = VALUES(favorite_removes_count),
           booking_starts_count = VALUES(booking_starts_count),
           booking_requests_count = VALUES(booking_requests_count),
           booking_confirmations_count = VALUES(booking_confirmations_count),
           search_impressions_count = VALUES(search_impressions_count),
           search_clicks_count = VALUES(search_clicks_count),
           promotion_impressions_count = VALUES(promotion_impressions_count),
           promotion_clicks_count = VALUES(promotion_clicks_count)`,
        [day, ...LISTING_EVENT_NAMES, day, day],
      );
      return result.affectedRows;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Full recompute of `company_analytics_daily` for `day` — the A3.2
   * canonical `contact_click` attribution point (`contact_clicks_count`,
   * never on `listing_analytics_daily`). `partner_id` is the direct
   * GROUP BY key here, not denormalized from potentially-conflicting
   * rows, so no conflict check applies (unlike listing/promotion).
   */
  async upsertCompanyDaily({ day }) {
    try {
      const [result] = await this.#pool.query(
        `INSERT INTO company_analytics_daily
           (partner_id, day, profile_views_count, daily_unique_visitors,
            listing_clicks_count, contact_clicks_count)
         SELECT
           partner_id,
           ? AS day,
           SUM(CASE WHEN event_name = 'company_profile_view' THEN 1 ELSE 0 END) AS profile_views_count,
           COUNT(DISTINCT CASE WHEN event_name = 'company_profile_view' THEN anonymous_visitor_id END) AS daily_unique_visitors,
           SUM(CASE WHEN event_name = 'company_listing_click' THEN 1 ELSE 0 END) AS listing_clicks_count,
           SUM(CASE WHEN event_name = 'contact_click' THEN 1 ELSE 0 END) AS contact_clicks_count
         FROM analytics_events
         WHERE partner_id IS NOT NULL
           AND event_name IN (${inClause(COMPANY_EVENT_NAMES)})
           AND occurred_at >= ${DAY_START_UTC_EXPR}
           AND occurred_at < ${DAY_END_UTC_EXPR}
         GROUP BY partner_id
         ON DUPLICATE KEY UPDATE
           profile_views_count = VALUES(profile_views_count),
           daily_unique_visitors = VALUES(daily_unique_visitors),
           listing_clicks_count = VALUES(listing_clicks_count),
           contact_clicks_count = VALUES(contact_clicks_count)`,
        [day, ...COMPANY_EVENT_NAMES, day, day],
      );
      return result.affectedRows;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Full recompute of `promotion_analytics_daily` for `day`. Never
   * computes/stores CTR (brief §11) — click-through rate is always
   * `clicks_count / impressions_count` at future read time (A5).
   */
  async upsertPromotionDaily({ day }) {
    try {
      const [result] = await this.#pool.query(
        `INSERT INTO promotion_analytics_daily
           (promotion_id, day, partner_id, impressions_count, clicks_count)
         SELECT
           promotion_id,
           ? AS day,
           MIN(partner_id) AS partner_id,
           SUM(CASE WHEN event_name = 'promotion_impression' THEN 1 ELSE 0 END) AS impressions_count,
           SUM(CASE WHEN event_name = 'promotion_clicked' THEN 1 ELSE 0 END) AS clicks_count
         FROM analytics_events
         WHERE promotion_id IS NOT NULL
           AND event_name IN (${inClause(PROMOTION_EVENT_NAMES)})
           AND occurred_at >= ${DAY_START_UTC_EXPR}
           AND occurred_at < ${DAY_END_UTC_EXPR}
         GROUP BY promotion_id
         ON DUPLICATE KEY UPDATE
           partner_id = VALUES(partner_id),
           impressions_count = VALUES(impressions_count),
           clicks_count = VALUES(clicks_count)`,
        [day, ...PROMOTION_EVENT_NAMES, day, day],
      );
      return result.affectedRows;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Hard-deletes raw events older than the retention window (brief
   * §18/§19), but anchored to a full Asia/Yerevan business-day boundary
   * rather than a naive rolling `NOW() - windowDays*24h` instant (brief
   * §22/§23): a Partner's "last `windowDays` days" dashboard range means
   * the `windowDays` most recently COMPLETED business dates
   * `[today - windowDays, today - 1]` (brief §15's "today is never a
   * completed day" design, applied consistently to the read side too).
   * The OLDEST business date that range needs is `today - windowDays`,
   * whose own Asia/Yerevan-midnight start is `windowDays + 1` UTC days
   * before today's own Yerevan midnight — so this purges everything
   * strictly before that instant, one full UTC day more conservative
   * than a naive `windowDays`-only cutoff, to guarantee that oldest
   * business date's raw coverage is always complete regardless of what
   * instant "now" is within today's own still-open business day.
   *
   * @param {{windowDays: number}} args
   * @returns {Promise<number>} rows purged
   */
  async purgeRawEventsOlderThanRetentionWindow({ windowDays }) {
    try {
      const [result] = await this.#pool.query(
        `DELETE FROM analytics_events
         WHERE occurred_at < TIMESTAMP(
           DATE_SUB(${YEREVAN_TODAY_EXPR}, INTERVAL ? DAY),
           '20:00:00'
         )`,
        [windowDays + 1],
      );
      return result.affectedRows;
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /**
   * Hard-deletes daily aggregate rows whose `day` is older than
   * `retentionMonths` calendar months before today's Asia/Yerevan
   * business date (brief §20) — exact boundary retained (`<`, never
   * `<=`). Applied independently to all three daily tables (brief §21:
   * one table failing never blocks the others, and rerunning is safe —
   * each `DELETE` is already a no-op once a table has nothing left to
   * purge).
   *
   * @param {{retentionMonths: number}} args
   * @returns {Promise<{listing: number, company: number, promotion: number}>}
   */
  async purgeAggregatesOlderThanRetentionWindow({ retentionMonths }) {
    try {
      const cutoffExpr = `DATE_SUB(${YEREVAN_TODAY_EXPR}, INTERVAL ? MONTH)`;
      const [[listingResult], [companyResult], [promotionResult]] =
        await Promise.all([
          this.#pool.query(
            `DELETE FROM listing_analytics_daily WHERE day < ${cutoffExpr}`,
            [retentionMonths],
          ),
          this.#pool.query(
            `DELETE FROM company_analytics_daily WHERE day < ${cutoffExpr}`,
            [retentionMonths],
          ),
          this.#pool.query(
            `DELETE FROM promotion_analytics_daily WHERE day < ${cutoffExpr}`,
            [retentionMonths],
          ),
        ]);
      return {
        listing: listingResult.affectedRows,
        company: companyResult.affectedRows,
        promotion: promotionResult.affectedRows,
      };
    } catch (err) {
      throw mapMysqlError(err);
    }
  }
}

export default MySqlEngagementAnalyticsAggregationRepository;

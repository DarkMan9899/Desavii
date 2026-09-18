/**
 * MySQL-backed Engagement Analytics repository — Step A2. Owns
 * `analytics_events` only (migration 0049, A1) — the three daily rollup
 * tables stay untouched until the aggregation job (A4).
 *
 * `occurred_at` is always the literal SQL `UTC_TIMESTAMP(3)` function,
 * evaluated once by MySQL at INSERT execution time — never a bound
 * parameter, so it can never be a client-supplied or JS-clock-read value
 * (A0.1 §15, the Listing Lifecycle module's own B6.5 lesson applied
 * pre-emptively). MySQL evaluates a `NOW()`-family function once per
 * statement, so every row in one batch shares the exact same instant.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';

const COLUMNS = [
  'event_id',
  'dedup_key',
  'event_name',
  'occurred_at',
  'anonymous_visitor_id',
  'session_id',
  'user_id',
  'listing_id',
  'partner_id',
  'promotion_id',
  'booking_id',
  'placement',
  'position',
  'category_code',
  'query_text',
  'result_count',
  'locale',
  'device_class',
  'traffic_source',
  'contact_method',
];

/** Every bindable column, in the exact same order as `COLUMNS` minus the SQL-literal `occurred_at`. */
function toRowParams(row) {
  return [
    row.eventId,
    row.dedupKey ?? null,
    row.eventName,
    row.anonymousVisitorId ?? null,
    row.sessionId ?? null,
    row.userId ?? null,
    row.listingId ?? null,
    row.partnerId ?? null,
    row.promotionId ?? null,
    row.bookingId ?? null,
    row.placement ?? null,
    row.position ?? null,
    row.categoryCode ?? null,
    row.queryText ?? null,
    row.resultCount ?? null,
    row.locale ?? null,
    row.deviceClass ?? null,
    row.trafficSource ?? null,
    row.contactMethod ?? null,
  ];
}

export class MySqlEngagementAnalyticsRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * Bounded batch insert (caller enforces the 1-25 max, A0.1 §9). Uses a
   * precise, duplicate-key-only no-op (`ON DUPLICATE KEY UPDATE id = id`
   * — same established pattern as `mysqlAvailabilityCalendarRepository
   * .js`'s own capacity-lock no-op) rather than `INSERT IGNORE`, which
   * would blanket-suppress genuine data errors alongside the intended
   * `event_id`/`dedup_key` UNIQUE-collision no-ops (A0.1 §19).
   *
   * A duplicate `event_id` (idempotent retry) or `dedup_key` (semantic
   * dedup) is silently absorbed — the caller can never distinguish "row
   * inserted" from "row already existed" from this method's return value
   * alone, by design; ingestion's response contract never depends on it.
   */
  async insertBatch(rows) {
    if (rows.length === 0) return;

    const placeholdersPerRow = `(${COLUMNS.map((col) =>
      col === 'occurred_at' ? 'UTC_TIMESTAMP(3)' : '?',
    ).join(', ')})`;
    const valuesSql = rows.map(() => placeholdersPerRow).join(', ');
    const params = rows.flatMap((row) => toRowParams(row));

    try {
      await this.#pool.query(
        `INSERT INTO analytics_events (${COLUMNS.join(', ')})
         VALUES ${valuesSql}
         ON DUPLICATE KEY UPDATE id = id`,
        params,
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
  }
}

export default MySqlEngagementAnalyticsRepository;

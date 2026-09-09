/**
 * MySQL-backed Advertisement repository — Sprint E (TOP/Featured
 * Listings + Promotion Engine).
 *
 * Owns `advertisements` (plus read-only lookups over `ad_placement_types`
 * and `advertisement_statuses`, migration 0010, and `ad_products`) —
 * never `listings`/`partners`, matching every other module's cross-table
 * rule (`AdvertisementService` resolves listing/partner existence
 * through `ListingService`'s public interface, never a second Repository
 * over `listings`).
 *
 * "Currently active" is never read off `status_id` alone anywhere a
 * public/gating decision is made — every such query ALSO requires
 * `start_date <= CURDATE() AND end_date >= CURDATE()` (UTC `DATE`
 * comparison, matching this codebase's existing day-granularity
 * convention for date-range business rows, e.g. `booking_items`/
 * `availability_calendar`). The stored status is convenience/Admin-
 * display state, kept roughly in sync by the lifecycle sweep job — the
 * public truth is always re-derived from dates so a late-running sweep
 * can never let an expired promotion linger publicly (spec §14).
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

/** Non-terminal statuses a promotion can still be publicly visible under (its real visibility is gated by dates on top of this). */
const VISIBLE_STATUS_CODES = ['APPROVED', 'SCHEDULED', 'ACTIVE'];

const ADVERTISEMENT_SELECT = `
  ad.id, ad.listing_id, ad.partner_id, ad.ad_placement_type_id, ad.ad_product_id,
  ad.status_id, apt.code AS placement_code, ads.code AS status_code,
  ad.price_snapshot_amount, ad.currency_id, cur.code AS currency_code,
  ad.start_date, ad.end_date, ad.display_priority,
  ad.impression_count, ad.click_count,
  ad.requested_by, ad.approved_by, ad.approved_at,
  ad.payment_marked_paid_by, ad.payment_marked_paid_at,
  ad.reminder_7d_sent_at, ad.reminder_2d_sent_at,
  ad.created_at, ad.updated_at, ad.created_by, ad.updated_by
`;
const ADVERTISEMENT_FROM = `
  FROM advertisements ad
  JOIN ad_placement_types apt ON apt.id = ad.ad_placement_type_id
  JOIN advertisement_statuses ads ON ads.id = ad.status_id
  JOIN currencies cur ON cur.id = ad.currency_id
`;

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    partnerId: row.partner_id,
    placementTypeId: row.ad_placement_type_id,
    placementCode: row.placement_code,
    productId: row.ad_product_id,
    statusId: row.status_id,
    statusCode: row.status_code,
    priceSnapshotAmount: row.price_snapshot_amount,
    currencyId: row.currency_id,
    currencyCode: row.currency_code,
    startDate: toDateString(row.start_date),
    endDate: toDateString(row.end_date),
    displayPriority: row.display_priority,
    impressionCount: row.impression_count,
    clickCount: row.click_count,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    paymentMarkedPaidBy: row.payment_marked_paid_by,
    paymentMarkedPaidAt: row.payment_marked_paid_at,
    reminder7dSentAt: row.reminder_7d_sent_at,
    reminder2dSentAt: row.reminder_2d_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export class MySqlAdvertisementRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async findPlacementTypeByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id, code, max_concurrent_slots FROM ad_placement_types WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]
      ? {
          id: rows[0].id,
          code: rows[0].code,
          maxConcurrentSlots: rows[0].max_concurrent_slots,
        }
      : null;
  }

  async findProductById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT id, ad_placement_type_id, name, duration_days, price_amount, currency_id, is_active
       FROM ad_products WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      placementTypeId: rows[0].ad_placement_type_id,
      name: rows[0].name,
      durationDays: rows[0].duration_days,
      priceAmount: rows[0].price_amount,
      currencyId: rows[0].currency_id,
      isActive: Boolean(rows[0].is_active),
    };
  }

  async listProductsByPlacement(placementTypeId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ap.id, ap.name, ap.duration_days, ap.price_amount, cur.code AS currency_code
       FROM ad_products ap
       JOIN currencies cur ON cur.id = ap.currency_id
       WHERE ap.ad_placement_type_id = ? AND ap.is_active = 1
       ORDER BY (ap.duration_days IS NULL) ASC, ap.duration_days ASC`,
      [placementTypeId],
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      durationDays: row.duration_days,
      priceAmount: row.price_amount,
      currencyCode: row.currency_code,
    }));
  }

  async findStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM advertisement_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async create(
    {
      listingId,
      partnerId,
      placementTypeId,
      productId,
      statusId,
      priceSnapshotAmount,
      currencyId,
      startDate,
      endDate,
      displayPriority = 0,
      requestedBy,
      createdBy,
    },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO advertisements
          (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id,
           price_snapshot_amount, currency_id, start_date, end_date, display_priority,
           requested_by, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          listingId,
          partnerId,
          placementTypeId,
          productId,
          statusId,
          priceSnapshotAmount,
          currencyId,
          startDate,
          endDate,
          displayPriority,
          requestedBy,
          createdBy,
          createdBy,
        ],
      );
      return this.findById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM} WHERE ad.id = ? AND ad.deleted_at IS NULL`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /** Row-locks for a status transition — must run inside a transaction. */
  async lockById(id, connection) {
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM} WHERE ad.id = ? AND ad.deleted_at IS NULL FOR UPDATE`,
      [id],
    );
    return toDomain(rows[0]);
  }

  async updateStatus(
    id,
    {
      statusId,
      approvedBy,
      approvedAt,
      paymentMarkedPaidBy,
      paymentMarkedPaidAt,
      updatedBy,
    },
    connection = this.#pool,
  ) {
    const sets = ['status_id = ?', 'updated_by = ?'];
    const params = [statusId, updatedBy];
    if (approvedBy !== undefined) {
      sets.push('approved_by = ?', 'approved_at = ?');
      params.push(approvedBy, approvedAt ?? new Date());
    }
    if (paymentMarkedPaidBy !== undefined) {
      sets.push('payment_marked_paid_by = ?', 'payment_marked_paid_at = ?');
      params.push(paymentMarkedPaidBy, paymentMarkedPaidAt ?? new Date());
    }
    params.push(id);
    await connection.query(
      `UPDATE advertisements SET ${sets.join(', ')} WHERE id = ?`,
      params,
    );
    return this.findById(id, connection);
  }

  /** Extends (or shortens) the SAME row's `end_date` — never a duplicate row — and resets both reminder-dedup columns so the new end date's own 7-day/2-day thresholds can fire again (spec §15). */
  async extend(id, { endDate, updatedBy }, connection = this.#pool) {
    await connection.query(
      `UPDATE advertisements
       SET end_date = ?, reminder_7d_sent_at = NULL, reminder_2d_sent_at = NULL, updated_by = ?
       WHERE id = ?`,
      [endDate, updatedBy, id],
    );
    return this.findById(id, connection);
  }

  async markReminderSent(id, thresholdDays, connection = this.#pool) {
    const column =
      thresholdDays === 7 ? 'reminder_7d_sent_at' : 'reminder_2d_sent_at';
    await connection.query(
      `UPDATE advertisements SET ${column} = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [id],
    );
  }

  /** Admin management list — cursor-paginated, optionally filtered. */
  async listForAdmin(
    { listingId, placementCode, statusCode } = {},
    { cursor = null, limit = 20 } = {},
  ) {
    const conditions = ['ad.deleted_at IS NULL'];
    const params = [];
    if (listingId !== undefined) {
      conditions.push('ad.listing_id = ?');
      params.push(listingId);
    }
    if (placementCode !== undefined) {
      conditions.push('apt.code = ?');
      params.push(placementCode);
    }
    if (statusCode !== undefined) {
      conditions.push('ads.code = ?');
      params.push(statusCode);
    }
    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('ad.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM}
       WHERE ${conditions.join(' AND ')}
       ORDER BY ad.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );
    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toDomain), meta };
  }

  /**
   * Every non-deleted, non-terminal advertisement for one listing —
   * `AdvertisementService#assertNoOverlap` uses this to reject a new
   * request whose date range collides with an existing one at the SAME
   * placement (spec §13).
   */
  async listOpenForListingAndPlacement(
    listingId,
    placementTypeId,
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM}
       WHERE ad.listing_id = ? AND ad.ad_placement_type_id = ? AND ad.deleted_at IS NULL
         AND ads.code IN ('REQUEST_SUBMITTED','AWAITING_OFFLINE_PAYMENT','PAID_MANUAL',${VISIBLE_STATUS_CODES.map(() => '?').join(',')})`,
      [listingId, placementTypeId, ...VISIBLE_STATUS_CODES],
    );
    return rows.map(toDomain);
  }

  /**
   * Public gating query — active listing ids for one placement, real
   * remaining capacity respecting `ad_placement_types.max_concurrent_slots`
   * (deterministic ordering: `display_priority DESC` then earliest
   * `start_date` as a stable fallback, spec §18 — never random). Server-
   * authoritative on dates, never on `status_id` alone (see file header).
   */
  async listActiveListingIdsByPlacement(
    { placementCode, categoryId, limit },
    connection = this.#pool,
  ) {
    // `limit` is always the resolved placement's own `max_concurrent_slots`
    // (the caller already loaded it via `findPlacementTypeByCode`) —
    // never hardcoded here, so a seed-data change to that column is
    // immediately honored without touching this query.
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 6;
    // Placeholders must be bound in the exact left-to-right order they
    // appear in the physical SQL text below: the category JOIN's `?`
    // (when present) comes before every WHERE-clause placeholder, since
    // the JOIN clause is written before WHERE.
    const joins =
      categoryId !== undefined
        ? 'JOIN listing_category_listing lcl ON lcl.listing_id = ad.listing_id AND lcl.category_id = ?'
        : '';
    const joinParams = categoryId !== undefined ? [categoryId] : [];
    const conditions = [
      'apt.code = ?',
      `ads.code IN (${VISIBLE_STATUS_CODES.map(() => '?').join(',')})`,
      'ad.start_date <= CURDATE()',
      'ad.end_date >= CURDATE()',
      'ad.deleted_at IS NULL',
    ];
    const whereParams = [placementCode, ...VISIBLE_STATUS_CODES];
    const [rows] = await connection.query(
      `SELECT ad.listing_id, ad.display_priority, ad.start_date
       FROM advertisements ad
       JOIN ad_placement_types apt ON apt.id = ad.ad_placement_type_id
       JOIN advertisement_statuses ads ON ads.id = ad.status_id
       ${joins}
       WHERE ${conditions.join(' AND ')}
       ORDER BY ad.display_priority DESC, ad.start_date ASC, ad.id ASC
       LIMIT ${safeLimit}`,
      [...joinParams, ...whereParams],
    );
    return rows.map((row) => row.listing_id);
  }

  /**
   * Lifecycle sweep reads (spec §14 sweep-for-convenience, never solely
   * authoritative — see file header): rows whose STORED status should
   * move given real dates, and rows due a reminder threshold. All three
   * scoped to non-deleted, currently-visible-status rows only.
   */
  async listDueForActivation(connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM}
       WHERE ad.deleted_at IS NULL AND ads.code IN ('APPROVED', 'SCHEDULED')
         AND ad.start_date <= CURDATE() AND ad.end_date >= CURDATE()`,
    );
    return rows.map(toDomain);
  }

  async listDueForExpiry(connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM}
       WHERE ad.deleted_at IS NULL AND ads.code = 'ACTIVE' AND ad.end_date < CURDATE()`,
    );
    return rows.map(toDomain);
  }

  /** `thresholdDays` (7 or 2) — rows entering that reminder window today, not yet sent for their CURRENT end_date. */
  async listDueForReminder(thresholdDays, connection = this.#pool) {
    const column =
      thresholdDays === 7 ? 'reminder_7d_sent_at' : 'reminder_2d_sent_at';
    const [rows] = await connection.query(
      `SELECT ${ADVERTISEMENT_SELECT} ${ADVERTISEMENT_FROM}
       WHERE ad.deleted_at IS NULL AND ads.code IN (${VISIBLE_STATUS_CODES.map(() => '?').join(',')})
         AND ad.${column} IS NULL
         AND ad.end_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
         AND ad.end_date >= CURDATE()`,
      [...VISIBLE_STATUS_CODES, thresholdDays],
    );
    return rows.map(toDomain);
  }

  async softDelete(id, deletedBy, connection = this.#pool) {
    await connection.query(
      `UPDATE advertisements SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?, updated_by = ? WHERE id = ?`,
      [deletedBy, deletedBy, id],
    );
  }
}

export default MySqlAdvertisementRepository;

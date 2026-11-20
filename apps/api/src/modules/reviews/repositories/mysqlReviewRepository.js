/**
 * MySQL-backed Review repository — Phase 12 (Product Polish: minimal
 * Reviews module). Owns `reviews` (migration 0009, unused until now).
 *
 * Reviews are auto-approved on submission (`status_id = 'APPROVED'`) —
 * this phase does not add an admin moderation UI for reviews (the
 * `review.moderate` permission already exists in the seed catalog for a
 * future phase to use), so gating a customer-written review behind an
 * unreachable PENDING queue would make it invisible forever. `vendor
 * response`/moderation columns stay available on the table for that
 * future phase.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';

function toReviewDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerUserId: row.customer_user_id,
    bookingId: row.booking_id,
    listingId: row.listing_id,
    rating: row.rating,
    title: row.title,
    content: row.content,
    statusCode: row.status_code,
    vendorResponse: row.vendor_response,
    vendorRespondedAt: row.vendor_responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    customerDisplayName: row.customer_display_name ?? undefined,
  };
}

/**
 * P1.5 (Master Roadmap) — the admin moderation queue/detail shape:
 * additive over `toReviewDomain`, including the listing title (so a
 * moderator doesn't have to open a second tab), moderation audit fields,
 * and a `reportCount` correlated-subquery column (see
 * `ADMIN_SELECT_COLUMNS` below) so a moderator can prioritize a
 * heavily-reported review without opening each one.
 */
function toReviewAdminDomain(row) {
  return {
    ...toReviewDomain(row),
    listingTitle: row.listing_title ?? null,
    moderationNotes: row.moderation_notes,
    moderatedAt: row.moderated_at,
    moderatedBy: row.moderated_by,
    reportCount: Number(row.report_count ?? 0),
  };
}

function toReviewReportDomain(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    reporterUserId: row.reporter_user_id,
    reasonCode: row.reason_code,
    reasonName: row.reason_name,
    details: row.details,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

/**
 * Listing Detail redesign — how a reviewer is named on a public page: the
 * first name and the last name's initial ("Anna K."), never the full name
 * (the admin views keep it). No parameters: only stored columns.
 */
const PUBLIC_REVIEWER_NAME_SQL = `TRIM(CONCAT(u.first_name,
  CASE WHEN u.last_name IS NULL OR u.last_name = '' THEN ''
       ELSE CONCAT(' ', LEFT(u.last_name, 1), '.') END))`;

const REVIEW_SELECT = `
  rv.id, rv.customer_user_id, rv.booking_id, rv.listing_id, rv.rating,
  rv.title, rv.content, rs.code AS status_code,
  rv.vendor_response, rv.vendor_responded_at,
  rv.created_at, rv.updated_at
`;

const ADMIN_SELECT_COLUMNS = `
  ${REVIEW_SELECT}, rv.moderation_notes, rv.moderated_at, rv.moderated_by,
  (SELECT lt.title FROM listing_translations lt
   WHERE lt.listing_id = rv.listing_id ORDER BY lt.language_id ASC LIMIT 1) AS listing_title,
  (SELECT COUNT(*) FROM review_reports rr WHERE rr.review_id = rv.id) AS report_count
`;

export class MySqlReviewRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async findByBookingId(bookingId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${REVIEW_SELECT}
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       WHERE rv.booking_id = ? AND rv.deleted_at IS NULL
       LIMIT 1`,
      [bookingId],
    );
    return toReviewDomain(rows[0]);
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${REVIEW_SELECT}
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       WHERE rv.id = ? AND rv.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return toReviewDomain(rows[0]);
  }

  async create(
    { customerUserId, bookingId, listingId, rating, title, content },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO reviews
           (customer_user_id, booking_id, listing_id, rating, title, content,
            status_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?,
           (SELECT id FROM moderation_statuses WHERE code = 'APPROVED'), ?)`,
        [
          customerUserId,
          bookingId,
          listingId,
          rating,
          title ?? null,
          content ?? null,
          customerUserId,
        ],
      );
      return this.findById(result.insertId, connection);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /** Public, cursor-paginated: only ever APPROVED, non-deleted reviews, newest first. */
  async listByListingId(listingId, { cursor, limit } = {}) {
    const decoded = decodeCursor(cursor);
    const conditions = [
      'rv.listing_id = ?',
      "rs.code = 'APPROVED'",
      'rv.deleted_at IS NULL',
    ];
    const params = [listingId];
    if (
      decoded &&
      decoded.createdAt !== undefined &&
      decoded.id !== undefined
    ) {
      conditions.push('(rv.created_at, rv.id) < (?, ?)');
      params.push(decoded.createdAt, decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${REVIEW_SELECT}, ${PUBLIC_REVIEWER_NAME_SQL} AS customer_display_name
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       JOIN users u ON u.id = rv.customer_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rv.created_at DESC, rv.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    return buildPageMeta(rows.map(toReviewDomain), limit, (row) => ({
      createdAt: row.createdAt,
      id: row.id,
    }));
  }

  /** Bulk aggregate lookup — `SearchResultCard`/company-listing grids need one rating per row without an N+1. */
  async getSummariesForListingIds(listingIds) {
    if (listingIds.length === 0) return new Map();
    const placeholders = listingIds.map(() => '?').join(', ');
    const [rows] = await this.#pool.query(
      `SELECT rv.listing_id, AVG(rv.rating) AS rating_average, COUNT(*) AS review_count
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       WHERE rv.listing_id IN (${placeholders}) AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
       GROUP BY rv.listing_id`,
      listingIds,
    );
    return new Map(
      rows.map((row) => [
        row.listing_id,
        {
          ratingAverage: Number(row.rating_average),
          reviewCount: row.review_count,
        },
      ]),
    );
  }

  async getSummaryForListingId(listingId) {
    const summaries = await this.getSummariesForListingIds([listingId]);
    return summaries.get(listingId) ?? { ratingAverage: null, reviewCount: 0 };
  }

  /**
   * P1.5 (Master Roadmap) — the admin moderation queue: every review
   * regardless of status, cursor-paginated newest first. `hasReports`
   * filters to reviews with at least one report — the "needs attention"
   * view a moderator lands on.
   */
  async listAdmin({
    moderationStatus,
    hasReports,
    cursor = null,
    limit = 20,
  } = {}) {
    const conditions = ['rv.deleted_at IS NULL'];
    const params = [];

    if (moderationStatus) {
      conditions.push('rs.code = ?');
      params.push(moderationStatus);
    }
    if (hasReports) {
      conditions.push(
        '(SELECT COUNT(*) FROM review_reports rr WHERE rr.review_id = rv.id) > 0',
      );
    }
    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('rv.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await this.#pool.query(
      `SELECT ${ADMIN_SELECT_COLUMNS}, CONCAT(u.first_name, ' ', u.last_name) AS customer_display_name
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       JOIN users u ON u.id = rv.customer_user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY rv.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toReviewAdminDomain), meta };
  }

  /** P1.5 — admin detail, bypassing the APPROVED-only visibility rule `findById` enforces. */
  async findByIdAdmin(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${ADMIN_SELECT_COLUMNS}, CONCAT(u.first_name, ' ', u.last_name) AS customer_display_name
       FROM reviews rv
       JOIN moderation_statuses rs ON rs.id = rv.status_id
       JOIN users u ON u.id = rv.customer_user_id
       WHERE rv.id = ? AND rv.deleted_at IS NULL
       LIMIT 1`,
      [id],
    );
    return rows[0] ? toReviewAdminDomain(rows[0]) : null;
  }

  /**
   * @param {number} id
   * @param {string} statusCode PENDING|APPROVED|REJECTED|FLAGGED
   * @param {string|null} notes
   * @param {number} moderatedBy
   */
  async updateModerationStatus(id, statusCode, notes, moderatedBy) {
    await this.#pool.query(
      `UPDATE reviews
       SET status_id = (SELECT id FROM moderation_statuses WHERE code = ?),
           moderation_notes = ?,
           moderated_by = ?,
           moderated_at = CURRENT_TIMESTAMP(3),
           updated_by = ?
       WHERE id = ?`,
      [statusCode, notes, moderatedBy, moderatedBy, id],
    );
    return this.findByIdAdmin(id);
  }

  /**
   * P1.5 (Master Roadmap) — a partner's reply to a review.
   * `responseText === null` clears an existing reply (delete), matching
   * `vendor_responded_at`'s own nullability. `updatedBy` reuses the
   * table's existing generic audit column — no dedicated
   * `vendor_responded_by` column exists, and none is needed.
   */
  async setVendorResponse(id, responseText, updatedBy) {
    await this.#pool.query(
      `UPDATE reviews
       SET vendor_response = ?,
           vendor_responded_at = ?,
           updated_by = ?
       WHERE id = ?`,
      [responseText, responseText === null ? null : new Date(), updatedBy, id],
    );
    return this.findById(id);
  }

  /** Every report filed against one review, oldest first — the admin detail page's own list. */
  async listReportsForReview(reviewId) {
    const [rows] = await this.#pool.query(
      `SELECT rr.id, rr.review_id, rr.reporter_user_id, rr.details, rr.created_at,
              rr.resolved_at, rrr.code AS reason_code, rrr.name AS reason_name
       FROM review_reports rr
       JOIN review_report_reasons rrr ON rrr.id = rr.reason_id
       WHERE rr.review_id = ?
       ORDER BY rr.id ASC`,
      [reviewId],
    );
    return rows.map(toReviewReportDomain);
  }

  /**
   * The table's `uq_review_reports_review_reporter` constraint is the
   * final guarantee against a duplicate report from the same customer —
   * `reviewService.js#reportReview` maps that into a friendly 409, same
   * "let the constraint be the truth, map the error" idiom used
   * throughout this codebase (e.g. `submitReview`'s own booking check).
   */
  async createReport(
    { reviewId, reporterUserId, reasonId, details },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO review_reports (review_id, reporter_user_id, reason_id, details)
         VALUES (?, ?, ?, ?)`,
        [reviewId, reporterUserId, reasonId, details ?? null],
      );
      const [rows] = await connection.query(
        `SELECT rr.id, rr.review_id, rr.reporter_user_id, rr.details, rr.created_at,
                rr.resolved_at, rrr.code AS reason_code, rrr.name AS reason_name
         FROM review_reports rr
         JOIN review_report_reasons rrr ON rrr.id = rr.reason_id
         WHERE rr.id = ?
         LIMIT 1`,
        [result.insertId],
      );
      return toReviewReportDomain(rows[0]);
    } catch (err) {
      throw mapMysqlError(err);
    }
  }

  /** @returns {Promise<number|null>} */
  async findReasonIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM review_report_reasons WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }
}

export default MySqlReviewRepository;

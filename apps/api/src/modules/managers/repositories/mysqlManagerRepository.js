/**
 * MySQL-backed Manager repository (Sprint F).
 *
 * `manager_companies` (migration 0042) is the sole source of truth for
 * "which companies is this Manager assigned to" — mirrors
 * `partner_employees`' soft-delete-safe shape (see that migration's own
 * header comment). The analytics methods below follow
 * `mysqlAdminRepository.js#getDashboardStats`'s exact convention: plain
 * parallel raw-SQL aggregates over existing tables, `partner_id IN (...)`-
 * scoped instead of platform-wide, booking value grouped by currency
 * (never summed across currencies, never labeled "revenue").
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { ConflictError } from '../../../errors/AppError.js';

function toPartnerIdList(partnerIds) {
  return Array.isArray(partnerIds) ? partnerIds : [];
}

export class MySqlManagerRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async isAssigned(managerUserId, partnerId) {
    const [rows] = await this.#pool.query(
      `SELECT id FROM manager_companies
       WHERE manager_user_id = ? AND partner_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [managerUserId, partnerId],
    );
    return rows.length > 0;
  }

  /**
   * Insert-or-revive: a company previously unassigned (soft-deleted) from
   * this same manager can be reassigned without a hard-delete first, same
   * pattern the "active_*" generated-column trick exists to support.
   */
  async assignCompany({ managerUserId, partnerId, assignedBy }) {
    const [existingRows] = await this.#pool.query(
      `SELECT id, deleted_at FROM manager_companies
       WHERE manager_user_id = ? AND partner_id = ?
       ORDER BY id DESC LIMIT 1`,
      [managerUserId, partnerId],
    );

    if (existingRows.length > 0 && existingRows[0].deleted_at === null) {
      throw new ConflictError(
        'This company is already assigned to this manager.',
        'ALREADY_ASSIGNED',
      );
    }

    if (existingRows.length > 0) {
      const { id } = existingRows[0];
      await this.#pool.query(
        `UPDATE manager_companies
         SET deleted_at = NULL, deleted_by = NULL,
             assigned_at = CURRENT_TIMESTAMP(3), updated_by = ?
         WHERE id = ?`,
        [assignedBy, id],
      );
      return id;
    }

    const [result] = await this.#pool.query(
      `INSERT INTO manager_companies
         (manager_user_id, partner_id, assigned_at, created_by, updated_by)
       VALUES (?, ?, CURRENT_TIMESTAMP(3), ?, ?)`,
      [managerUserId, partnerId, assignedBy, assignedBy],
    );
    return result.insertId;
  }

  async unassignCompany({ managerUserId, partnerId, unassignedBy }) {
    const [result] = await this.#pool.query(
      `UPDATE manager_companies
       SET deleted_at = CURRENT_TIMESTAMP(3), deleted_by = ?, updated_by = ?
       WHERE manager_user_id = ? AND partner_id = ? AND deleted_at IS NULL`,
      [unassignedBy, unassignedBy, managerUserId, partnerId],
    );
    return result.affectedRows > 0;
  }

  async listAssignedPartnerIds(managerUserId) {
    const [rows] = await this.#pool.query(
      `SELECT partner_id FROM manager_companies
       WHERE manager_user_id = ? AND deleted_at IS NULL`,
      [managerUserId],
    );
    return rows.map((row) => row.partner_id);
  }

  async listAssignmentsForManager(managerUserId) {
    const [rows] = await this.#pool.query(
      `SELECT mc.id, mc.partner_id, mc.assigned_at,
              p.display_name, p.slug, p.logo_media_id,
              ms.code AS verification_status_code
       FROM manager_companies mc
       JOIN partners p ON p.id = mc.partner_id
       JOIN moderation_statuses ms ON ms.id = p.verification_status_id
       WHERE mc.manager_user_id = ? AND mc.deleted_at IS NULL
         AND p.deleted_at IS NULL
       ORDER BY p.display_name ASC`,
      [managerUserId],
    );
    return rows;
  }

  /** Admin roster: every user holding the global MANAGER role, with a live assignment count. */
  async listManagersAdmin({ limit = 50 } = {}) {
    const effectiveLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const [rows] = await this.#pool.query(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email,
              u.created_at,
              COUNT(mc.id) AS assigned_company_count
       FROM users u
       JOIN role_user ru ON ru.user_id = u.id
       JOIN roles r ON r.id = ru.role_id AND r.code = 'MANAGER'
       LEFT JOIN manager_companies mc
         ON mc.manager_user_id = u.id AND mc.deleted_at IS NULL
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.first_name, u.last_name, u.email, u.created_at
       ORDER BY u.created_at DESC
       LIMIT ?`,
      [effectiveLimit],
    );
    return rows;
  }

  async findManagerUserById(managerUserId) {
    const [rows] = await this.#pool.query(
      `SELECT u.id AS user_id, u.first_name, u.last_name, u.email,
              u.created_at
       FROM users u
       JOIN role_user ru ON ru.user_id = u.id
       JOIN roles r ON r.id = ru.role_id AND r.code = 'MANAGER'
       WHERE u.id = ? AND u.deleted_at IS NULL
       LIMIT 1`,
      [managerUserId],
    );
    return rows[0] ?? null;
  }

  /** "Listings you created" — a distinct, explicitly-labeled attribution metric (never conflated with "currently assigned company" totals, spec §19). */
  async countListingsCreatedByManager(managerUserId) {
    const [rows] = await this.#pool.query(
      `SELECT COUNT(*) AS total FROM listings
       WHERE created_by = ? AND deleted_at IS NULL`,
      [managerUserId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Cross-company dashboard summary — same shape/rationale as
   * `mysqlAdminRepository.js#getDashboardStats`, scoped to this Manager's
   * assigned partner ids instead of platform-wide.
   */
  async getDashboardStats(partnerIds) {
    const ids = toPartnerIdList(partnerIds);
    if (ids.length === 0) {
      return {
        counts: {
          companies: 0,
          listings: 0,
          publishedListings: 0,
          bookings: 0,
          completedBookings: 0,
          cancelledBookings: 0,
        },
        bookingValueByCurrency: [],
        bookingsByDay: [],
        byCompany: [],
      };
    }
    const placeholders = ids.map(() => '?').join(', ');

    const [
      [[listingCounts]],
      [[bookingCounts]],
      [bookingValueRows],
      [bookingsByDay],
      [byCompany],
    ] = await Promise.all([
      this.#pool.query(
        `SELECT COUNT(*) AS total,
                SUM(ls.code = 'PUBLISHED') AS published
         FROM listings l
         JOIN listing_statuses ls ON ls.id = l.status_id
         WHERE l.deleted_at IS NULL AND l.partner_id IN (${placeholders})`,
        ids,
      ),
      this.#pool.query(
        `SELECT COUNT(*) AS total,
                SUM(bs.code = 'COMPLETED') AS completed,
                SUM(bs.code IN ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_VENDOR')) AS cancelled
         FROM bookings b
         JOIN booking_statuses bs ON bs.id = b.status_id
         WHERE b.partner_id IN (${placeholders})`,
        ids,
      ),
      this.#pool.query(
        `SELECT c.code AS currency_code, SUM(b.total_amount) AS total
         FROM bookings b
         JOIN booking_statuses bs ON bs.id = b.status_id
         JOIN currencies c ON c.id = b.currency_id
         WHERE bs.code IN ('CONFIRMED', 'COMPLETED') AND b.partner_id IN (${placeholders})
         GROUP BY c.code`,
        ids,
      ),
      this.#pool.query(
        `SELECT DATE(b.created_at) AS day, COUNT(*) AS total
         FROM bookings b
         WHERE b.created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND b.partner_id IN (${placeholders})
         GROUP BY DATE(b.created_at)
         ORDER BY day ASC`,
        ids,
      ),
      this.#pool.query(
        `SELECT p.id AS partner_id, p.display_name,
                COUNT(b.id) AS booking_count,
                SUM(bs.code IN ('CONFIRMED', 'COMPLETED')) AS confirmed_booking_count
         FROM partners p
         LEFT JOIN bookings b ON b.partner_id = p.id
         LEFT JOIN booking_statuses bs ON bs.id = b.status_id
         WHERE p.id IN (${placeholders})
         GROUP BY p.id, p.display_name
         ORDER BY p.display_name ASC`,
        ids,
      ),
    ]);

    return {
      counts: {
        companies: ids.length,
        listings: Number(listingCounts.total ?? 0),
        publishedListings: Number(listingCounts.published ?? 0),
        bookings: Number(bookingCounts.total ?? 0),
        completedBookings: Number(bookingCounts.completed ?? 0),
        cancelledBookings: Number(bookingCounts.cancelled ?? 0),
      },
      bookingValueByCurrency: bookingValueRows.map((row) => ({
        currencyCode: row.currency_code,
        total: Number(row.total),
      })),
      bookingsByDay: bookingsByDay.map((row) => ({
        day:
          row.day instanceof Date
            ? row.day.toISOString().slice(0, 10)
            : row.day,
        total: Number(row.total),
      })),
      byCompany: byCompany.map((row) => ({
        partnerId: row.partner_id,
        displayName: row.display_name,
        bookingCount: Number(row.booking_count ?? 0),
        confirmedBookingCount: Number(row.confirmed_booking_count ?? 0),
      })),
    };
  }

  /**
   * Filtered breakdown — same `partner_id IN (...)` scoping as the
   * dashboard above, narrowed further by an optional date range/company/
   * listing/status filter (spec §20), always server-side.
   */
  async getAnalytics(partnerIds, filters = {}) {
    const ids = toPartnerIdList(partnerIds);
    if (ids.length === 0) {
      return {
        bookingsByStatus: [],
        byListing: [],
        averageBookingValueByCurrency: [],
      };
    }
    const { dateFrom, dateTo, companyId, listingId, statusCode } = filters;

    const conditions = [`b.partner_id IN (${ids.map(() => '?').join(', ')})`];
    const params = [...ids];
    if (companyId) {
      conditions.push('b.partner_id = ?');
      params.push(companyId);
    }
    if (listingId) {
      conditions.push('b.listing_id = ?');
      params.push(listingId);
    }
    if (dateFrom) {
      conditions.push('DATE(b.created_at) >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('DATE(b.created_at) <= ?');
      params.push(dateTo);
    }
    if (statusCode) {
      conditions.push('bs.code = ?');
      params.push(statusCode);
    }
    const whereClause = conditions.join(' AND ');

    const [[bookingsByStatus], [byListing], [avgRows]] = await Promise.all([
      this.#pool.query(
        `SELECT bs.code AS status_code, COUNT(*) AS total
         FROM bookings b
         JOIN booking_statuses bs ON bs.id = b.status_id
         WHERE ${whereClause}
         GROUP BY bs.code`,
        params,
      ),
      this.#pool.query(
        `SELECT l.id AS listing_id, lt.title, COUNT(b.id) AS booking_count
         FROM bookings b
         JOIN booking_statuses bs ON bs.id = b.status_id
         JOIN listings l ON l.id = b.listing_id
         LEFT JOIN listing_translations lt
           ON lt.listing_id = l.id
           AND lt.language_id = (SELECT id FROM languages WHERE is_default = 1 LIMIT 1)
         WHERE ${whereClause}
         GROUP BY l.id, lt.title
         ORDER BY booking_count DESC
         LIMIT 20`,
        params,
      ),
      this.#pool.query(
        `SELECT c.code AS currency_code,
                AVG(b.total_amount) AS average,
                COUNT(*) AS sample_size
         FROM bookings b
         JOIN booking_statuses bs ON bs.id = b.status_id
         JOIN currencies c ON c.id = b.currency_id
         WHERE ${whereClause} AND bs.code IN ('CONFIRMED', 'COMPLETED')
         GROUP BY c.code`,
        params,
      ),
    ]);

    return {
      bookingsByStatus: bookingsByStatus.map((row) => ({
        statusCode: row.status_code,
        total: Number(row.total),
      })),
      byListing: byListing.map((row) => ({
        listingId: row.listing_id,
        title: row.title,
        bookingCount: Number(row.booking_count),
      })),
      averageBookingValueByCurrency: avgRows.map((row) => ({
        currencyCode: row.currency_code,
        average: Number(row.average),
        sampleSize: Number(row.sample_size),
      })),
    };
  }
}

export default MySqlManagerRepository;

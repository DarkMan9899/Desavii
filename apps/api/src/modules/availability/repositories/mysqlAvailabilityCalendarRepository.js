/**
 * MySQL-backed AvailabilityCalendar repository.
 *
 * Owns `availability_calendar` (Module Catalog #15) — one row per
 * bookable unit per date, the platform's single most frequent
 * availability read/write. The public `/availability` write path only
 * ever persists `AVAILABLE`/`BLOCKED` status rows (enforced in
 * `AvailabilityService`, not here — a Repository never re-validates
 * business rules); `BOOKED`/`HELD` stay reserved for the Booking Engine
 * and are never written to `status_id` at all, including by Sprint 10 —
 * capacity accounting for holds/bookings lives entirely in
 * `quantity_available` (see `lockForCapacity` below), so the write-guard
 * `AvailabilityService` already enforces on `status_id` needed no change.
 * No soft-delete column exists on this table — removing a row is a
 * genuine hard delete, reverting that date to the implicit default of
 * `AVAILABLE`.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookableUnitId: row.bookable_unit_id,
    date: toDateString(row.date),
    statusId: row.status_id,
    statusCode: row.status_code,
    quantityAvailable: row.quantity_available,
    priceOverrideAmount: row.price_override_amount,
    priceOverrideCurrencyCode: row.price_override_currency_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS = `
  ac.id, ac.bookable_unit_id, ac.date, ac.status_id, ast.code AS status_code,
  ac.quantity_available, ac.price_override_amount, cur.code AS price_override_currency_code,
  ac.created_at, ac.updated_at
`;
const FROM_JOINED = `
  FROM availability_calendar ac
  JOIN availability_statuses ast ON ast.id = ac.status_id
  LEFT JOIN currencies cur ON cur.id = ac.price_override_currency_id
`;

export class MySqlAvailabilityCalendarRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async findStatusIdByCode(code, connection = this.#pool) {
    const [rows] = await connection.query(
      'SELECT id FROM availability_statuses WHERE code = ? LIMIT 1',
      [code],
    );
    return rows[0]?.id ?? null;
  }

  async findById(id, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED} WHERE ac.id = ? LIMIT 1`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /**
   * One `INSERT ... ON DUPLICATE KEY UPDATE` per date in `dates`, using
   * the existing `UNIQUE(bookable_unit_id, date)` — a true upsert, so
   * re-writing an already-blocked date is idempotent rather than a
   * duplicate-key error.
   */
  async upsertRange(
    {
      bookableUnitId,
      dates,
      statusId,
      quantityAvailable,
      priceOverrideAmount,
      priceOverrideCurrencyId,
    },
    connection = this.#pool,
  ) {
    const values = dates.map((date) => [
      bookableUnitId,
      date,
      statusId,
      quantityAvailable ?? null,
      priceOverrideAmount ?? null,
      priceOverrideCurrencyId ?? null,
    ]);
    try {
      await connection.query(
        `INSERT INTO availability_calendar
          (bookable_unit_id, \`date\`, status_id, quantity_available, price_override_amount, price_override_currency_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           status_id = VALUES(status_id), quantity_available = VALUES(quantity_available),
           price_override_amount = VALUES(price_override_amount),
           price_override_currency_id = VALUES(price_override_currency_id)`,
        [values],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
    return this.listForUnit(
      bookableUnitId,
      { from: dates[0], to: dates[dates.length - 1] },
      connection,
    );
  }

  async update(id, fields, connection = this.#pool) {
    const assignments = [];
    const values = [];
    if (fields.statusId !== undefined) {
      assignments.push('status_id = ?');
      values.push(fields.statusId);
    }
    if (fields.quantityAvailable !== undefined) {
      assignments.push('quantity_available = ?');
      values.push(fields.quantityAvailable);
    }
    if (fields.priceOverrideAmount !== undefined) {
      assignments.push('price_override_amount = ?');
      values.push(fields.priceOverrideAmount);
    }
    if (fields.priceOverrideCurrencyId !== undefined) {
      assignments.push('price_override_currency_id = ?');
      values.push(fields.priceOverrideCurrencyId);
    }

    if (assignments.length > 0) {
      try {
        await connection.query(
          `UPDATE availability_calendar SET ${assignments.join(', ')} WHERE id = ?`,
          [...values, id],
        );
      } catch (err) {
        throw mapMysqlError(err);
      }
    }
    return this.findById(id, connection);
  }

  /**
   * Step L6.2H4 — row-locks one unit/date row (`FOR UPDATE`) on the
   * caller's transaction connection, reached through the same
   * `UNIQUE(bookable_unit_id, date)` key — and only this table — that every
   * capacity consumer (`lockForCapacity`) locks first. The identical lock
   * order is what lets a removal decision serialize with a hold, block,
   * reservation or capacity edit on that date without deadlocking.
   *
   * @returns {Promise<{id: number}|null>}
   */
  async lockByUnitDate(bookableUnitId, date, connection) {
    const [rows] = await connection.query(
      `SELECT id FROM availability_calendar
       WHERE bookable_unit_id = ? AND \`date\` = ?
       FOR UPDATE`,
      [bookableUnitId, date],
    );
    return rows[0] ?? null;
  }

  /** @returns {Promise<number>} how many rows were actually deleted. */
  async remove(id, connection = this.#pool) {
    const [result] = await connection.query(
      'DELETE FROM availability_calendar WHERE id = ?',
      [id],
    );
    return result.affectedRows;
  }

  async listForUnit(bookableUnitId, { from, to }, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED}
       WHERE ac.bookable_unit_id = ? AND ac.date >= ? AND ac.date <= ?
       ORDER BY ac.date ASC`,
      [bookableUnitId, from, to],
    );
    return rows.map(toDomain);
  }

  /**
   * Materializes (if absent) then row-locks one unit's one-date entry for
   * a capacity-changing write — Sprint 10's `AvailabilityService
   * .reserveCapacity`/`releaseCapacity`. Must run inside the caller's
   * transaction (`connection` is required, never defaults to the pool)
   * so the `FOR UPDATE` lock is held for the write that follows.
   *
   * The no-op `ON DUPLICATE KEY UPDATE id = id` exists purely to acquire
   * the row (and its next-key gap lock, blocking a concurrent insert for
   * the same date) without disturbing a pre-existing row's real
   * `status_id`/`quantity_available` — a fresh row starts at `AVAILABLE`/
   * `defaultCapacity` only when it didn't already exist.
   *
   * @returns {Promise<{id: number, statusCode: string, quantityAvailable: number}>}
   */
  async lockForCapacity(
    { bookableUnitId, date, availableStatusId, defaultCapacity },
    connection,
  ) {
    try {
      await connection.query(
        `INSERT INTO availability_calendar (bookable_unit_id, \`date\`, status_id, quantity_available)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [bookableUnitId, date, availableStatusId, defaultCapacity],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }

    const [rows] = await connection.query(
      `SELECT ac.id, ac.quantity_available, ast.code AS status_code
       ${FROM_JOINED}
       WHERE ac.bookable_unit_id = ? AND ac.date = ?
       FOR UPDATE`,
      [bookableUnitId, date],
    );
    const row = rows[0];
    return {
      id: row.id,
      statusCode: row.status_code,
      quantityAvailable: row.quantity_available ?? defaultCapacity,
    };
  }

  /** Per-date `price_override_amount`/currency for a range — Sprint 10 pricing (§6 of the approved proposal). */
  async listPricesForUnit(
    bookableUnitId,
    { from, to },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT ac.date, ac.price_override_amount, cur.code AS currency_code
       FROM availability_calendar ac
       LEFT JOIN currencies cur ON cur.id = ac.price_override_currency_id
       WHERE ac.bookable_unit_id = ? AND ac.date >= ? AND ac.date <= ?
       ORDER BY ac.date ASC`,
      [bookableUnitId, from, to],
    );
    return rows.map((row) => ({
      date: toDateString(row.date),
      amount: row.price_override_amount,
      currencyCode: row.currency_code,
    }));
  }

  /** Owner/admin management view — cross-unit/listing, cursor-paginated. */
  async list(
    filters = {},
    { cursor = null, limit = 20 } = {},
    connection = this.#pool,
  ) {
    const conditions = ['1=1'];
    const params = [];

    if (filters.unitId !== undefined) {
      conditions.push('ac.bookable_unit_id = ?');
      params.push(filters.unitId);
    }
    if (filters.listingId !== undefined) {
      conditions.push('bu.listing_id = ?');
      params.push(filters.listingId);
    }
    if (filters.partnerId !== undefined) {
      conditions.push('l.partner_id = ?');
      params.push(filters.partnerId);
    }
    if (filters.from !== undefined) {
      conditions.push('ac.date >= ?');
      params.push(filters.from);
    }
    if (filters.to !== undefined) {
      conditions.push('ac.date <= ?');
      params.push(filters.to);
    }

    const decoded = decodeCursor(cursor);
    if (decoded?.id) {
      conditions.push('ac.id < ?');
      params.push(decoded.id);
    }

    const [rows] = await connection.query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINED}
       JOIN bookable_units bu ON bu.id = ac.bookable_unit_id AND bu.deleted_at IS NULL
       JOIN listings l ON l.id = bu.listing_id AND l.deleted_at IS NULL
       WHERE ${conditions.join(' AND ')}
       ORDER BY ac.id DESC
       LIMIT ?`,
      [...params, limit + 1],
    );

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      id: row.id,
    }));
    return { rows: pageRows.map(toDomain), meta };
  }
}

export default MySqlAvailabilityCalendarRepository;

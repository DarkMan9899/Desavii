/**
 * MySQL-backed InventoryBlock repository (Phase 17 §11-12).
 *
 * Owns `inventory_blocks` — manual, quantity-aware capacity blocks
 * (maintenance/owner-use/etc.), deliberately NOT `bookings` rows. A
 * block's actual capacity effect is applied by `AvailabilityService`
 * through the same `availability_calendar`/`lockForCapacity` path every
 * other consumer uses; this repository only persists the block record
 * itself (`released_at IS NULL` = currently active).
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookableUnitId: row.bookable_unit_id,
    dateFrom: toDateString(row.date_from),
    dateTo: toDateString(row.date_to),
    quantity: row.quantity,
    reasonCode: row.reason_code,
    notes: row.notes,
    releasedAt: row.released_at,
    releasedBy: row.released_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlInventoryBlockRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async create(
    {
      bookableUnitId,
      dateFrom,
      dateTo,
      quantity,
      reasonCode,
      notes,
      createdBy,
    },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO inventory_blocks
          (bookable_unit_id, date_from, date_to, quantity, reason_code, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          bookableUnitId,
          dateFrom,
          dateTo,
          quantity,
          reasonCode,
          notes ?? null,
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
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, reason_code, notes,
              released_at, released_by, created_by, created_at, updated_at
       FROM inventory_blocks WHERE id = ?`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /** The block row, locked for the rest of the transaction (an edit). */
  async findByIdForUpdate(id, connection) {
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, reason_code, notes,
              released_at, released_by, created_by, created_at, updated_at
       FROM inventory_blocks WHERE id = ? FOR UPDATE`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /** Rewrites an active block's dates, quantity, reason and notes. */
  async update(
    id,
    { dateFrom, dateTo, quantity, reasonCode, notes },
    connection = this.#pool,
  ) {
    try {
      await connection.query(
        `UPDATE inventory_blocks
         SET date_from = ?, date_to = ?, quantity = ?, reason_code = ?, notes = ?
         WHERE id = ? AND released_at IS NULL`,
        [dateFrom, dateTo, quantity, reasonCode, notes ?? null, id],
      );
    } catch (err) {
      throw mapMysqlError(err);
    }
    return this.findById(id, connection);
  }

  /**
   * Marks a still-active block released. Returns whether THIS call released
   * it: the guarded UPDATE locks the row, so a racing release waits, then
   * matches nothing and gets `false` — callers must restore capacity only
   * on `true`, never twice for one block.
   */
  async release(id, releasedBy, connection = this.#pool) {
    const [result] = await connection.query(
      `UPDATE inventory_blocks SET released_at = CURRENT_TIMESTAMP(3), released_by = ?
       WHERE id = ? AND released_at IS NULL`,
      [releasedBy, id],
    );
    return result.affectedRows === 1;
  }

  /** Active blocks overlapping a date range for a unit — used to render the availability grid's "manual" breakdown. */
  async listActiveForUnit(
    bookableUnitId,
    { from, to },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, reason_code, notes,
              released_at, released_by, created_by, created_at, updated_at
       FROM inventory_blocks
       WHERE bookable_unit_id = ? AND released_at IS NULL
         AND date_from <= ? AND date_to >= ?
       ORDER BY date_from ASC`,
      [bookableUnitId, to, from],
    );
    return rows.map(toDomain);
  }

  /** Every block (active or released) for a listing's units — Partner "Manual blocks" list view. */
  async listForUnits(bookableUnitIds, connection = this.#pool) {
    if (bookableUnitIds.length === 0) return [];
    const placeholders = bookableUnitIds.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, reason_code, notes,
              released_at, released_by, created_by, created_at, updated_at
       FROM inventory_blocks
       WHERE bookable_unit_id IN (${placeholders})
       ORDER BY created_at DESC`,
      bookableUnitIds,
    );
    return rows.map(toDomain);
  }
}

export default MySqlInventoryBlockRepository;

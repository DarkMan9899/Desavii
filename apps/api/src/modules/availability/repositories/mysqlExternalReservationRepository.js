/**
 * MySQL-backed ExternalReservation repository (Phase 17 §10, §19-21).
 *
 * Owns `external_reservations` — normalized occupancy recorded by a
 * human (phone/walk-in/OTA-told-us-by-phone) or imported by a connector
 * (`connection_id` set, deduplicated on `(connection_id,
 * external_event_uid)`). Same "this repository only persists the record;
 * `AvailabilityService` applies the actual capacity effect" split as
 * `MySqlInventoryBlockRepository`.
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
    sourceCode: row.source_code,
    externalReference: row.external_reference,
    guestName: row.guest_name,
    guestPhone: row.guest_phone,
    guestEmail: row.guest_email,
    notes: row.notes,
    connectionId: row.connection_id,
    externalEventUid: row.external_event_uid,
    cancelledAt: row.cancelled_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlExternalReservationRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  async create(
    {
      bookableUnitId,
      dateFrom,
      dateTo,
      quantity = 1,
      sourceCode,
      externalReference,
      guestName,
      guestPhone,
      guestEmail,
      notes,
      connectionId = null,
      externalEventUid = null,
      createdBy = null,
    },
    connection = this.#pool,
  ) {
    try {
      const [result] = await connection.query(
        `INSERT INTO external_reservations
          (bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
           guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bookableUnitId,
          dateFrom,
          dateTo,
          quantity,
          sourceCode,
          externalReference ?? null,
          guestName ?? null,
          guestPhone ?? null,
          guestEmail ?? null,
          notes ?? null,
          connectionId,
          externalEventUid,
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
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
              guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid,
              cancelled_at, created_by, created_at, updated_at
       FROM external_reservations WHERE id = ?`,
      [id],
    );
    return toDomain(rows[0]);
  }

  /**
   * Idempotency lookup for connector imports — `null` when no row with
   * this `(connectionId, externalEventUid)` pair exists yet, so the
   * caller can decide create-vs-skip-vs-update.
   */
  async findByConnectionAndUid(
    connectionId,
    externalEventUid,
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
              guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid,
              cancelled_at, created_by, created_at, updated_at
       FROM external_reservations WHERE connection_id = ? AND external_event_uid = ?`,
      [connectionId, externalEventUid],
    );
    return toDomain(rows[0]);
  }

  /**
   * Sprint D-1 (P0-4): moves an existing reservation to a new
   * unit/date/quantity in place — the connector-sync counterpart to a
   * connector re-importing the same `(connectionId, externalEventUid)`
   * with different data. Callers move the actual capacity effect
   * (restore old interval, consume new interval) themselves before
   * calling this; this method only persists the row's new shape.
   */
  async update(
    id,
    { bookableUnitId, dateFrom, dateTo, quantity },
    connection = this.#pool,
  ) {
    await connection.query(
      `UPDATE external_reservations
       SET bookable_unit_id = ?, date_from = ?, date_to = ?, quantity = ?
       WHERE id = ?`,
      [bookableUnitId, dateFrom, dateTo, quantity, id],
    );
    return this.findById(id, connection);
  }

  async cancel(id, connection = this.#pool) {
    await connection.query(
      `UPDATE external_reservations SET cancelled_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND cancelled_at IS NULL`,
      [id],
    );
    return this.findById(id, connection);
  }

  async listActiveForUnit(
    bookableUnitId,
    { from, to },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
              guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid,
              cancelled_at, created_by, created_at, updated_at
       FROM external_reservations
       WHERE bookable_unit_id = ? AND cancelled_at IS NULL
         AND date_from <= ? AND date_to >= ?
       ORDER BY date_from ASC`,
      [bookableUnitId, to, from],
    );
    return rows.map(toDomain);
  }

  async listForUnits(bookableUnitIds, connection = this.#pool) {
    if (bookableUnitIds.length === 0) return [];
    const placeholders = bookableUnitIds.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
              guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid,
              cancelled_at, created_by, created_at, updated_at
       FROM external_reservations
       WHERE bookable_unit_id IN (${placeholders})
       ORDER BY created_at DESC`,
      bookableUnitIds,
    );
    return rows.map(toDomain);
  }

  /** Every still-active row for one connection — used by reconciliation to detect removed external events. */
  async listActiveForConnection(connectionId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT id, bookable_unit_id, date_from, date_to, quantity, source_code, external_reference,
              guest_name, guest_phone, guest_email, notes, connection_id, external_event_uid,
              cancelled_at, created_by, created_at, updated_at
       FROM external_reservations
       WHERE connection_id = ? AND cancelled_at IS NULL`,
      [connectionId],
    );
    return rows.map(toDomain);
  }
}

export default MySqlExternalReservationRepository;

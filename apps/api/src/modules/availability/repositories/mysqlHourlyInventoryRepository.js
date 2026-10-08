/**
 * Step L6.3B — MySQL-backed timed inventory for hourly hotel stays
 * (`hourly_inventory_reservations`, migration 0054).
 *
 * One row per held room for one hourly hold (quantity 1, linked to its
 * `reservation_holds` row), transferred to the booking item when the hold
 * is booked. Rows are never deleted: `released_at` marks a row that no
 * longer occupies the room (hold released/expired, booking cancelled or
 * rejected), keeping the history auditable.
 *
 * Every capacity DECISION reads through `lockActiveForUnitDate`, a locking
 * read (`FOR UPDATE`) made while the caller already holds that unit/date's
 * `availability_calendar` row lock — so it always sees the latest committed
 * reservations, never a stale transaction snapshot.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { toDateString } from '../../../infrastructure/database/dateFormat.js';
import { parseWholeHour } from '../../../core/domain/hourlyStay.js';

export const HOURLY_SOURCE_TYPES = Object.freeze({
  HOLD: 'TRAVELHUB_HOLD',
  BOOKING: 'TRAVELHUB_BOOKING',
});

function toDomain(row) {
  return {
    id: row.id,
    bookableUnitId: row.bookable_unit_id,
    date: toDateString(row.date),
    startHour: parseWholeHour(String(row.start_time)),
    endHour: parseWholeHour(String(row.end_time)),
    quantity: row.quantity,
    sourceType: row.source_type,
    reservationHoldId: row.reservation_hold_id,
    bookingItemId: row.booking_item_id,
  };
}

export class MySqlHourlyInventoryRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /** Every active timed reservation of one unit on one date, row-locked. */
  async lockActiveForUnitDate(bookableUnitId, date, connection) {
    const [rows] = await connection.query(
      `SELECT * FROM hourly_inventory_reservations
       WHERE bookable_unit_id = ? AND date = ? AND released_at IS NULL
       ORDER BY id ASC
       FOR UPDATE`,
      [bookableUnitId, date],
    );
    return rows.map(toDomain);
  }

  /** Active timed reservations of one unit over a date range (read-only availability displays). */
  async listActiveForUnitRange(
    bookableUnitId,
    { from, to },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT * FROM hourly_inventory_reservations
       WHERE bookable_unit_id = ? AND date BETWEEN ? AND ? AND released_at IS NULL
       ORDER BY date ASC, id ASC`,
      [bookableUnitId, from, to],
    );
    return rows.map(toDomain);
  }

  /** One occupying row per held room, linked to its hold. */
  async reserveForHolds(
    { bookableUnitId, date, startTime, endTime, holdIds, actorUserId },
    connection,
  ) {
    if (holdIds.length === 0) return;
    await connection.query(
      `INSERT INTO hourly_inventory_reservations
        (bookable_unit_id, date, start_time, end_time, quantity, source_type,
         reservation_hold_id, actor_user_id)
       VALUES ?`,
      [
        holdIds.map((holdId) => [
          bookableUnitId,
          date,
          startTime,
          endTime,
          1,
          HOURLY_SOURCE_TYPES.HOLD,
          holdId,
          actorUserId,
        ]),
      ],
    );
  }

  /** Releases the active rows of these holds; returns how many were released. */
  async releaseForHolds(holdIds, reason, connection) {
    if (holdIds.length === 0) return 0;
    const [result] = await connection.query(
      `UPDATE hourly_inventory_reservations
       SET released_at = UTC_TIMESTAMP(3), release_reason = ?
       WHERE reservation_hold_id IN (?) AND source_type = ? AND released_at IS NULL`,
      [reason, holdIds, HOURLY_SOURCE_TYPES.HOLD],
    );
    return result.affectedRows;
  }

  /** Moves the active rows of consumed holds onto the booking item they became. */
  async transferHoldsToBookingItem({ holdIds, bookingItemId }, connection) {
    if (holdIds.length === 0) return 0;
    const [result] = await connection.query(
      `UPDATE hourly_inventory_reservations
       SET source_type = ?, booking_item_id = ?
       WHERE reservation_hold_id IN (?) AND source_type = ? AND released_at IS NULL`,
      [
        HOURLY_SOURCE_TYPES.BOOKING,
        bookingItemId,
        holdIds,
        HOURLY_SOURCE_TYPES.HOLD,
      ],
    );
    return result.affectedRows;
  }

  /** Releases a cancelled/rejected booking item's rows; returns how many were released. */
  async releaseForBookingItem(bookingItemId, reason, connection) {
    const [result] = await connection.query(
      `UPDATE hourly_inventory_reservations
       SET released_at = UTC_TIMESTAMP(3), release_reason = ?
       WHERE booking_item_id = ? AND released_at IS NULL`,
      [reason, bookingItemId],
    );
    return result.affectedRows;
  }
}

export default MySqlHourlyInventoryRepository;

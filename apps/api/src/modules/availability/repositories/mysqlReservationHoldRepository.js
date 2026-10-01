/**
 * MySQL-backed ReservationHold repository — Sprint 10 (Booking &
 * Reservation Holds Foundation).
 *
 * Owns `reservation_holds`, migrated in 0007 but unused until now.
 * Availability keeps owning this table (same as its other three) even
 * though the `booking-holds` module is its only caller today — mirrors
 * how `BookableUnitService` is a capability Availability owns and a
 * future per-type module calls, never a second table owner.
 *
 * **One row = one unit of capacity**, for one date range, held by one
 * user, until `expires_at`. There is no `quantity` column, so a hold of
 * quantity N is represented as N individual rows created together in one
 * transaction (`createMany`) — the caller's handle for the batch is the
 * literal array of ids `createMany` returns, never a re-derived guess.
 * Releasing/expiring restores capacity by however many of a hold's rows
 * still exist, so partial restoration is exact without needing to
 * remember a number anywhere.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { mapMysqlError } from '../../../infrastructure/database/errorMapping.js';
import {
  toDateString,
  toUtcInstant,
} from '../../../infrastructure/database/dateFormat.js';

/** `TIME` columns round-trip through mysql2 as `HH:MM:SS` strings already — trimmed to `HH:MM`, same convention as every other bookable-time repository in this codebase. */
function toTimeString(value) {
  return value ? String(value).slice(0, 5) : null;
}

function toDomain(row) {
  if (!row) return null;
  return {
    id: row.id,
    bookableUnitId: row.bookable_unit_id,
    userId: row.user_id,
    dateFrom: toDateString(row.start_date),
    dateTo: toDateString(row.end_date),
    // Sprint B (Car Rental Pickup/Return Interval): a customer-chosen
    // pickup/return time, present only for VEHICLE-type holds — `NULL`
    // for every other bookable unit type, which either has no time
    // concept (Hotel/Property/Restaurant) or derives its time from the
    // unit itself instead of the hold (Tour departures, see Sprint A).
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    // Step L6.2E: `expires_at` is written as UTC (`readHoldClock`).
    expiresAt: toUtcInstant(row.expires_at),
    createdAt: row.created_at,
  };
}

export class MySqlReservationHoldRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * Step L6.2E — the reservation clock, read from the DB in ONE statement so
   * `now` and the hold expiry derive from the same `UTC_TIMESTAMP(3)`
   * instant. Every hold check compares `expires_at` against
   * `UTC_TIMESTAMP(3)`, so the expiry must be UTC too: it is computed and
   * formatted DB-side and inserted back verbatim as a string — never a JS
   * `Date`, which `mysql2` would serialize in the host's LOCAL time (on a
   * UTC+4 host that made a 15-minute hold live 4h15m).
   *
   * @param {number} holdDurationMinutes
   * @returns {Promise<{now: Date, expiresAt: Date, expiresAtUtc: string}>}
   *   `now`/`expiresAt` as real instants; `expiresAtUtc` as the exact
   *   `YYYY-MM-DD HH:MM:SS.mmm` UTC value to store.
   */
  async readHoldClock(holdDurationMinutes, connection = this.#pool) {
    const [[row]] = await connection.query(
      `SELECT LEFT(DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%d %H:%i:%s.%f'), 23) AS now_utc,
              LEFT(DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE), '%Y-%m-%d %H:%i:%s.%f'), 23) AS expires_utc`,
      [holdDurationMinutes],
    );
    const toInstant = (utc) => new Date(`${utc.replace(' ', 'T')}Z`);
    return {
      now: toInstant(row.now_utc),
      expiresAt: toInstant(row.expires_utc),
      expiresAtUtc: row.expires_utc,
    };
  }

  /**
   * Step L6.2F — the current DB UTC instant alone (the same
   * `UTC_TIMESTAMP(3)` source as `readHoldClock`), for checks that need
   * "now" without creating a hold (booking conversion's past-start check).
   */
  async readUtcNow(connection = this.#pool) {
    const [[row]] = await connection.query(
      `SELECT LEFT(DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%d %H:%i:%s.%f'), 23) AS now_utc`,
    );
    return new Date(`${row.now_utc.replace(' ', 'T')}Z`);
  }

  /**
   * Inserts `count` identical rows (one per unit of capacity) in the
   * given range, one `INSERT` at a time within the caller's transaction —
   * safer than relying on multi-row `INSERT`'s auto-increment-continuity
   * guarantee to recover each row's id. `expiresAtUtc` is
   * `readHoldClock`'s DB-formatted UTC string, stored verbatim.
   *
   * @returns {Promise<number[]>} the created rows' ids, in insertion order
   */
  async createMany(
    {
      bookableUnitId,
      userId,
      dateFrom,
      dateTo,
      startTime,
      endTime,
      expiresAtUtc,
      count,
    },
    connection = this.#pool,
  ) {
    const ids = [];
    try {
      for (let i = 0; i < count; i += 1) {
        // eslint-disable-next-line no-await-in-loop -- each insert must observe the previous one under the same transaction/connection.
        const [result] = await connection.query(
          `INSERT INTO reservation_holds
            (bookable_unit_id, user_id, start_date, end_date, start_time, end_time, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            bookableUnitId,
            userId,
            dateFrom,
            dateTo,
            startTime ?? null,
            endTime ?? null,
            expiresAtUtc,
          ],
        );
        ids.push(result.insertId);
      }
    } catch (err) {
      throw mapMysqlError(err);
    }
    return ids;
  }

  async findByIds(ids, connection = this.#pool) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds WHERE id IN (${placeholders})`,
      ids,
    );
    return rows.map(toDomain);
  }

  /**
   * Step L6.2H4 — ownership- and expiry-scoped locking read: the caller's
   * still-active rows among `ids`, row-locked (`FOR UPDATE`) until the
   * caller's transaction ends. Consuming (booking) and releasing a hold both
   * start here, so two operations on the same hold serialize: the second
   * waits for the first to commit, then re-reads the current rows and finds
   * them gone. Must run on the caller's transaction connection.
   */
  async lockActiveByIds(ids, userId, connection) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds
       WHERE id IN (${placeholders}) AND user_id = ? AND expires_at > UTC_TIMESTAMP(3)
       ORDER BY id ASC
       FOR UPDATE`,
      [...ids, userId],
    );
    return rows.map(toDomain);
  }

  /**
   * Step L6.2H4 — the expiry sweep's locking read: which of `ids` are still
   * present and expired, row-locked. `SKIP LOCKED` leaves a row another
   * transaction is consuming/releasing right now to that transaction (it
   * deletes it) instead of restoring its capacity a second time. Point
   * lookups by primary key, so no gap locks are taken. Must run on the
   * caller's transaction connection.
   */
  async lockExpiredByIds(ids, connection) {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds
       WHERE id IN (${placeholders}) AND expires_at <= UTC_TIMESTAMP(3)
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED`,
      ids,
    );
    return rows.map(toDomain);
  }

  /** Active (non-expired) hold rows for one unit overlapping a date span — feeds Phase 17's per-day availability breakdown. */
  async listActiveForUnit(
    bookableUnitId,
    { from, to },
    connection = this.#pool,
  ) {
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds
       WHERE bookable_unit_id = ? AND expires_at > UTC_TIMESTAMP(3)
         AND start_date <= ? AND end_date >= ?
       ORDER BY start_date ASC`,
      [bookableUnitId, to, from],
    );
    return rows.map(toDomain);
  }

  async listActiveForUser(userId, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds
       WHERE user_id = ? AND expires_at > UTC_TIMESTAMP(3)
       ORDER BY bookable_unit_id ASC, start_date ASC, id ASC`,
      [userId],
    );
    return rows.map(toDomain);
  }

  /** @returns {Promise<number>} how many rows were actually deleted. */
  async deleteByIds(ids, connection = this.#pool) {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(', ');
    const [result] = await connection.query(
      `DELETE FROM reservation_holds WHERE id IN (${placeholders})`,
      ids,
    );
    return result.affectedRows;
  }

  /**
   * Expired rows, oldest-unit-first so the sweep job can group and lock
   * one `bookable_unit_id` at a time (`idx_reservation_holds_expires_at`
   * makes the `expires_at` scan cheap; ordering by unit afterward is an
   * in-memory sort of an already-small result set, not a second index).
   */
  async findExpired(limit, connection = this.#pool) {
    const [rows] = await connection.query(
      `SELECT * FROM reservation_holds
       WHERE expires_at <= UTC_TIMESTAMP(3)
       ORDER BY bookable_unit_id ASC
       LIMIT ?`,
      [limit],
    );
    return rows.map(toDomain);
  }
}

export default MySqlReservationHoldRepository;

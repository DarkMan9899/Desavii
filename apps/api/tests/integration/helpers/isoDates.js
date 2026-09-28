/**
 * Step L6.2E — ISO calendar-date helpers for integration fixtures.
 *
 * `addIsoDays` is pure `YYYY-MM-DD` arithmetic (UTC-anchored, so it never
 * depends on the Node process's timezone). `businessNow` is the current
 * Asia/Yerevan date and time read from the DB's own `UTC_TIMESTAMP(3)` — the same
 * clock and conversion customer holds are checked against
 * (`core/domain/bookingTimebase.js`), so a fixture built from it is never
 * "in the past" by accident and never drifts with the wall clock.
 */

import { toBusinessDateTime } from '../../../src/core/domain/bookingTimebase.js';

export function addIsoDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** @returns {Promise<{date: string, time: string}>} Asia/Yerevan now, DB-sourced */
export async function businessNow(pool) {
  const [[row]] = await pool.query(
    "SELECT LEFT(DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%f'), 23) AS now_utc",
  );
  return toBusinessDateTime(new Date(`${row.now_utc}Z`));
}

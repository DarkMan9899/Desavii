/**
 * MySQL `DATE`-column -> `YYYY-MM-DD` string conversion.
 *
 * `mysql2` (without an explicit `timezone` pool option) converts a `DATE`
 * column into a JS `Date` constructed at LOCAL midnight for that calendar
 * day — not UTC midnight. Reading it back with `.toISOString()` (a UTC
 * conversion) silently shifts the date whenever the process's local
 * timezone has a non-zero offset from UTC: any positive offset (e.g.
 * Armenia Standard Time, UTC+4, this platform's own home timezone) rolls
 * the date back by one day, since local midnight is still "yesterday" in
 * UTC. Reading the JS `Date`'s LOCAL getters instead of its UTC ones
 * exactly reverses the LOCAL construction `mysql2` performed, so the
 * round trip is correct regardless of the host's configured timezone.
 *
 * Every Repository converting a `DATE` column to a string must go
 * through this one function — duplicating it (as `mysqlAvailabilityCalendarRepository.js`/
 * `mysqlBlackoutRepository.js`/`mysqlReservationHoldRepository.js`/
 * `mysqlBookingRepository.js` each originally did) risks exactly this bug
 * recurring per copy.
 */

export function toDateString(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return value;
}

/**
 * Step L6.2E — a `DATETIME` column that is WRITTEN as UTC wall-clock (e.g.
 * `DATE_ADD(UTC_TIMESTAMP(3), ...)`) -> its real instant. `mysql2` (no
 * explicit `timezone` pool option) parses a `DATETIME` as LOCAL time, so the
 * resulting `Date` is off by the host's UTC offset; reading its LOCAL getters
 * back as UTC fields reverses that exactly, on any host timezone — the same
 * technique `toDateString` above uses for `DATE` columns.
 */
export function toUtcInstant(value) {
  if (!(value instanceof Date)) return value ?? null;
  return new Date(
    Date.UTC(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      value.getHours(),
      value.getMinutes(),
      value.getSeconds(),
      value.getMilliseconds(),
    ),
  );
}

export default toDateString;

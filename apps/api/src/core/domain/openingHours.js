/**
 * Opening hours — whether a reservation's wall-clock moment falls inside a
 * listing's published weekly hours (docs/BOOKING_WIDGET_REBUILD.md §10).
 *
 * Semantics:
 * - One window per weekday (`listing_opening_hours`), wall clock in the
 *   venue's time (Asia/Yerevan), `dayOfWeek` 0 = Sunday … 6 = Saturday.
 * - A window is half-open, `[opensAt, closesAt)`: the closing minute itself
 *   is outside it.
 * - `closesAt <= opensAt` runs past midnight into the next calendar date.
 *   Friday 18:00–02:00 covers Friday 18:00–23:59 and Saturday 00:00–01:59;
 *   18:00–00:00 ends exactly at midnight; equal times are a 24-hour window.
 * - A reservation names its real calendar date and time. It is inside the
 *   hours when that moment is in its own date's window, or in the
 *   after-midnight tail of the previous date's overnight window.
 * - A weekday without a row, or marked closed, has no window.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

const MINUTES_PER_HOUR = 60;

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` calendar date. */
function dayOfWeekOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function windowOf(weeklyHours, dayOfWeek) {
  const day = weeklyHours.find((entry) => entry.dayOfWeek === dayOfWeek);
  if (!day || day.isClosed || !day.opensAt || !day.closesAt) return null;
  const opens = toMinutes(day.opensAt);
  const closes = toMinutes(day.closesAt);
  return { opens, closes, overnight: closes <= opens };
}

/**
 * @param {Array<{dayOfWeek: number, opensAt: string|null, closesAt: string|null, isClosed: boolean}>} weeklyHours
 * @param {string} isoDate `YYYY-MM-DD`, the reservation's calendar date
 * @param {string} time `HH:MM` (or `HH:MM:SS`), its wall-clock time
 */
export function isWithinOpeningHours(weeklyHours, isoDate, time) {
  const minute = toMinutes(time);
  const dayOfWeek = dayOfWeekOf(isoDate);
  const own = windowOf(weeklyHours, dayOfWeek);
  if (own) {
    const insideOwn = own.overnight
      ? minute >= own.opens
      : minute >= own.opens && minute < own.closes;
    if (insideOwn) return true;
  }
  const previous = windowOf(weeklyHours, (dayOfWeek + 6) % 7);
  return Boolean(previous?.overnight && minute < previous.closes);
}

export default { isWithinOpeningHours };

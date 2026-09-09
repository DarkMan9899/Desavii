/**
 * Sprint D-2 (Partner Calendar source-aware UX), extracted from
 * `TimeSlotBlock.jsx`'s original inline `resolveStatus` so Month/Week's
 * date-only cells derive the SAME authoritative status a time-sliced
 * unit's Week/Day blocks already did — never a second, diverging
 * definition of "available."
 *
 * `resolveBreakdownStatus` reads only real breakdown fields
 * (`total`/`available`/`manual`, from `GET /availability/units/:id/
 * breakdown`) — never an invented status field.
 *
 * `resolveAuthoritativeDayStatus` layers the explicit
 * `availability_calendar.status_code` override on top: an owner can mark
 * a date BLOCKED (Set Availability tab) independently of `quantity_
 * available` (Sprint D-1 P0-1 made that write ledger-aware — a status-
 * only edit no longer clobbers real consumption, which also means a
 * BLOCKED day's raw capacity can still show > 0 available). D-0 flagged
 * this as the source of Month/Week's status sometimes visually
 * disagreeing with real bookable capacity; this function is the fix —
 * BLOCKED always wins over whatever the breakdown alone would say, and
 * everywhere else the breakdown decides.
 */

export function resolveBreakdownStatus(day) {
  if (!day) return null;
  if (day.total > 0 && day.manual >= day.total) return 'blocked';
  if (day.available <= 0) return 'full';
  if (day.available < day.total) return 'partial';
  return 'available';
}

export function resolveAuthoritativeDayStatus(statusCode, day) {
  if (statusCode === 'BLOCKED') return 'blocked';
  return resolveBreakdownStatus(day);
}

export default { resolveBreakdownStatus, resolveAuthoritativeDayStatus };

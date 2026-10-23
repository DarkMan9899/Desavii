/**
 * Pure date-grid helpers for the Week/Day calendar views (Partner
 * Workspace Sprint 5). UTC-anchored (`T00:00:00Z`) throughout, matching
 * `reservationEstimate.js#addDays`'s own convention — never local-`Date`
 * arithmetic, which is exactly the class of bug `dateFormat.js` (API
 * side) already had to fix once for `DATE`-column drift.
 *
 * "Today" is the Asia/Yerevan business date (`utils/businessDate.js`),
 * never the UTC date, which still reads yesterday between 00:00 and 04:00
 * in Yerevan (Calendar Excellence).
 *
 * The hour axis (`HOUR_ROWS`, 06:00-23:00) is a fixed display range, not
 * derived from data — a real operational calendar needs a stable axis to
 * scan, not one that jumps around based on which departures happen to
 * exist. Time-sliced units position themselves onto this fixed axis via
 * `timeToRow`; a slot outside 06:00-23:00 still renders (clamped), it
 * just wouldn't be common for this domain (tour/activity departures).
 */

import {
  addBusinessDays,
  getBusinessToday,
} from '../../../../utils/businessDate.js';

export const addDays = addBusinessDays;

/** Monday-first ISO week containing `iso`. */
export function startOfWeek(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(iso, diffToMonday);
}

export function weekDates(weekStartIso) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartIso, i));
}

export function todayIso(now = new Date()) {
  return getBusinessToday(now);
}

const HOUR_START = 6;
const HOUR_END = 23;

/** `["06:00", "07:00", ..., "23:00"]` — the fixed display axis for a time-sliced Week/Day view. */
export const HOUR_ROWS = Array.from(
  { length: HOUR_END - HOUR_START + 1 },
  (_, i) => `${String(HOUR_START + i).padStart(2, '0')}:00`,
);

/** `"09:30"` -> fractional row offset from `HOUR_START` (e.g. `3.5`). Clamped to the visible axis. */
export function timeToRowOffset(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const offset = h + m / 60 - HOUR_START;
  return Math.min(Math.max(offset, 0), HOUR_END - HOUR_START + 1);
}

export default {
  addDays,
  startOfWeek,
  weekDates,
  todayIso,
  HOUR_ROWS,
  timeToRowOffset,
};

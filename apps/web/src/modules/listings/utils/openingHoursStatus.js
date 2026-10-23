/**
 * openingHoursStatus — pure display/derivation utilities for a listing's
 * weekly opening hours (Pass 6, Restaurant vertical, owner issue #13).
 * Same "pure function operating directly on the API's own wire shape, its
 * own unit test file" convention `computeNights.js` (snake_case
 * `booking_items` fields) already establishes — no camelCase mapping
 * layer for a shape this small.
 *
 * `day_of_week` matches JS `Date#getDay()` (0=Sunday..6=Saturday), exactly
 * as the backend's `listing_opening_hours.day_of_week` does — no day-index
 * translation table on either side.
 *
 * "Is it open right now" is judged by the venue's own clock — Asia/
 * Yerevan, where every listing's hours are kept (`getBusinessWallClock`) —
 * never the viewer's: a visitor in New York at 16:00 must see a Yerevan
 * restaurant as it is at midnight there. Computed client-side, so it is
 * only as fresh as the moment the page rendered, like every other
 * non-live-updating status this app shows.
 */

import { getBusinessWallClock } from '../../../utils/businessDate.js';

// 2023-01-01 was a Sunday — used purely as a stable Sunday reference date
// to resolve a locale's own real weekday name; UTC avoids any local-
// timezone day-shift on the lookup itself.
const REFERENCE_SUNDAY_UTC_MS = Date.UTC(2023, 0, 1);
const ONE_DAY_MS = 86_400_000;

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * @param {Array<{day_of_week:number, opens_at:string|null, closes_at:string|null, is_closed:boolean}>} weeklyHours
 * @param {number} dayOfWeek
 */
function findDay(weeklyHours, dayOfWeek) {
  return weeklyHours.find((day) => day.day_of_week === dayOfWeek) ?? null;
}

/**
 * Whether `minutesSinceMidnight` on `dayOfWeek` falls inside a given day's
 * open window — including a window that runs past midnight (`closes_at`
 * earlier than `opens_at`, e.g. 18:00-02:00), which is checked from BOTH
 * the day it starts on and the day it spills into.
 */
function isOpenAt(weeklyHours, dayOfWeek, minutesSinceMidnight) {
  const today = findDay(weeklyHours, dayOfWeek);
  if (today && !today.is_closed && today.opens_at && today.closes_at) {
    const opens = toMinutes(today.opens_at);
    const closes = toMinutes(today.closes_at);
    const spansMidnight = closes <= opens;
    if (spansMidnight) {
      if (minutesSinceMidnight >= opens) return true;
    } else if (minutesSinceMidnight >= opens && minutesSinceMidnight < closes) {
      return true;
    }
  }
  const yesterday = findDay(weeklyHours, (dayOfWeek + 6) % 7);
  if (
    yesterday &&
    !yesterday.is_closed &&
    yesterday.opens_at &&
    yesterday.closes_at
  ) {
    const opens = toMinutes(yesterday.opens_at);
    const closes = toMinutes(yesterday.closes_at);
    if (closes <= opens && minutesSinceMidnight < closes) return true;
  }
  return false;
}

/**
 * @returns {'OPEN'|'CLOSED'|'UNKNOWN'} 'UNKNOWN' when nothing has been
 * authored at all — never guessed as closed, per this pass's "handle
 * empty states honestly" rule.
 */
export function computeOpenNowStatus(weeklyHours, now = new Date()) {
  if (!weeklyHours || weeklyHours.length === 0) return 'UNKNOWN';
  const { dayOfWeek, minutesSinceMidnight } = getBusinessWallClock(now);
  return isOpenAt(weeklyHours, dayOfWeek, minutesSinceMidnight)
    ? 'OPEN'
    : 'CLOSED';
}

/** Locale-real weekday name (e.g. "Monday" / "Երկուշաբթի" / "понедельник") — never a hardcoded i18n table. */
export function getWeekdayName(dayOfWeek, locale, style = 'long') {
  const date = new Date(REFERENCE_SUNDAY_UTC_MS + dayOfWeek * ONE_DAY_MS);
  return new Intl.DateTimeFormat(locale, {
    weekday: style,
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Today's authored hours by the venue's clock: `{ isClosed, opensAt,
 * closesAt }`, or `null` when nothing is published for today.
 */
export function findTodaysHours(weeklyHours, now = new Date()) {
  const day = findDay(weeklyHours ?? [], getBusinessWallClock(now).dayOfWeek);
  if (!day) return null;
  return {
    isClosed: day.is_closed,
    opensAt: day.opens_at,
    closesAt: day.closes_at,
  };
}

/** Rows for a full-week display, Monday-first (the common convention this app's DatePicker already follows), each day either its authored hours, closed, or "not published" when no row exists at all. */
export function buildWeeklyScheduleRows(weeklyHours, locale) {
  const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];
  return MONDAY_FIRST_ORDER.map((dayOfWeek) => {
    const day = findDay(weeklyHours ?? [], dayOfWeek);
    return {
      dayOfWeek,
      label: getWeekdayName(dayOfWeek, locale),
      isClosed: day?.is_closed ?? null,
      opensAt: day?.opens_at ?? null,
      closesAt: day?.closes_at ?? null,
      isPublished: day !== null,
    };
  });
}

export default {
  computeOpenNowStatus,
  findTodaysHours,
  getWeekdayName,
  buildWeeklyScheduleRows,
};

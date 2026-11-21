/**
 * restaurantTimeSlots — the reservation times a restaurant offers on one
 * calendar date (docs/BOOKING_WIDGET_REBUILD.md §4 W-09, §10).
 *
 * Date semantics, identical to the server's (`core/domain/openingHours.js`,
 * enforced at hold time as RESERVATION_OUTSIDE_OPENING_HOURS):
 * - the guest picks the real calendar date of their arrival, wall clock
 *   in the venue's time (Asia/Yerevan);
 * - a window is half-open, `[opens_at, closes_at)`, offered in fixed steps
 *   from its opening;
 * - a window whose `closes_at <= opens_at` runs past midnight: Friday
 *   18:00–02:00 offers Friday 18:00–23:30 on Friday, and its after-midnight
 *   tail 00:00–01:30 on Saturday, before Saturday's own opening;
 * - on the venue's today, times already past are left out.
 *
 * `null` means the restaurant has published no hours at all: the panel then
 * falls back to a free time field, and the server does not restrict it.
 */

import {
  getBusinessToday,
  getBusinessWallClock,
} from '../../../utils/businessDate.js';

export const RESERVATION_SLOT_MINUTES = 30;

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function toMinutes(hhmm) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function toTime(minutes) {
  const hours = String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0');
  const rest = String(minutes % MINUTES_PER_HOUR).padStart(2, '0');
  return `${hours}:${rest}`;
}

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` calendar date. */
function dayOfWeekOf(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

function windowOf(weeklyHours, dayOfWeek) {
  const day = weeklyHours.find((entry) => entry.day_of_week === dayOfWeek);
  if (!day || day.is_closed || !day.opens_at || !day.closes_at) return null;
  const opens = toMinutes(day.opens_at);
  const closes = toMinutes(day.closes_at);
  return { opens, closes, overnight: closes <= opens };
}

function steps(from, toExclusive) {
  const minutes = [];
  for (let m = from; m < toExclusive; m += RESERVATION_SLOT_MINUTES) {
    minutes.push(m);
  }
  return minutes;
}

/**
 * @param {Array<{day_of_week:number, opens_at:string|null, closes_at:string|null, is_closed:boolean}>|null} weeklyHours
 * @param {string|null} isoDate
 * @param {Date} [now]
 * @returns {string[]|null} `HH:MM` times in order, or `null` when no hours exist
 */
export function buildReservationTimes(weeklyHours, isoDate, now = new Date()) {
  if (!weeklyHours || weeklyHours.length === 0) return null;
  if (!isoDate) return [];
  const dayOfWeek = dayOfWeekOf(isoDate);
  const own = windowOf(weeklyHours, dayOfWeek);
  const previous = windowOf(weeklyHours, (dayOfWeek + 6) % 7);

  const tail = previous?.overnight ? steps(0, previous.closes) : [];
  let ownSteps = [];
  if (own) {
    ownSteps = steps(own.opens, own.overnight ? MINUTES_PER_DAY : own.closes);
  }
  const earliest =
    isoDate === getBusinessToday(now)
      ? getBusinessWallClock(now).minutesSinceMidnight + 1
      : 0;

  return [...new Set([...tail, ...ownSteps])]
    .filter((minute) => minute >= earliest)
    .sort((a, b) => a - b)
    .map(toTime);
}

/**
 * The closing time of the date's own window when it runs past midnight
 * (`"02:00"`), so the panel can say those times are on the next date;
 * `null` otherwise (including a window ending exactly at midnight).
 */
export function closingAfterMidnight(weeklyHours, isoDate) {
  if (!weeklyHours?.length || !isoDate) return null;
  const own = windowOf(weeklyHours, dayOfWeekOf(isoDate));
  if (!own?.overnight || own.closes === 0) return null;
  return toTime(own.closes);
}

export default buildReservationTimes;

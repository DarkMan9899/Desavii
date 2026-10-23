/**
 * Step L6.2E — the platform's business calendar date.
 *
 * Every listing is in Armenia today, so "today" for booking purposes is the
 * Asia/Yerevan calendar date — never the browser's local date and never the
 * UTC date (`new Date().toISOString().slice(0, 10)` still reads yesterday
 * between 00:00 and 04:00 in Yerevan). Mirrors the backend's
 * `core/domain/bookingTimebase.js`, which is the real authority; this only
 * keeps the date pickers honest. Before listings outside Armenia exist, the
 * listing's own timezone must replace this constant.
 */

export const BUSINESS_TIMEZONE = 'Asia/Yerevan';

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** @returns {string} `YYYY-MM-DD` — the Asia/Yerevan date at `now`. */
export function getBusinessToday(now = new Date()) {
  return BUSINESS_DATE_FORMATTER.format(now);
}

const BUSINESS_WALL_CLOCK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const MINUTES_PER_HOUR = 60;

/**
 * The Asia/Yerevan wall clock at `now` — what a venue's opening hours are
 * kept in. A visitor elsewhere must see whether the place is open by
 * Yerevan's clock, never by their own.
 * @returns {{ dayOfWeek: number, minutesSinceMidnight: number }}
 *   `dayOfWeek` as `Date#getDay()` (0 = Sunday)
 */
export function getBusinessWallClock(now = new Date()) {
  const parts = Object.fromEntries(
    BUSINESS_WALL_CLOCK_FORMATTER.formatToParts(now).map((part) => [
      part.type,
      part.value,
    ]),
  );
  return {
    dayOfWeek: WEEKDAY_INDEX[parts.weekday],
    minutesSinceMidnight:
      Number(parts.hour) * MINUTES_PER_HOUR + Number(parts.minute),
  };
}

/**
 * `days` calendar days after (or before, when negative) a `YYYY-MM-DD`
 * date. Date-only arithmetic anchored at UTC midnight, so no timezone can
 * shift the result — e.g. a window `getBusinessToday()` … `+29` days.
 */
export function addBusinessDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default getBusinessToday;

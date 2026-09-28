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

export default getBusinessToday;

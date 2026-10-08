/**
 * Step L6.2F — evaluation of a listing's Partner-authored booking rules
 * (`listing_booking_rules`) for one CUSTOMER booking request. Pure: no I/O,
 * no clock — `now` is the DB-sourced instant the caller already read
 * (`AvailabilityService#readReservationClock`), and every timezone step goes
 * through `bookingTimebase.js` (Asia/Yerevan business time).
 *
 * Applicability (locked):
 * - minimum/maximum stay apply to HOTEL and PROPERTY as lodging NIGHTS
 *   (`dateTo - dateFrom`, checkout day excluded) and to CAR_RENTAL as rental
 *   DAYS (inclusive calendar days; pickup/return times never change the
 *   count). Every other listing type ignores them, even when legacy hidden
 *   values are stored.
 * - advance minimum hours / maximum days apply to every listing type.
 * - Step L6.3B: an hourly hotel stay (`isHourlyStay`) is measured in hours,
 *   never nights — the nightly minimum/maximum stay does not apply to it
 *   (the room's own hourly minimum/maximum duration does, see
 *   `hourlyStay.js`); the advance rules apply to its exact start time.
 *
 * Semantics:
 * - `null` = no restriction; a stay value is never 0.
 * - advance minimum: the booking start (its exact time, or 00:00 Asia/Yerevan
 *   for a date-only start) must be at least N hours after `now`; the exact
 *   boundary is accepted. 0 = no lead time.
 * - advance maximum: a CALENDAR-day rule — the start DATE must be on or
 *   before today's Asia/Yerevan date + N. 0 = today only.
 *
 * Only customer holds are evaluated (`AvailabilityService#reserveCapacity`);
 * Partner inventory writes never are, and a granted hold is never
 * re-evaluated at checkout (a rule edit doesn't invalidate an active hold).
 */

import { toBusinessDateTime } from './bookingTimebase.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** How a listing type measures a stay, or `null` when stay rules don't apply. */
export const STAY_RULE_UNIT_BY_LISTING_TYPE = Object.freeze({
  HOTEL: 'nights',
  PROPERTY: 'nights',
  CAR_RENTAL: 'days',
});

export function getStayRuleUnit(listingTypeCode) {
  return STAY_RULE_UNIT_BY_LISTING_TYPE[listingTypeCode] ?? null;
}

function calendarDaysBetween(fromIsoDate, toIsoDate) {
  return Math.round(
    (Date.parse(`${toIsoDate}T00:00:00Z`) -
      Date.parse(`${fromIsoDate}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

function addCalendarDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Lodging nights (checkout excluded) or inclusive rental days. */
export function computeStayLength(unit, dateFrom, dateTo) {
  const span = calendarDaysBetween(dateFrom, dateTo);
  return unit === 'days' ? span + 1 : span;
}

function toWallClock(start) {
  const time = start.time ? start.time : '00:00:00';
  const withSeconds = time.length === 5 ? `${time}:00` : time.slice(0, 8);
  return `${start.date}T${withSeconds}`;
}

/**
 * @param {{
 *   listingTypeCode: string,
 *   dateFrom: string,
 *   dateTo: string,
 *   start: {date: string, time: string|null},
 *   rules: {minimumStayNights?: number|null, maximumStayNights?: number|null,
 *           advanceBookingMinHours?: number|null, advanceBookingMaxDays?: number|null}|null,
 *   now: Date,
 *   isHourlyStay?: boolean,
 * }} input
 * @returns {Array<object>} violations as validation details (`issue` plus its
 *   safe metadata), empty when the booking satisfies every applicable rule
 */
export function evaluateBookingRules({
  listingTypeCode,
  dateFrom,
  dateTo,
  start,
  rules,
  now,
  isHourlyStay = false,
}) {
  if (!rules) return [];
  const violations = [];

  const stayUnit = isHourlyStay ? null : getStayRuleUnit(listingTypeCode);
  if (stayUnit) {
    const length = computeStayLength(stayUnit, dateFrom, dateTo);
    const { minimumStayNights: minimum, maximumStayNights: maximum } = rules;
    if (minimum != null && length < minimum) {
      violations.push({
        issue: 'MINIMUM_STAY_NOT_MET',
        minimum,
        unit: stayUnit,
      });
    }
    if (maximum != null && length > maximum) {
      violations.push({
        issue: 'MAXIMUM_STAY_EXCEEDED',
        maximum,
        unit: stayUnit,
      });
    }
  }

  const { advanceBookingMinHours: minimumHours } = rules;
  if (minimumHours != null && minimumHours > 0) {
    const earliest = toBusinessDateTime(
      new Date(now.getTime() + minimumHours * MS_PER_HOUR),
    );
    if (toWallClock(start) < `${earliest.date}T${earliest.time}`) {
      violations.push({ issue: 'BOOKING_TOO_SOON', minimumHours });
    }
  }

  const { advanceBookingMaxDays: maximumDays } = rules;
  if (maximumDays != null) {
    const latestDate = addCalendarDays(
      toBusinessDateTime(now).date,
      maximumDays,
    );
    if (start.date > latestDate) {
      violations.push({ issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays });
    }
  }

  return violations;
}

export default {
  STAY_RULE_UNIT_BY_LISTING_TYPE,
  getStayRuleUnit,
  computeStayLength,
  evaluateBookingRules,
};

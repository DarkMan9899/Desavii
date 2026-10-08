/**
 * Step L6.3B — the hourly hotel stay contract, in one place.
 *
 * Hourly booking is an opt-in a Partner enables on ONE `HOTEL_ROOM` unit;
 * every room is nightly-only by default and nightly stays never change.
 * An hourly stay is:
 * - one business date (Asia/Yerevan), never across midnight;
 * - whole-hour boundaries — `HH:00`, with `24:00` meaning the end of the day
 *   (end and window-end only);
 * - a duration within the room's minimum..maximum whole hours;
 * - inside the room's daily window `[availableFrom, availableUntil)`.
 *
 * Inventory is the half-open interval `[start, end)`: 14:00–16:00 and
 * 16:00–18:00 do not overlap; 14:00–16:00 and 15:00–17:00 do. Whole hours
 * make occupancy exact per hour slot, so a request's peak is the busiest
 * hour it covers.
 *
 * Price: hourly rate × hours × rooms (guests never multiply a hotel price).
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { toBusinessDateTime } from './bookingTimebase.js';
import { isAccommodationUnitType } from './accommodationDateSemantics.js';

export const BOOKING_MODES = Object.freeze({
  NIGHTLY: 'NIGHTLY',
  HOURLY: 'HOURLY',
});

/** The only unit type that can offer hourly stays in this version. */
export const HOURLY_BOOKING_UNIT_TYPE = 'HOTEL_ROOM';

export const HOURS_PER_DAY = 24;

/** Issue codes for an hourly request the contract rejects (`items[].issue`). */
export const HOURLY_STAY_ISSUES = Object.freeze({
  NOT_SUPPORTED: 'HOURLY_BOOKING_NOT_SUPPORTED',
  TIME_INVALID: 'HOURLY_TIME_INVALID',
  CROSS_MIDNIGHT: 'HOURLY_CROSS_MIDNIGHT_NOT_SUPPORTED',
  DURATION_OUT_OF_RANGE: 'HOURLY_DURATION_OUT_OF_RANGE',
  OUTSIDE_WINDOW: 'HOURLY_TIME_OUTSIDE_WINDOW',
});

/** Issue codes for a Partner's hourly room configuration. */
export const HOURLY_CONFIG_ISSUES = Object.freeze({
  INCOMPLETE: 'HOURLY_CONFIG_INCOMPLETE',
  DURATION_RANGE_INVALID: 'HOURLY_DURATION_RANGE_INVALID',
  WINDOW_INVALID: 'HOURLY_WINDOW_INVALID',
});

const WHOLE_HOUR_PATTERN = /^([01]\d|2[0-4]):00(:00)?$/;

/**
 * The whole hour a time names (`"14:00"`/`"14:00:00"` -> 14, `"24:00"` ->
 * 24), or `null` for anything that is not an exact hour boundary.
 */
export function parseWholeHour(time) {
  if (typeof time !== 'string' || !WHOLE_HOUR_PATTERN.test(time)) return null;
  const hour = Number(time.slice(0, 2));
  return hour <= HOURS_PER_DAY ? hour : null;
}

/** `14` -> `"14:00"` — the canonical `HH:MM` form used in API payloads. */
export function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Half-open interval overlap: `[aStart, aEnd)` and `[bStart, bEnd)` share time. */
export function intervalsOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * The busiest hour of `[startHour, endHour)` given existing timed
 * reservations (`{ startHour, endHour, quantity }`): the largest number of
 * rooms already occupied in any single hour slot of the request.
 */
export function peakOccupiedQuantity(reservations, startHour, endHour) {
  let peak = 0;
  for (let hour = startHour; hour < endHour; hour += 1) {
    const occupied = reservations.reduce(
      (sum, reservation) =>
        intervalsOverlap(
          hour,
          hour + 1,
          reservation.startHour,
          reservation.endHour,
        )
          ? sum + reservation.quantity
          : sum,
      0,
    );
    peak = Math.max(peak, occupied);
  }
  return peak;
}

/**
 * Validates a Partner's EFFECTIVE hourly configuration (stored values merged
 * with an update). A disabled room needs nothing; an enabled room needs a
 * price, currency, a coherent whole-hour duration range and a window long
 * enough for the minimum stay.
 *
 * @returns {Array<{field: string, issue: string}>} empty when valid
 */
export function validateHourlyConfig({
  enabled,
  priceAmount,
  priceCurrency,
  minHours,
  maxHours,
  availableFrom,
  availableUntil,
}) {
  if (!enabled) return [];
  const missing = [
    ['hourlyPriceAmount', priceAmount],
    ['hourlyPriceCurrency', priceCurrency],
    ['hourlyMinDurationHours', minHours],
    ['hourlyMaxDurationHours', maxHours],
    ['hourlyAvailableFrom', availableFrom],
    ['hourlyAvailableUntil', availableUntil],
  ].filter(([, value]) => value === null || value === undefined);
  if (missing.length > 0) {
    return missing.map(([field]) => ({
      field,
      issue: HOURLY_CONFIG_ISSUES.INCOMPLETE,
    }));
  }
  const issues = [];
  if (maxHours < minHours) {
    issues.push({
      field: 'hourlyMaxDurationHours',
      issue: HOURLY_CONFIG_ISSUES.DURATION_RANGE_INVALID,
    });
  }
  const fromHour = parseWholeHour(availableFrom);
  const untilHour = parseWholeHour(availableUntil);
  if (
    fromHour === null ||
    untilHour === null ||
    fromHour >= HOURS_PER_DAY ||
    untilHour <= fromHour ||
    untilHour - fromHour < minHours
  ) {
    issues.push({
      field: 'hourlyAvailableUntil',
      issue: HOURLY_CONFIG_ISSUES.WINDOW_INVALID,
    });
  }
  return issues;
}

/**
 * Validates one hourly stay request against the room's configuration.
 *
 * @param {{dateFrom: string, dateTo: string, startTime: ?string, endTime: ?string}} request
 * @param {{minHours: number, maxHours: number, availableFrom: string, availableUntil: string}} config
 * @returns {{valid: true, startHour: number, endHour: number, hours: number}|{valid: false, issue: string}}
 */
export function validateHourlyStay(
  { dateFrom, dateTo, startTime, endTime },
  { minHours, maxHours, availableFrom, availableUntil },
) {
  if (dateFrom !== dateTo) {
    return { valid: false, issue: HOURLY_STAY_ISSUES.CROSS_MIDNIGHT };
  }
  const startHour = parseWholeHour(startTime);
  const endHour = parseWholeHour(endTime);
  if (startHour === null || endHour === null || startHour >= HOURS_PER_DAY) {
    return { valid: false, issue: HOURLY_STAY_ISSUES.TIME_INVALID };
  }
  if (endHour <= startHour) {
    return { valid: false, issue: HOURLY_STAY_ISSUES.TIME_INVALID };
  }
  const hours = endHour - startHour;
  if (hours < minHours || hours > maxHours) {
    return { valid: false, issue: HOURLY_STAY_ISSUES.DURATION_OUT_OF_RANGE };
  }
  if (
    startHour < parseWholeHour(availableFrom) ||
    endHour > parseWholeHour(availableUntil)
  ) {
    return { valid: false, issue: HOURLY_STAY_ISSUES.OUTSIDE_WINDOW };
  }
  return { valid: true, startHour, endHour, hours };
}

/**
 * Has an hourly stay already started? Business time (Asia/Yerevan) from the
 * server's own clock; a stay starting exactly now counts as started.
 */
export function hasHourlyStayStarted({ date, startHour }, now) {
  const business = toBusinessDateTime(now);
  return (
    `${date}T${formatHour(startHour)}:00` <= `${business.date}T${business.time}`
  );
}

/**
 * The mode a hold or booked item is: HOURLY only when explicitly an hourly
 * stay; every other lodging stay (including one stored before modes existed)
 * is NIGHTLY; a non-lodging unit has no mode (`null`).
 */
export function resolveBookingMode(unitTypeCode, mode) {
  if (mode === BOOKING_MODES.HOURLY) return BOOKING_MODES.HOURLY;
  return isAccommodationUnitType(unitTypeCode) ? BOOKING_MODES.NIGHTLY : null;
}

/** One room's price for the stay: hourly rate × hours (a `Money`). */
export function hourlyStayUnitPrice(hourlyRate, hours) {
  return hourlyRate.multiply(hours);
}

export default {
  BOOKING_MODES,
  HOURLY_BOOKING_UNIT_TYPE,
  HOURS_PER_DAY,
  HOURLY_STAY_ISSUES,
  HOURLY_CONFIG_ISSUES,
  parseWholeHour,
  formatHour,
  intervalsOverlap,
  peakOccupiedQuantity,
  validateHourlyConfig,
  validateHourlyStay,
  hasHourlyStayStarted,
  hourlyStayUnitPrice,
  resolveBookingMode,
};

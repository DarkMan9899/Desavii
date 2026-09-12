/**
 * Marketplace Product Completeness Sprint B (Car Rental Pickup/Return
 * Interval) — pure chronology validation for a rental's pickup/return
 * datetime, the same "core domain logic as a testable pure function"
 * convention `accommodationDateSemantics.js`/`calendarExpansion.js`
 * already establish. Single choke point `AvailabilityService#reserveCapacity`
 * calls before granting a hold — the one place a rental's pickup/return
 * time is ever accepted from a client at all (see that method's own
 * comment: every other bookable-unit type either has no time concept or
 * derives it from the unit itself, never from the request).
 *
 * Deliberately never constructs a `Date` object: `dateFrom`/`dateTo` are
 * `YYYY-MM-DD` and `startTime`/`endTime` are `HH:MM` (or `HH:MM:SS`), so
 * `${date}T${time}` is already a lexicographically-sortable ISO-shaped
 * string — comparing those strings directly gives the correct
 * chronological ordering with no timezone interpretation at all, the same
 * "never reinterpret a wall-clock string as an absolute instant" rule
 * Sprint A's `formatTimeRange.js` documents.
 */

export const VEHICLE_BOOKABLE_UNIT_TYPE = 'VEHICLE';

export function isVehicleUnitType(bookableUnitTypeCode) {
  return bookableUnitTypeCode === VEHICLE_BOOKABLE_UNIT_TYPE;
}

// Pass 6 (Restaurant vertical, owner issue #12/#13): a restaurant
// reservation is a single customer-chosen point in time (unlike a
// rental's pickup/return interval, or a Tour's fixed unit-level
// departure) — no unit-level default to derive it from, so it needs the
// exact same "accept and persist a client-chosen time" treatment
// `reserveCapacity` already gives VEHICLE, just without an interval to
// validate (there is no "return" leg to check chronology against).
export const RESTAURANT_BOOKABLE_UNIT_TYPE = 'RESTAURANT_TABLE';

export function isRestaurantUnitType(bookableUnitTypeCode) {
  return bookableUnitTypeCode === RESTAURANT_BOOKABLE_UNIT_TYPE;
}

/**
 * @param {{dateFrom: string, dateTo: string, startTime?: string|null, endTime?: string|null}} input
 * @returns {{valid: true} | {valid: false, reason: string}}
 */
export function validateRentalInterval({
  dateFrom,
  dateTo,
  startTime,
  endTime,
}) {
  // No time supplied — nothing for this function to validate; the caller
  // falls back to date-only semantics (identical to every other category).
  if (!startTime && !endTime) return { valid: true };
  if (!startTime || !endTime) {
    return { valid: false, reason: 'INCOMPLETE_RENTAL_INTERVAL' };
  }

  const pickup = `${dateFrom}T${startTime}`;
  const dropoff = `${dateTo}T${endTime}`;
  if (dropoff <= pickup) {
    return { valid: false, reason: 'RETURN_NOT_AFTER_PICKUP' };
  }
  return { valid: true };
}

export default {
  isVehicleUnitType,
  isRestaurantUnitType,
  validateRentalInterval,
};

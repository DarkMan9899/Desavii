/**
 * Step L6.2B — the translation key naming a booked unit in its own domain
 * noun ("Room type", "Table", "Departure / session", "Vehicle", …), shared
 * by checkout and the booking-detail pages. A unit type this page doesn't
 * know (legacy data, or a hand-off without one) keeps the previous generic
 * wording.
 *
 * @param {string|null|undefined} bookableUnitType - `bookable_unit_type`
 * @param {string} fallbackKey - the generic key to use otherwise
 * @returns {string} a translation key
 */

import { BOOKABLE_UNIT_TYPES } from '../../availability/index.js';

export function resolveUnitNounKey(bookableUnitType, fallbackKey) {
  return BOOKABLE_UNIT_TYPES.includes(bookableUnitType)
    ? `bookings.unitLabels.${bookableUnitType}`
    : fallbackKey;
}

export default resolveUnitNounKey;

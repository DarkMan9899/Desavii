/**
 * Step L6.2B — the canonical listing type -> bookable unit type mapping.
 *
 * Every booking flow already branches on the unit type
 * (`accommodationDateSemantics.js` lodging nights, `rentalIntervalValidation.js`
 * vehicle pickup/return and restaurant reservation time, the Tour/Attraction
 * time-slot flow, `bookableUnitTypeToBookingType.js`), and every existing
 * listing already uses exactly one of these per listing type — this makes
 * that implicit model the enforced one. Keyed by listing TYPE, not category:
 * all 9 categories resolve to these 6 types
 * (`categoryListingTypeMapping.js`), and a category-less internal listing
 * still has a type.
 *
 * ATTRACTION reuses TOUR_DEPARTURE (a scheduled, per-person, capacity-per-
 * date "session" — the same documented reuse the demo seed already made);
 * no separate session type exists and none is invented here.
 *
 * Mirrored by `apps/web/src/modules/availability/constants/
 * listingTypeBookableUnitTypes.js`, locked to this file by that file's test.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

export const BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE = Object.freeze({
  HOTEL: 'HOTEL_ROOM',
  PROPERTY: 'PROPERTY_UNIT',
  RESTAURANT: 'RESTAURANT_TABLE',
  TOUR: 'TOUR_DEPARTURE',
  CAR_RENTAL: 'VEHICLE',
  ATTRACTION: 'TOUR_DEPARTURE',
});

/**
 * Listing types that describe exactly ONE bookable thing: a Car Rental
 * listing is one vehicle model (seats/doors/luggage are listing-level
 * attributes), and its single VEHICLE unit is that model's fleet count.
 */
export const SINGLE_UNIT_LISTING_TYPES = Object.freeze(['CAR_RENTAL']);

/**
 * @param {string|null|undefined} listingTypeCode
 * @returns {string|null} the one unit type a Partner may register, or
 *   `null` for an unknown listing type.
 */
export function getBookableUnitTypeForListingType(listingTypeCode) {
  return BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE[listingTypeCode] ?? null;
}

export function isBookableUnitTypeAllowed(listingTypeCode, unitTypeCode) {
  const allowed = getBookableUnitTypeForListingType(listingTypeCode);
  return allowed !== null && allowed === unitTypeCode;
}

export function isSingleUnitListingType(listingTypeCode) {
  return SINGLE_UNIT_LISTING_TYPES.includes(listingTypeCode);
}

export default {
  BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE,
  SINGLE_UNIT_LISTING_TYPES,
  getBookableUnitTypeForListingType,
  isBookableUnitTypeAllowed,
  isSingleUnitListingType,
};

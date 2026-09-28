/**
 * Step L6.2B — the canonical listing type -> bookable unit type mapping,
 * mirrored from `apps/api/src/core/domain/listingTypeBookableUnitTypes.js`
 * (the backend is the authority and enforces it on registration). The two
 * apps can't share a module across the Vite/Node boundary; this file's test
 * imports the backend definition and fails if they ever drift apart.
 */

export const BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE = Object.freeze({
  HOTEL: 'HOTEL_ROOM',
  PROPERTY: 'PROPERTY_UNIT',
  RESTAURANT: 'RESTAURANT_TABLE',
  TOUR: 'TOUR_DEPARTURE',
  CAR_RENTAL: 'VEHICLE',
  ATTRACTION: 'TOUR_DEPARTURE',
});

/** A Car Rental listing is one vehicle model with exactly one VEHICLE unit. */
export const SINGLE_UNIT_LISTING_TYPES = Object.freeze(['CAR_RENTAL']);

export function getBookableUnitTypeForListingType(listingTypeCode) {
  return BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE[listingTypeCode] ?? null;
}

export function isSingleUnitListingType(listingTypeCode) {
  return SINGLE_UNIT_LISTING_TYPES.includes(listingTypeCode);
}

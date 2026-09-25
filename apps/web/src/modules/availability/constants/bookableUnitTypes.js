/**
 * `bookable_unit_types` — a fixed backend enum
 * (`apps/api/src/core/domain/bookableUnitTypes.js`, seeded once, not a
 * per-category dynamic catalog), mirrored here the same way
 * `modules/listings/constants/categoryListingTypeMapping.js` mirrors its
 * own backend counterpart.
 */

export const BOOKABLE_UNIT_TYPES = [
  'HOTEL_ROOM',
  'PROPERTY_UNIT',
  'RESTAURANT_TABLE',
  'TOUR_DEPARTURE',
  'VEHICLE',
];

export default BOOKABLE_UNIT_TYPES;

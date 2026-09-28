/**
 * Step L6.2B — which type-specific bookable-unit fields each unit type
 * uses, mirrored from `apps/api/src/core/domain/
 * bookableUnitFieldApplicability.js` (the backend rejects any other). This
 * file's test imports the backend definition and fails if they drift.
 */

const LODGING_FIELDS = ['maxGuests', 'bedConfiguration'];
const HOTEL_ROOM_DETAIL_FIELDS = [
  'roomSizeSqm',
  'bathroomType',
  'viewType',
  'smokingPolicy',
];

export const UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE = Object.freeze({
  HOTEL_ROOM: Object.freeze([...LODGING_FIELDS, ...HOTEL_ROOM_DETAIL_FIELDS]),
  PROPERTY_UNIT: Object.freeze([...LODGING_FIELDS]),
  RESTAURANT_TABLE: Object.freeze([]),
  TOUR_DEPARTURE: Object.freeze(['timeSlotStart', 'timeSlotEnd']),
  VEHICLE: Object.freeze([]),
});

/** Unit types whose room description/amenities/photos can be managed. */
export const ROOM_DETAIL_BOOKABLE_UNIT_TYPES = Object.freeze(['HOTEL_ROOM']);

export function unitTypeUsesField(unitTypeCode, field) {
  return (UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE[unitTypeCode] ?? []).includes(
    field,
  );
}

export function supportsRoomDetails(unitTypeCode) {
  return ROOM_DETAIL_BOOKABLE_UNIT_TYPES.includes(unitTypeCode);
}

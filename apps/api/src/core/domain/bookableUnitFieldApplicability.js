/**
 * Step L6.2B — which type-specific `bookable_units` fields each unit type
 * genuinely uses. Every other field (label, capacity, base price) is
 * common to all types.
 *
 * - Occupancy and beds (`maxGuests`, `bedConfiguration`) describe lodging
 *   only (HOTEL_ROOM, PROPERTY_UNIT). A Tour/Attraction's capacity already
 *   is its seat count, a restaurant's party size is chosen per booking,
 *   and a vehicle's seats are a listing-level attribute.
 * - A fixed time slot (`timeSlotStart`/`timeSlotEnd`) only exists for a
 *   scheduled departure/session (TOUR_DEPARTURE). A restaurant's
 *   reservation time and a vehicle's pickup/return time are chosen by the
 *   customer when booking, never fixed on the unit.
 * - Rich room details (size/bathroom/view/smoking, and the separate room
 *   description/amenities/photos endpoints) stay HOTEL_ROOM-only for now:
 *   extending them to PROPERTY_UNIT is a deliberately deferred decision.
 *
 * Mirrored by `apps/web/src/modules/availability/constants/
 * bookableUnitFieldApplicability.js`, locked to this file by that file's test.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

export const TYPE_SPECIFIC_UNIT_FIELDS = Object.freeze([
  'maxGuests',
  'bedConfiguration',
  'timeSlotStart',
  'timeSlotEnd',
  'roomSizeSqm',
  'bathroomType',
  'viewType',
  'smokingPolicy',
]);

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

export function isUnitFieldApplicable(unitTypeCode, field) {
  if (!TYPE_SPECIFIC_UNIT_FIELDS.includes(field)) return true;
  return (UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE[unitTypeCode] ?? []).includes(
    field,
  );
}

/**
 * @param {string} unitTypeCode
 * @param {object} input - a register/update payload
 * @returns {string[]} the type-specific fields the payload actually
 *   supplies (not `undefined`) that this unit type does not use.
 */
export function findInapplicableUnitFields(unitTypeCode, input) {
  return TYPE_SPECIFIC_UNIT_FIELDS.filter(
    (field) =>
      input[field] !== undefined && !isUnitFieldApplicable(unitTypeCode, field),
  );
}

export function supportsRoomDetails(unitTypeCode) {
  return ROOM_DETAIL_BOOKABLE_UNIT_TYPES.includes(unitTypeCode);
}

export default {
  TYPE_SPECIFIC_UNIT_FIELDS,
  UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE,
  ROOM_DETAIL_BOOKABLE_UNIT_TYPES,
  isUnitFieldApplicable,
  findInapplicableUnitFields,
  supportsRoomDetails,
};

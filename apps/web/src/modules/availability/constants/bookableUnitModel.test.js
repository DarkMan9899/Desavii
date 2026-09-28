/**
 * Step L6.2B — locks the web mirrors to the backend model: this file and
 * `apps/api/tests/unit/core/domain/bookableUnitModel.test.js` assert the
 * SAME literal tables, so the web copy and the backend definition (which
 * enforces the model on every unit write) can never silently drift apart
 * — changing either side without the other fails a test. The apps can't
 * import each other's modules (separate workspaces).
 */

import { describe, test, expect } from 'vitest';
import {
  BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE,
  SINGLE_UNIT_LISTING_TYPES,
  getBookableUnitTypeForListingType,
  isSingleUnitListingType,
} from './listingTypeBookableUnitTypes.js';
import {
  UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE,
  ROOM_DETAIL_BOOKABLE_UNIT_TYPES,
  unitTypeUsesField,
  supportsRoomDetails,
} from './bookableUnitFieldApplicability.js';

// Keep identical to the backend test's EXPECTED_* tables.
const EXPECTED_UNIT_TYPE_BY_LISTING_TYPE = {
  HOTEL: 'HOTEL_ROOM',
  PROPERTY: 'PROPERTY_UNIT',
  RESTAURANT: 'RESTAURANT_TABLE',
  TOUR: 'TOUR_DEPARTURE',
  CAR_RENTAL: 'VEHICLE',
  ATTRACTION: 'TOUR_DEPARTURE',
};
const EXPECTED_SINGLE_UNIT_LISTING_TYPES = ['CAR_RENTAL'];
const EXPECTED_UNIT_FIELDS_BY_TYPE = {
  HOTEL_ROOM: [
    'maxGuests',
    'bedConfiguration',
    'roomSizeSqm',
    'bathroomType',
    'viewType',
    'smokingPolicy',
  ],
  PROPERTY_UNIT: ['maxGuests', 'bedConfiguration'],
  RESTAURANT_TABLE: [],
  TOUR_DEPARTURE: ['timeSlotStart', 'timeSlotEnd'],
  VEHICLE: [],
};
const EXPECTED_ROOM_DETAIL_TYPES = ['HOTEL_ROOM'];

describe('bookable unit model mirror (Step L6.2B)', () => {
  test('listing type -> unit type mapping matches the backend model', () => {
    expect(BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE).toEqual(
      EXPECTED_UNIT_TYPE_BY_LISTING_TYPE,
    );
    expect(SINGLE_UNIT_LISTING_TYPES).toEqual(
      EXPECTED_SINGLE_UNIT_LISTING_TYPES,
    );
  });

  test('per-unit-type field applicability matches the backend model', () => {
    expect(UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE).toEqual(
      EXPECTED_UNIT_FIELDS_BY_TYPE,
    );
    expect(ROOM_DETAIL_BOOKABLE_UNIT_TYPES).toEqual(EXPECTED_ROOM_DETAIL_TYPES);
  });

  test('an unknown listing type has no unit type', () => {
    expect(getBookableUnitTypeForListingType('SPACESHIP')).toBeNull();
  });

  test('only Car Rental is a single-unit listing type', () => {
    expect(isSingleUnitListingType('CAR_RENTAL')).toBe(true);
    expect(isSingleUnitListingType('HOTEL')).toBe(false);
  });

  test.each([
    ['HOTEL_ROOM', 'roomSizeSqm', true],
    ['PROPERTY_UNIT', 'bedConfiguration', true],
    ['PROPERTY_UNIT', 'roomSizeSqm', false],
    ['TOUR_DEPARTURE', 'timeSlotStart', true],
    ['TOUR_DEPARTURE', 'maxGuests', false],
    ['VEHICLE', 'maxGuests', false],
    ['RESTAURANT_TABLE', 'bedConfiguration', false],
  ])('%s uses %s: %s', (unitType, field, expected) => {
    expect(unitTypeUsesField(unitType, field)).toBe(expected);
  });

  test('room details are hotel-room only', () => {
    expect(supportsRoomDetails('HOTEL_ROOM')).toBe(true);
    expect(supportsRoomDetails('PROPERTY_UNIT')).toBe(false);
  });
});

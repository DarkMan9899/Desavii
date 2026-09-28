/**
 * Step L6.2B — the listing type -> bookable unit type model and the
 * per-unit-type field applicability. The EXPECTED_* tables below are kept
 * identical to `apps/web/src/modules/availability/constants/
 * bookableUnitModel.test.js`, which locks the web mirror the same way — so
 * neither side can change without the other failing.
 */

import { describe, test, expect } from '@jest/globals';
import {
  BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE,
  SINGLE_UNIT_LISTING_TYPES,
  getBookableUnitTypeForListingType,
  isBookableUnitTypeAllowed,
  isSingleUnitListingType,
} from '../../../../src/core/domain/listingTypeBookableUnitTypes.js';
import {
  UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE,
  ROOM_DETAIL_BOOKABLE_UNIT_TYPES,
  isUnitFieldApplicable,
  findInapplicableUnitFields,
  supportsRoomDetails,
} from '../../../../src/core/domain/bookableUnitFieldApplicability.js';
import { BOOKABLE_UNIT_TYPES } from '../../../../src/core/domain/bookableUnitTypes.js';

// Keep identical to the web test's EXPECTED_* tables.
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

describe('listing type -> bookable unit type (Step L6.2B)', () => {
  test('the mapping is exactly the locked model', () => {
    expect(BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE).toEqual(
      EXPECTED_UNIT_TYPE_BY_LISTING_TYPE,
    );
    expect(SINGLE_UNIT_LISTING_TYPES).toEqual(
      EXPECTED_SINGLE_UNIT_LISTING_TYPES,
    );
  });

  test('every mapped unit type is a real seeded unit type', () => {
    Object.values(BOOKABLE_UNIT_TYPE_BY_LISTING_TYPE).forEach((unitType) => {
      expect(BOOKABLE_UNIT_TYPES).toContain(unitType);
    });
  });

  test('exactly one allowed unit type per listing type', () => {
    expect(isBookableUnitTypeAllowed('ATTRACTION', 'TOUR_DEPARTURE')).toBe(
      true,
    );
    expect(isBookableUnitTypeAllowed('TOUR', 'TOUR_DEPARTURE')).toBe(true);
    expect(isBookableUnitTypeAllowed('TOUR', 'HOTEL_ROOM')).toBe(false);
    expect(isBookableUnitTypeAllowed('HOTEL', 'TOUR_DEPARTURE')).toBe(false);
  });

  test('an unknown listing type allows nothing', () => {
    expect(getBookableUnitTypeForListingType('SPACESHIP')).toBeNull();
    expect(isBookableUnitTypeAllowed('SPACESHIP', 'HOTEL_ROOM')).toBe(false);
    expect(isBookableUnitTypeAllowed(undefined, 'HOTEL_ROOM')).toBe(false);
  });

  test('only Car Rental is a single-unit listing type', () => {
    expect(isSingleUnitListingType('CAR_RENTAL')).toBe(true);
    expect(isSingleUnitListingType('PROPERTY')).toBe(false);
  });
});

describe('bookable unit field applicability (Step L6.2B)', () => {
  test('the per-type table is exactly the locked model', () => {
    expect(UNIT_FIELDS_BY_BOOKABLE_UNIT_TYPE).toEqual(
      EXPECTED_UNIT_FIELDS_BY_TYPE,
    );
    expect(ROOM_DETAIL_BOOKABLE_UNIT_TYPES).toEqual(EXPECTED_ROOM_DETAIL_TYPES);
  });

  test('common fields apply to every unit type', () => {
    expect(isUnitFieldApplicable('VEHICLE', 'capacity')).toBe(true);
    expect(isUnitFieldApplicable('RESTAURANT_TABLE', 'basePriceAmount')).toBe(
      true,
    );
  });

  test('findInapplicableUnitFields reports only supplied, foreign fields', () => {
    expect(
      findInapplicableUnitFields('TOUR_DEPARTURE', {
        capacity: 5,
        timeSlotStart: '09:00',
        maxGuests: 3,
        bedConfiguration: [{ type: 'SINGLE', count: 1 }],
        roomSizeSqm: undefined,
      }),
    ).toEqual(['maxGuests', 'bedConfiguration']);
    expect(
      findInapplicableUnitFields('HOTEL_ROOM', {
        maxGuests: 2,
        roomSizeSqm: 20,
      }),
    ).toEqual([]);
    expect(
      findInapplicableUnitFields('VEHICLE', { timeSlotStart: '09:00' }),
    ).toEqual(['timeSlotStart']);
  });

  test('room details are hotel-room only', () => {
    expect(supportsRoomDetails('HOTEL_ROOM')).toBe(true);
    expect(supportsRoomDetails('PROPERTY_UNIT')).toBe(false);
    expect(supportsRoomDetails('VEHICLE')).toBe(false);
  });
});

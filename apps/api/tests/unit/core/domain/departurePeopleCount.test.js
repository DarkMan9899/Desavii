import { describe, test, expect } from '@jest/globals';
import {
  isDepartureUnitType,
  isDeparturePeopleCountConsistent,
} from '../../../../src/core/domain/departurePeopleCount.js';

// Step L6.2H3B — a departure's held quantity is its one person count.
describe('departurePeopleCount', () => {
  test('only a TOUR_DEPARTURE unit is a departure', () => {
    expect(isDepartureUnitType('TOUR_DEPARTURE')).toBe(true);
    ['HOTEL_ROOM', 'PROPERTY_UNIT', 'RESTAURANT_TABLE', 'VEHICLE'].forEach(
      (type) => expect(isDepartureUnitType(type)).toBe(false),
    );
  });

  test.each([
    [undefined, 4, true],
    [null, 4, true],
    [4, 4, true],
    [6, 1, false],
    [1, 10, false],
  ])(
    'guestCount %s with quantity %i -> %s',
    (guestCount, quantity, expected) => {
      expect(isDeparturePeopleCountConsistent({ guestCount, quantity })).toBe(
        expected,
      );
    },
  );
});

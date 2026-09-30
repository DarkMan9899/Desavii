import { describe, test, expect } from 'vitest';
import {
  isFreeReservation,
  resolvePartySize,
} from './restaurantReservation.js';

// Step L6.2H2B.
describe('restaurantReservation utils', () => {
  test.each([
    [{ booking_type: 'RESTAURANT_RESERVATION', total_amount: '0.00' }, true],
    [
      { booking_type: 'RESTAURANT_RESERVATION', total_amount: '6500.00' },
      false,
    ],
    [{ booking_type: 'HOTEL_ROOM_BOOKING', total_amount: '0.00' }, false],
    [null, false],
  ])('isFreeReservation(%o) -> %s', (booking, expected) => {
    expect(isFreeReservation(booking)).toBe(expected);
  });

  test('a recorded party size is returned as-is; a missing one is null, never 0', () => {
    expect(resolvePartySize({ guest_count: 4 })).toBe(4);
    expect(resolvePartySize({ guest_count: null })).toBeNull();
    expect(resolvePartySize({})).toBeNull();
  });
});

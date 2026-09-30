import { describe, test, expect } from '@jest/globals';
import {
  RESTAURANT_RESERVATION_QUANTITY,
  restaurantReservationCharge,
} from '../../../../src/core/domain/restaurantReservation.js';

// Step L6.2H2B — a restaurant reservation is free and takes one slot.
describe('restaurantReservation', () => {
  test('a reservation is charged exactly zero, in AMD', () => {
    const charge = restaurantReservationCharge();
    expect(charge.isZero()).toBe(true);
    expect(charge.currency).toBe('AMD');
    expect(charge.toDecimalString()).toBe('0.00');
  });

  test('a booking item is always exactly one reservation', () => {
    expect(RESTAURANT_RESERVATION_QUANTITY).toBe(1);
  });
});

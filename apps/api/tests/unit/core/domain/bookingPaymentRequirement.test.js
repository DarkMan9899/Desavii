import { describe, test, expect } from '@jest/globals';
import { isBookingPaymentRequired } from '../../../../src/core/domain/bookingPaymentRequirement.js';

// Step L6.2H2B — one rule for the booking DTO's `payment_required` and the
// server-side payment guard.
describe('isBookingPaymentRequired', () => {
  test.each([
    [
      'a new, free restaurant reservation',
      'RESTAURANT_RESERVATION',
      '0.00',
      false,
    ],
    [
      'a historical restaurant reservation with a stored total',
      'RESTAURANT_RESERVATION',
      '6500.00',
      false,
    ],
    ['a priced hotel stay', 'HOTEL_ROOM_BOOKING', '85000.00', true],
    ['a priced tour', 'TOUR_BOOKING', '16000.00', true],
    ['any other booking with a zero total', 'TOUR_BOOKING', '0.00', false],
  ])('%s -> %s', (_label, bookingTypeCode, totalAmount, expected) => {
    expect(
      isBookingPaymentRequired({
        bookingTypeCode,
        totalAmount,
        currencyCode: 'AMD',
      }),
    ).toBe(expected);
  });
});

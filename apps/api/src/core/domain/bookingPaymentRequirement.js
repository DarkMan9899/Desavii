/**
 * Step L6.2H2B — whether a booking can ever be paid on the platform. The one
 * rule shared by the booking DTO's `payment_required` flag and the
 * server-side guard in `PaymentService#createPaymentIntent`.
 *
 * A booking has exactly one booking type (all items share one listing and
 * one bookable unit type — `BookingService#createBooking` rejects
 * MULTI_LISTING_BOOKING / MIXED_UNIT_TYPES), so the type decides for the
 * whole booking:
 *
 * - a restaurant reservation never takes platform payment — including a
 *   historical one created with a nonzero total before reservations became
 *   free (its stored amount stays as history, but no new payment starts);
 * - any other booking needs payment only when its total is above zero.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { Money } from './money.js';

const PAYMENT_EXEMPT_BOOKING_TYPES = Object.freeze(['RESTAURANT_RESERVATION']);

/**
 * @param {{bookingTypeCode: string, totalAmount: string, currencyCode: string}} booking
 * @returns {boolean}
 */
export function isBookingPaymentRequired({
  bookingTypeCode,
  totalAmount,
  currencyCode,
}) {
  if (PAYMENT_EXEMPT_BOOKING_TYPES.includes(bookingTypeCode)) return false;
  const total = Money.fromDecimalString(String(totalAmount), currencyCode);
  return !total.isZero() && !total.isNegative();
}

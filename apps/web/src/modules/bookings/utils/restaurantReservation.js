/**
 * Step L6.2H2B — restaurant reservations are free: a new restaurant booking
 * is stored with a total of exactly 0 and never takes platform payment.
 *
 * `isFreeReservation` is true only for that case. A historical restaurant
 * booking created with a nonzero total keeps showing its stored amount —
 * history is never rewritten or hidden.
 */

export const RESTAURANT_BOOKING_TYPE = 'RESTAURANT_RESERVATION';

export function isFreeReservation(booking) {
  return (
    booking?.booking_type === RESTAURANT_BOOKING_TYPE &&
    Number(booking.total_amount) === 0
  );
}

/** A restaurant item's recorded party size, or `null` when none was stored. */
export function resolvePartySize(item) {
  // Step L6.3B: an hourly hotel stay records guests too — they are guests,
  // not a restaurant party (its own detail rows show them).
  if (item?.booking_mode === 'HOURLY') return null;
  return Number.isInteger(item?.guest_count) ? item.guest_count : null;
}

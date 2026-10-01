/**
 * Step L6.2H3B — the departure person-count contract. For a TOUR_DEPARTURE
 * (Tours, Attractions, Entertainment Venues) the hold's `quantity` is the one
 * authoritative number of people: Travelers, Visitors or Participants. The
 * same number is the inventory consumed (seats/places), `booking_items.quantity`
 * and the price multiplier — there is no second, detached guest count.
 *
 * A booking request may still send `guestCount` (the field exists for lodging
 * occupancy and restaurant party size); for a departure it must equal the
 * held quantity, or it is a contradiction to refuse, never to ignore.
 *
 * Private-group services (one price per group, a group-size limit) are not
 * part of the current product model.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

const DEPARTURE_BOOKABLE_UNIT_TYPE = 'TOUR_DEPARTURE';

export function isDepartureUnitType(bookableUnitTypeCode) {
  return bookableUnitTypeCode === DEPARTURE_BOOKABLE_UNIT_TYPE;
}

/**
 * @param {{guestCount?: number|null, quantity: number}} input
 * @returns {boolean} whether a submitted departure person count agrees with
 *   the held quantity (an omitted count always does — the hold decides).
 */
export function isDeparturePeopleCountConsistent({ guestCount, quantity }) {
  return (
    guestCount === undefined || guestCount === null || guestCount === quantity
  );
}

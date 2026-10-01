/**
 * Step L6.2H3B — what a departure's (TOUR_DEPARTURE's) quantity counts, in
 * the category's own words: Tours book Travelers, Attractions book Visitors,
 * Entertainment Venues book Participants. The quantity is the one
 * authoritative person count — seats/places consumed and the price
 * multiplier — so every surface names it the same way.
 *
 * Category first (Attractions and Entertainment Venues share the ATTRACTION
 * listing type), then listing type, then a neutral "people" fallback for a
 * row whose category isn't known.
 *
 * @returns {'travelers'|'visitors'|'participants'|'people'} the
 *   `bookings.departurePeople.*` key
 */

const PEOPLE_KEY_BY_CATEGORY = Object.freeze({
  tours: 'travelers',
  attractions: 'visitors',
  'entertainment-venues': 'participants',
});

const PEOPLE_KEY_BY_LISTING_TYPE = Object.freeze({
  TOUR: 'travelers',
  ATTRACTION: 'visitors',
});

export const DEPARTURE_BOOKABLE_UNIT_TYPE = 'TOUR_DEPARTURE';

export function resolveDeparturePeopleKey({
  categorySlug = null,
  listingType = null,
} = {}) {
  return (
    PEOPLE_KEY_BY_CATEGORY[categorySlug] ??
    PEOPLE_KEY_BY_LISTING_TYPE[listingType] ??
    'people'
  );
}

/**
 * A booking item's departure people count — its `quantity` (never named
 * guest rows, never a restaurant's `guest_count`) — or `null` for any other
 * unit type.
 */
export function resolveDeparturePeopleCount(item) {
  return item?.bookable_unit_type === DEPARTURE_BOOKABLE_UNIT_TYPE
    ? item.quantity
    : null;
}

export default resolveDeparturePeopleKey;

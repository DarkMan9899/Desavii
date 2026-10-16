/**
 * Category slug -> how Search's date and party-size fields behave for it.
 * Mirrors `utils/categoryIcons.js`'s slug-keyed lookup pattern, so every
 * category-aware concern (icon, filter visibility, ...) is resolved the
 * same way rather than each growing its own ad-hoc switch.
 *
 * Every rule here follows what the listing's own booking widget asks for
 * and what `GET /search` actually filters on:
 *
 * - `dateMode`
 *   - `stay` — check-in/check-out range; the backend checks
 *     checkout-exclusive nights (HOTEL_ROOM / PROPERTY_UNIT).
 *   - `rental` — pick-up/return range; every day inclusive (VEHICLE).
 *   - `day` — one date (`dateFrom === dateTo`): a restaurant table or a
 *     departure is booked for a single day, so a range would ask for a
 *     listing free on every day of it, which nobody means.
 *   - `range` — no category chosen: a range, checked per listing with its
 *     own unit type's rule above.
 * - `party` — the noun for the party-size field, or `null` when the
 *   field does not apply. Car Rentals have no party (only vehicle seats,
 *   a separate attribute filter). Restaurants book a party size, but a
 *   table's availability never depends on it, so Search cannot narrow by
 *   it and offering the field would promise a filter that does nothing.
 *   Departures count seats in their category's own word (Travelers /
 *   Visitors / Participants), the same `departurePeople.js` key booking
 *   uses.
 */

import { resolveDeparturePeopleKey } from '../../../utils/departurePeople.js';

export const DATE_MODES = Object.freeze({
  STAY: 'stay',
  RENTAL: 'rental',
  DAY: 'day',
  RANGE: 'range',
});

const GUESTS_PARTY = 'guests';

const STAY_CAPABILITIES = Object.freeze({
  dateMode: DATE_MODES.STAY,
  party: GUESTS_PARTY,
});

function departureCapabilities(categorySlug) {
  return Object.freeze({
    dateMode: DATE_MODES.DAY,
    party: resolveDeparturePeopleKey({ categorySlug }),
  });
}

const SEARCH_CAPABILITIES_BY_SLUG = Object.freeze({
  hotels: STAY_CAPABILITIES,
  apartments: STAY_CAPABILITIES,
  villas: STAY_CAPABILITIES,
  'guest-houses': STAY_CAPABILITIES,
  'car-rentals': Object.freeze({ dateMode: DATE_MODES.RENTAL, party: null }),
  restaurants: Object.freeze({ dateMode: DATE_MODES.DAY, party: null }),
  tours: departureCapabilities('tours'),
  attractions: departureCapabilities('attractions'),
  'entertainment-venues': departureCapabilities('entertainment-venues'),
});

const DEFAULT_CAPABILITIES = Object.freeze({
  dateMode: DATE_MODES.RANGE,
  party: GUESTS_PARTY,
});

/**
 * @param {string|undefined} categorySlug
 * @returns {{ dateMode: string, party: string|null }}
 */
export function getSearchCapabilities(categorySlug) {
  return SEARCH_CAPABILITIES_BY_SLUG[categorySlug] ?? DEFAULT_CAPABILITIES;
}

export function shouldShowGuestsFilter(categorySlug) {
  return getSearchCapabilities(categorySlug).party !== null;
}

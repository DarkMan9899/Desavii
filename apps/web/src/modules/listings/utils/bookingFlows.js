/**
 * bookingFlows — which booking flow a listing's reservation panel runs, and
 * what that flow means (docs/BOOKING_WIDGET_REBUILD.md §4).
 *
 * The flow follows the listing's real bookable units, never its category
 * name: a hotel's rooms are a stay; an apartment, villa or guest house is a
 * home stay; a tour departure, an attraction slot or a venue session is a
 * single-date departure; a vehicle is a rental; a restaurant table is a
 * reservation. Each flow states, explicitly, the facts every panel element
 * reads, so no component guesses from scattered flags:
 *
 * - `dateMode`: one date (`single`) or a check-in/out or pickup/return
 *   range (`range`);
 * - `quantity`: what a count of units means — rooms, cars, people (a
 *   departure's count is its travellers), or nothing to count (a table);
 * - `guests`: whether a separate guest/party count applies (never for a
 *   car, never for a departure, whose people count IS its quantity);
 * - `duration`: what the stay or rental is counted in (nights, days).
 */

export const BOOKING_FLOWS = Object.freeze({
  STAY: 'STAY',
  HOME: 'HOME',
  DEPARTURE: 'DEPARTURE',
  VEHICLE: 'VEHICLE',
  RESTAURANT: 'RESTAURANT',
  GENERIC: 'GENERIC',
});

const FLOW_BY_UNIT_TYPE = Object.freeze({
  HOTEL_ROOM: BOOKING_FLOWS.STAY,
  PROPERTY_UNIT: BOOKING_FLOWS.HOME,
  TOUR_DEPARTURE: BOOKING_FLOWS.DEPARTURE,
  VEHICLE: BOOKING_FLOWS.VEHICLE,
  RESTAURANT_TABLE: BOOKING_FLOWS.RESTAURANT,
});

export const FLOW_CONFIG = Object.freeze({
  [BOOKING_FLOWS.STAY]: {
    dateMode: 'range',
    quantity: 'rooms',
    guests: 'guests',
    duration: 'nights',
  },
  [BOOKING_FLOWS.HOME]: {
    dateMode: 'range',
    quantity: 'rooms',
    guests: 'guests',
    duration: 'nights',
  },
  [BOOKING_FLOWS.DEPARTURE]: {
    dateMode: 'single',
    quantity: 'people',
    guests: null,
    duration: null,
  },
  [BOOKING_FLOWS.VEHICLE]: {
    dateMode: 'range',
    quantity: 'vehicles',
    guests: null,
    duration: 'days',
  },
  [BOOKING_FLOWS.RESTAURANT]: {
    dateMode: 'single',
    quantity: null,
    guests: 'party',
    duration: null,
  },
  [BOOKING_FLOWS.GENERIC]: {
    dateMode: 'range',
    quantity: 'units',
    guests: 'guests',
    duration: null,
  },
});

/** The flow of a listing's units (the first unit with a known type). */
export function resolveBookingFlow(units = []) {
  const known = (units ?? []).find(
    (unit) => FLOW_BY_UNIT_TYPE[unit.bookable_unit_type],
  );
  return known
    ? FLOW_BY_UNIT_TYPE[known.bookable_unit_type]
    : BOOKING_FLOWS.GENERIC;
}

// A departure's CTA names what is booked: a tour, a visit, a session. The
// category decides; the listing type only when it is unambiguous (TOUR).
// ATTRACTION is shared by attractions and entertainment venues, and the
// category can be unknown (still loading, or not offered in this locale):
// such a departure gets the neutral "Request to book", never a guess.
const DEPARTURE_CTA_BY_CATEGORY = Object.freeze({
  tours: 'tour',
  attractions: 'attraction',
  'entertainment-venues': 'entertainment',
});
const DEPARTURE_CTA_BY_LISTING_TYPE = Object.freeze({ TOUR: 'tour' });

const CTA_BY_FLOW = Object.freeze({
  [BOOKING_FLOWS.STAY]: 'stay',
  [BOOKING_FLOWS.HOME]: 'stay',
  [BOOKING_FLOWS.VEHICLE]: 'vehicle',
  [BOOKING_FLOWS.RESTAURANT]: 'restaurant',
  [BOOKING_FLOWS.GENERIC]: 'generic',
});

/**
 * The i18n key of the panel's primary action for this flow:
 * "Reserve", "Reserve a table" / "Reserve with pre-order", "Book tour",
 * "Book visit", "Book session", "Rent this car".
 */
export function resolveBookingCtaKey({
  flow,
  categorySlug = null,
  listingType = null,
  withPreorder = false,
}) {
  let key = CTA_BY_FLOW[flow] ?? 'generic';
  if (flow === BOOKING_FLOWS.DEPARTURE) {
    key =
      DEPARTURE_CTA_BY_CATEGORY[categorySlug] ??
      DEPARTURE_CTA_BY_LISTING_TYPE[listingType] ??
      'generic';
  }
  if (flow === BOOKING_FLOWS.RESTAURANT && withPreorder) {
    key = 'restaurantPreorder';
  }
  return `pages.listingDetail.reservation.cta.${key}`;
}

export default {
  BOOKING_FLOWS,
  FLOW_CONFIG,
  resolveBookingFlow,
  resolveBookingCtaKey,
};

/**
 * categoryPresentation — Phase 18.7 (Category-Specific Detail
 * Experiences). Every section on the Listing Detail page is already
 * fully generic and metadata-driven (the Generic Attribute Engine's own
 * discipline: no per-category JSX branching, no hardcoded field lists —
 * see `MetadataFieldRenderer.jsx`'s header for the write-side precedent
 * this mirrors). What genuinely differs by category isn't which fields
 * exist — the EAV engine already handles that — it's what a visitor
 * actually cares about FIRST: a hotel guest reads amenities and policies
 * before anything else; a hiker wants the itinerary before the fine
 * print; a renter wants the vehicle specs up front. This module captures
 * that difference as small, additive PRESENTATION config — section
 * reading order and booking-CTA copy — keyed off `listing_type` (a
 * stable backend enum, already on every listing DTO), never new
 * components, never new fields, never a fork of any section's markup.
 *
 * `listing_type` codes come from `listing_types.code`
 * (HOTEL/PROPERTY/RESTAURANT/TOUR/CAR_RENTAL/ATTRACTION) — grouped here
 * into four presentation groups. Adding a new `listing_type` later only
 * needs one new line in `GROUP_BY_LISTING_TYPE`; everything else (every
 * section component, the metadata engine, the wizard) already handles it
 * generically with zero further change, exactly as `docs/BACKEND_
 * ARCHITECTURE.md`'s "Adding a New Category" walkthrough describes.
 */

export const PRESENTATION_GROUPS = Object.freeze({
  ACCOMMODATION: 'ACCOMMODATION',
  EXPERIENCE: 'EXPERIENCE',
  TRANSPORT: 'TRANSPORT',
  DINING: 'DINING',
  GENERIC: 'GENERIC',
});

const GROUP_BY_LISTING_TYPE = Object.freeze({
  HOTEL: PRESENTATION_GROUPS.ACCOMMODATION,
  PROPERTY: PRESENTATION_GROUPS.ACCOMMODATION,
  TOUR: PRESENTATION_GROUPS.EXPERIENCE,
  ATTRACTION: PRESENTATION_GROUPS.EXPERIENCE,
  CAR_RENTAL: PRESENTATION_GROUPS.TRANSPORT,
  // Pass 3 remediation: a diner reads the menu before amenities/policy
  // fine print — same "the actual product comes first" rule EXPERIENCE's
  // itinerary placement already follows.
  RESTAURANT: PRESENTATION_GROUPS.DINING,
});

export function resolvePresentationGroup(listingTypeCode) {
  return GROUP_BY_LISTING_TYPE[listingTypeCode] ?? PRESENTATION_GROUPS.GENERIC;
}

/**
 * Pass 7 (category-specific visual identity) — the 9 real marketplace
 * category slugs (`GET /search/categories`), each a genuinely distinct
 * public vertical with its own published listings. `listing_type` above is
 * coarser and can't tell these apart on its own: PROPERTY spans
 * apartments/villas/guest-houses, ATTRACTION spans attractions/
 * entertainment-venues (confirmed live against the seeded catalog).
 */
export const CATEGORY_VISUAL_KEYS = Object.freeze({
  HOTELS: 'hotels',
  APARTMENTS: 'apartments',
  VILLAS: 'villas',
  GUEST_HOUSES: 'guest-houses',
  RESTAURANTS: 'restaurants',
  TOURS: 'tours',
  CAR_RENTALS: 'car-rentals',
  ATTRACTIONS: 'attractions',
  ENTERTAINMENT_VENUES: 'entertainment-venues',
});

const KNOWN_CATEGORY_VISUAL_KEYS = new Set(Object.values(CATEGORY_VISUAL_KEYS));

/**
 * Resolves the CATEGORY-precise key the visual system (hero art, card
 * metadata/motion, detail section order, booking-CTA copy) needs —
 * deliberately a SEPARATE function from `resolvePresentationGroup`, never
 * a change to that one's signature or behavior. `resolvePresentationGroup`
 * is still the function `PartnerListingRowActions.jsx` calls for its real
 * FUNCTIONAL rooms/menu/opening-hours gating, which this visual-only pass
 * must not touch or risk regressing.
 *
 * Falls back to the coarser presentation group (lower-cased, so it still
 * reads as a valid CSS-hook/i18n-segment string) when `categorySlug` is
 * absent or isn't one of the 9 known real slugs — e.g. a card rendered
 * from a DTO shape that predates the new `category_slug` search field, or
 * a listing genuinely uncategorized. Every consumer still gets a stable,
 * defined key either way.
 */
export function resolveCategoryVisualKey({ listingType, categorySlug } = {}) {
  if (categorySlug && KNOWN_CATEGORY_VISUAL_KEYS.has(categorySlug)) {
    return categorySlug;
  }
  return resolvePresentationGroup(listingType).toLowerCase();
}

// Canonical section ids — matches ListingDetailPageContent.jsx's own
// SECTION_* constants. Duplicated here as plain strings (not imported)
// deliberately: this is presentation-only config, never a dependency
// edge back into the page orchestrator's business logic.
const SECTIONS = Object.freeze({
  ABOUT: 'about',
  ITINERARY: 'itinerary',
  INCLUDED: 'included',
  ATTRIBUTES: 'attributes',
  AMENITIES: 'amenities',
  POLICIES: 'policies',
  AVAILABILITY: 'availability',
  LOCATION: 'location',
  REVIEWS: 'reviews',
  FAQ: 'faq',
  // Sprint C-2 (Public Rooms / Choose Your Room) — only ever present for
  // a HOTEL listing with real HOTEL_ROOM units (the caller filters it
  // out otherwise), so it only needs a real position in the
  // ACCOMMODATION order below.
  ROOMS: 'rooms',
  // Pass 3 remediation — only ever present for a RESTAURANT listing with
  // a real partner-authored menu (the caller filters it out otherwise).
  MENU: 'menu',
  // Pass 6 — only ever present for a RESTAURANT listing with real
  // partner-authored opening hours (the caller filters it out otherwise).
  OPENING_HOURS: 'openingHours',
});

// The full generic order — what a GENERIC (dining/unclassified) listing
// keeps unchanged. Each group below only reorders a handful of entries
// relative to this baseline; sections a given listing has no data for
// are filtered out by the caller regardless of what order they appear
// in here.
const BASE_ORDER = [
  SECTIONS.ABOUT,
  SECTIONS.ROOMS,
  SECTIONS.ITINERARY,
  SECTIONS.INCLUDED,
  SECTIONS.ATTRIBUTES,
  SECTIONS.AMENITIES,
  SECTIONS.POLICIES,
  SECTIONS.OPENING_HOURS,
  SECTIONS.AVAILABILITY,
  SECTIONS.LOCATION,
  SECTIONS.REVIEWS,
  SECTIONS.FAQ,
];

// A guest deciding on a place to stay reads what's included in the
// room and the house rules before a generic spec sheet or a duration/
// group-size style "Details" block that barely applies to lodging.
// Sprint C-2: choosing a real room type is the actual booking decision
// for a Hotel — it comes right after the description, ahead of even
// the listing's own (house-wide) amenities.
const ACCOMMODATION_ORDER = [
  SECTIONS.ABOUT,
  SECTIONS.ROOMS,
  SECTIONS.AMENITIES,
  SECTIONS.POLICIES,
  SECTIONS.INCLUDED,
  SECTIONS.ATTRIBUTES,
  SECTIONS.AVAILABILITY,
  SECTIONS.LOCATION,
  SECTIONS.REVIEWS,
  SECTIONS.FAQ,
];
// The itinerary IS the product for a tour/experience/guide — it comes
// right after the description, ahead of the fine print.
const EXPERIENCE_ORDER = [
  SECTIONS.ABOUT,
  SECTIONS.ITINERARY,
  SECTIONS.INCLUDED,
  SECTIONS.ATTRIBUTES,
  SECTIONS.AMENITIES,
  SECTIONS.POLICIES,
  SECTIONS.AVAILABILITY,
  SECTIONS.LOCATION,
  SECTIONS.REVIEWS,
  SECTIONS.FAQ,
];
// A renter wants the vehicle's own specs (transmission/seats) and
// what's included with the rental before amenities/policy fine print.
const TRANSPORT_ORDER = [
  SECTIONS.ABOUT,
  SECTIONS.ATTRIBUTES,
  SECTIONS.INCLUDED,
  SECTIONS.AMENITIES,
  SECTIONS.POLICIES,
  SECTIONS.AVAILABILITY,
  SECTIONS.LOCATION,
  SECTIONS.REVIEWS,
  SECTIONS.FAQ,
];
// A diner reads the menu right after the description, ahead of even
// house-wide amenities/policies — the same "the product comes first"
// placement EXPERIENCE's itinerary already gets.
const DINING_ORDER = [
  SECTIONS.ABOUT,
  SECTIONS.MENU,
  SECTIONS.OPENING_HOURS,
  SECTIONS.AMENITIES,
  SECTIONS.POLICIES,
  SECTIONS.INCLUDED,
  SECTIONS.ATTRIBUTES,
  SECTIONS.AVAILABILITY,
  SECTIONS.LOCATION,
  SECTIONS.REVIEWS,
  SECTIONS.FAQ,
];

const SECTION_ORDER_BY_GROUP = Object.freeze({
  [PRESENTATION_GROUPS.ACCOMMODATION]: ACCOMMODATION_ORDER,
  [PRESENTATION_GROUPS.EXPERIENCE]: EXPERIENCE_ORDER,
  [PRESENTATION_GROUPS.TRANSPORT]: TRANSPORT_ORDER,
  [PRESENTATION_GROUPS.DINING]: DINING_ORDER,
  [PRESENTATION_GROUPS.GENERIC]: BASE_ORDER,

  // Pass 7 (category-specific visual identity, brief §16) — category-slug
  // keys layered into the SAME lookup `reorderSections` already reads, so
  // that function's signature/logic stays completely unchanged; it just
  // also now recognizes 9 more (lowercase, hyphenated) keys alongside the
  // 5 original uppercase group ones.
  //
  // Hotels/Apartments/Villas/Guest Houses share the ACCOMMODATION order
  // deliberately: all four have the identical real data shape (units/
  // rooms, amenities, policies) — the brief's own language for these asks
  // for "composition"/"whitespace"/"warmth" differentiation (hero, card,
  // motion), never a different section READING order, and forcing one
  // here would be exactly the "9 entirely separate fragile
  // implementations" the brief warns against.
  [CATEGORY_VISUAL_KEYS.HOTELS]: ACCOMMODATION_ORDER,
  [CATEGORY_VISUAL_KEYS.APARTMENTS]: ACCOMMODATION_ORDER,
  [CATEGORY_VISUAL_KEYS.VILLAS]: ACCOMMODATION_ORDER,
  [CATEGORY_VISUAL_KEYS.GUEST_HOUSES]: ACCOMMODATION_ORDER,
  // Restaurants/Tours/Car Rentals keep their existing, already-shipped
  // DINING/EXPERIENCE/TRANSPORT orders unchanged.
  [CATEGORY_VISUAL_KEYS.RESTAURANTS]: DINING_ORDER,
  [CATEGORY_VISUAL_KEYS.TOURS]: EXPERIENCE_ORDER,
  [CATEGORY_VISUAL_KEYS.CAR_RENTALS]: TRANSPORT_ORDER,
  // Attractions and Entertainment both currently fall under the single
  // ATTRACTION `listing_type` and so incorrectly shared EXPERIENCE's order
  // — the one real gap `resolvePresentationGroup` couldn't close on its
  // own. Brief §16 gives each an explicit, different example order; mapped
  // here onto the EXISTING canonical sections only (no new section
  // components — brief §12/§13: "visual architecture only" for this pass).
  //
  // Attraction: Gallery -> Story -> Highlights/Facts -> Practical Visit
  // Info -> Map -> Ticket/Opening context. ABOUT is the story; ATTRIBUTES
  // (the Generic Attribute Engine's own facts) are the highlights; visit
  // logistics live across AMENITIES (what's on-site) and POLICIES (visit
  // rules); LOCATION is the map; AVAILABILITY (ticket/opening context, if
  // the listing has any) comes last, before reviews/FAQ.
  [CATEGORY_VISUAL_KEYS.ATTRACTIONS]: [
    SECTIONS.ABOUT,
    SECTIONS.ATTRIBUTES,
    SECTIONS.AMENITIES,
    SECTIONS.POLICIES,
    SECTIONS.LOCATION,
    SECTIONS.AVAILABILITY,
    SECTIONS.REVIEWS,
    SECTIONS.FAQ,
  ],
  // Entertainment: Poster/Gallery -> Date/Time/Venue -> Session/Ticket ->
  // Event info -> Map -> Policies. ABOUT carries the event's own
  // description first (what/why); AVAILABILITY is the session/ticket
  // booking surface, placed early since date/time is the brief's own
  // explicit "strong visual anchor" for this category; LOCATION is the
  // venue map; ATTRIBUTES/AMENITIES/POLICIES (event facts, venue
  // amenities, ticket/entry policy) follow.
  [CATEGORY_VISUAL_KEYS.ENTERTAINMENT_VENUES]: [
    SECTIONS.ABOUT,
    SECTIONS.AVAILABILITY,
    SECTIONS.LOCATION,
    SECTIONS.ATTRIBUTES,
    SECTIONS.POLICIES,
    SECTIONS.AMENITIES,
    SECTIONS.REVIEWS,
    SECTIONS.FAQ,
  ],
});

/**
 * Reorders an already-filtered list of `{id, label}` section entries
 * (only sections the listing actually has content for) to match the
 * given presentation group's reading order. Any id not present in the
 * group's order (shouldn't happen — every canonical id is listed above —
 * but stays defensive for a future new section) is appended at the end
 * in its original relative order, never dropped.
 */
export function reorderSections(sections, group) {
  const order = SECTION_ORDER_BY_GROUP[group] ?? BASE_ORDER;
  const rank = new Map(order.map((id, index) => [id, index]));
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => {
      const rankA = rank.get(a.section.id) ?? order.length + a.index;
      const rankB = rank.get(b.section.id) ?? order.length + b.index;
      return rankA - rankB;
    })
    .map(({ section }) => section);
}

// Booking-CTA copy is the one place category identity should show up in
// the reservation panel — "Reserve your vehicle" reads right for a car
// rental, "Request to book" doesn't. Keyed by group, resolved via i18n
// (`pages.listingDetail.reservation.requestToBook.{group}`) so this
// module only ever returns a translation KEY, never literal copy.
export function resolveBookingCtaKey(group) {
  return `pages.listingDetail.reservation.requestToBookByGroup.${group}`;
}

export default {
  PRESENTATION_GROUPS,
  resolvePresentationGroup,
  CATEGORY_VISUAL_KEYS,
  resolveCategoryVisualKey,
  reorderSections,
  resolveBookingCtaKey,
};

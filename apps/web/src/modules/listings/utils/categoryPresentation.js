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

const SECTION_ORDER_BY_GROUP = Object.freeze({
  // A guest deciding on a place to stay reads what's included in the
  // room and the house rules before a generic spec sheet or a duration/
  // group-size style "Details" block that barely applies to lodging.
  // Sprint C-2: choosing a real room type is the actual booking decision
  // for a Hotel — it comes right after the description, ahead of even
  // the listing's own (house-wide) amenities.
  [PRESENTATION_GROUPS.ACCOMMODATION]: [
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
  ],
  // The itinerary IS the product for a tour/experience/guide — it comes
  // right after the description, ahead of the fine print.
  [PRESENTATION_GROUPS.EXPERIENCE]: [
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
  ],
  // A renter wants the vehicle's own specs (transmission/seats) and
  // what's included with the rental before amenities/policy fine print.
  [PRESENTATION_GROUPS.TRANSPORT]: [
    SECTIONS.ABOUT,
    SECTIONS.ATTRIBUTES,
    SECTIONS.INCLUDED,
    SECTIONS.AMENITIES,
    SECTIONS.POLICIES,
    SECTIONS.AVAILABILITY,
    SECTIONS.LOCATION,
    SECTIONS.REVIEWS,
    SECTIONS.FAQ,
  ],
  // A diner reads the menu right after the description, ahead of even
  // house-wide amenities/policies — the same "the product comes first"
  // placement EXPERIENCE's itinerary already gets.
  [PRESENTATION_GROUPS.DINING]: [
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
  ],
  [PRESENTATION_GROUPS.GENERIC]: BASE_ORDER,
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
  reorderSections,
  resolveBookingCtaKey,
};

/**
 * categoryMotionConfig — Pass 7B (category motion completion, brief §5/§6).
 *
 * Card-level motion (image zoom/filter, price-row accent, title accent)
 * already lives directly in `ListingCardBase.module.scss`'s `[data-category]`
 * selectors — pure CSS, no config needed there. This module covers the
 * OTHER half of brief §5/§6: which single Listing Detail section, if any,
 * gets the more pronounced `ScrollReveal` `depth` variant instead of the
 * default `fade` — "meaningful, restrained category-aware behavior" on
 * the detail page without forking nine page implementations (brief §6).
 *
 * Deliberately ONE section per category, never a whole-page motion
 * redesign — Hotels/Restaurants/Tours/Car Rentals/Attractions/
 * Entertainment each get the section that IS their brief-assigned
 * "product comes first" section (already the first section in their
 * `categoryPresentation.js` reading order) emphasized on scroll-reveal;
 * Apartments/Villas/Guest Houses intentionally have none — their motion
 * character ("calm"/"cinematic"/"warm") is already expressed at the card
 * level, and giving them a detail-page emphasis too would be exactly the
 * "excessive motion" brief §5's rules warn against.
 */

const DETAIL_EMPHASIS_SECTION_BY_CATEGORY = Object.freeze({
  // "room/gallery depth, subtle availability/room reveal"
  hotels: 'rooms',
  // "menu/reservation section reveal" — the deferred Restaurant item,
  // now closed on both card (chips) and detail (this).
  restaurants: 'menu',
  // "itinerary/directional treatment" (kept from Pass 7, now also
  // reflected as the detail-page emphasis, not just the card).
  tours: 'itinerary',
  // "spec-chip / vehicle-info interaction" — the Attributes section
  // carries the vehicle's real specs.
  'car-rentals': 'attributes',
  // "story/fact/highlight reveal" — the Attributes section carries the
  // Generic Attribute Engine's real facts for this listing.
  attractions: 'attributes',
  // "poster/date/session transition" — the Availability section is the
  // session/ticket booking surface.
  'entertainment-venues': 'availability',
});

/**
 * @param {string} categoryVisualKey
 * @returns {string|null} the one canonical section id to render with the
 *   `depth` ScrollReveal variant, or null for no detail-page emphasis.
 */
export function resolveDetailEmphasisSectionId(categoryVisualKey) {
  return DETAIL_EMPHASIS_SECTION_BY_CATEGORY[categoryVisualKey] ?? null;
}

export default { resolveDetailEmphasisSectionId };

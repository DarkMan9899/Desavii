/**
 * categoryCardConfig — Pass 7 (category-specific visual identity, brief
 * §15's explicit acceptance test: "if I remove the badge, can a user still
 * tell this is a Hotel vs Tour vs Car Rental vs Restaurant?"). Small,
 * additive, per-category-slug config for the ONE shared card shell
 * (`ListingCardBase`) — image aspect ratio and the price-unit suffix, the
 * two card dimensions the brief calls out ("price unit", "imagery ratio/
 * treatment") that generalize across every category, unlike cuisine/
 * price-tier chips which stay Restaurant-only real data.
 *
 * Lives in top-level `utils/` (alongside `categoryIcons.js`), not inside
 * `modules/listings/`: it's consumed by `modules/search`'s
 * `SearchResultCard` (every card surface in the app), and `modules/
 * listings` itself already depends on `modules/search` (`RelatedListings`)
 * — a `modules/search -> modules/listings` import here would close a real
 * module dependency cycle. A shared, dependency-free `utils/` module is
 * the existing pattern for exactly this kind of cross-module config.
 *
 * `priceUnitKey` mirrors the REAL seeded `category_pricing_models` mapping
 * (`apps/api/src/infrastructure/database/seeds/007_pricing_and_policies.js`
 * `CATEGORY_PRICING_MODELS`) — each category's first/primary pricing
 * model — so the suffix a card shows ("/ night", "/ day", "/ person") is
 * never a fabricated label, just a client-side mirror of data the backend
 * already establishes per category. `imageAspect` is a presentation
 * choice (brief §5-13's per-category character), not backed by any field.
 */

export const IMAGE_ASPECT = Object.freeze({
  STANDARD: 'standard',
  WIDE: 'wide',
  TALL: 'tall',
});

// No suffix for an unrecognized category — showing an invented "/ night"
// for a category whose real pricing model isn't known would be exactly
// the fabricated-content brief §23 rules out.
const DEFAULT_CARD_CONFIG = Object.freeze({
  imageAspect: IMAGE_ASPECT.STANDARD,
  priceUnitKey: null,
});

const CARD_CONFIG_BY_CATEGORY = Object.freeze({
  // Refined hospitality — unchanged 4:3, differentiation comes from
  // room/stay metadata rather than an unusual crop (brief §5: "Do not use
  // event/tour styling").
  hotels: { imageAspect: IMAGE_ASPECT.STANDARD, priceUnitKey: 'perNight' },
  // Deliberately the SAME aspect as Hotels (brief §6: must not read as
  // "Hotel cards with a different badge" via a gimmick crop) — its
  // differentiation is the calmer composition/copy, not the image shape.
  apartments: { imageAspect: IMAGE_ASPECT.STANDARD, priceUnitKey: 'perNight' },
  // Brief §7: "stronger image presence" — a wider crop gives the cover
  // photo more visual weight than Hotels/Apartments' standard ratio.
  villas: { imageAspect: IMAGE_ASPECT.WIDE, priceUnitKey: 'perNight' },
  'guest-houses': {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perNight',
  },
  // Brief §9/§22: chips (cuisine/price-tier, from the new search DTO
  // fields) do the real differentiation work here — image stays standard.
  restaurants: {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perPerson',
  },
  // Brief §10: "movement, discovery" — a wide, landscape-journey crop.
  tours: { imageAspect: IMAGE_ASPECT.WIDE, priceUnitKey: 'perPerson' },
  // Brief §11: "cleaner, more technical, less editorial" — standard crop,
  // no cinematic treatment; vehicle spec chips carry the differentiation.
  'car-rentals': {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perDay',
  },
  // Brief §12: "editorial image reveal" — a wide, magazine-spread crop.
  attractions: { imageAspect: IMAGE_ASPECT.WIDE, priceUnitKey: 'perPerson' },
  // Brief §13: explicitly "poster/event imagery" — a tall, portrait-poster
  // crop is the one aspect-ratio choice directly named by the brief.
  'entertainment-venues': {
    imageAspect: IMAGE_ASPECT.TALL,
    priceUnitKey: 'perPerson',
  },
});

/**
 * @param {string} categoryVisualKey - a real category slug, or a
 *   lower-cased `listing_type` fallback when the slug isn't known yet.
 * @returns {{imageAspect: string, priceUnitKey: string|null}}
 */
export function resolveCardConfig(categoryVisualKey) {
  return CARD_CONFIG_BY_CATEGORY[categoryVisualKey] ?? DEFAULT_CARD_CONFIG;
}

export default { IMAGE_ASPECT, resolveCardConfig };

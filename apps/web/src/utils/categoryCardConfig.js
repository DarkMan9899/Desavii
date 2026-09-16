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
  // DESAVII category-closure pass — the owner locked outer card geometry
  // to one canonical shape across every category (no per-category media
  // ratio); this used to be `IMAGE_ASPECT.WIDE` (brief §7's "stronger
  // image presence"). Differentiation now lives entirely in metadata/
  // chips/copy, never the outer image crop.
  villas: { imageAspect: IMAGE_ASPECT.STANDARD, priceUnitKey: 'perNight' },
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
  // DESAVII category-closure pass — was `IMAGE_ASPECT.WIDE` (brief §10's
  // "movement, discovery" crop); locked to the canonical standard ratio.
  tours: { imageAspect: IMAGE_ASPECT.STANDARD, priceUnitKey: 'perPerson' },
  // Brief §11: "cleaner, more technical, less editorial" — standard crop,
  // no cinematic treatment; vehicle spec chips carry the differentiation.
  //
  // DESAVII category-closure pass — the earlier `promotedImageAspect:
  // IMAGE_ASPECT.WIDE` override (added in the Step 2.1 correction to
  // shrink an over-tall TOP section) is removed: the owner's global card-
  // geometry lock requires a promoted/TOP card to use the exact same
  // geometry as an ordinary card, full stop — differentiation comes from
  // badge/glow/elevation/section background only, never a different media
  // ratio. The TOP section's own height is now tuned via
  // `CategoryPageContent.module.scss`'s `.carRentalStage` padding instead
  // of by shrinking the card.
  'car-rentals': {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perDay',
  },
  // DESAVII category-closure pass — was `IMAGE_ASPECT.WIDE` (brief §12's
  // "editorial image reveal" crop); locked to the canonical standard
  // ratio.
  attractions: {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perPerson',
  },
  // Emergency visual-regression recovery pass: this was IMAGE_ASPECT.TALL
  // (3:4) — brief §13 originally read "poster/event imagery" as literally
  // a portrait-poster crop, but a 3:4 image box is ~78% taller than the
  // 4:3 `standard` every other category uses, and the owner's own
  // screenshots showed the real result: ordinary Entertainment cards in a
  // grid becoming "enormous 3:4 posters... two cards consume almost the
  // entire viewport". The corrected rule (owner-directed): outer card
  // geometry must be the SAME practical marketplace-card scale across
  // every category — differentiation belongs to media/art treatment,
  // motif, and effects (already covered by this category's hover
  // zoom+brightness in ListingCardBase.module.scss and its TOP depth
  // motif), never to the outer box shape.
  'entertainment-venues': {
    imageAspect: IMAGE_ASPECT.STANDARD,
    priceUnitKey: 'perPerson',
  },
});

/**
 * @param {string} categoryVisualKey - a real category slug, or a
 *   lower-cased `listing_type` fallback when the slug isn't known yet.
 * @returns {{imageAspect: string, promotedImageAspect: string|undefined, priceUnitKey: string|null}}
 */
export function resolveCardConfig(categoryVisualKey) {
  return CARD_CONFIG_BY_CATEGORY[categoryVisualKey] ?? DEFAULT_CARD_CONFIG;
}

export default { IMAGE_ASPECT, resolveCardConfig };

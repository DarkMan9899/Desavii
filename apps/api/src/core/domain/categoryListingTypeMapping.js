/**
 * Step L1 — the deterministic `listing_categories.slug` -> `listing_types`
 * code mapping the taxonomy seed (`003_taxonomy_and_products.js`) already
 * describes in prose ("`listings.listing_type_id` and category membership
 * are intentionally decoupled... the same 'one category, existing type'
 * pattern Apartments/Villas/Guest Houses already establish for PROPERTY")
 * but never encoded anywhere. Pure domain logic, mirrors
 * `listingModerationDecisions.js`'s own shape (a closed lookup table + one
 * resolver function) — deliberately closed, not inferred: a category not
 * listed here has no canonical type and callers must fall back to their
 * own explicit `listingType` (see `ListingService#createListing`).
 *
 * Keyed by `slug`, never `name`/a translated label — a category's slug is
 * the one stable identifier that doesn't change per locale
 * (`listing_category_translations` only translates `name`).
 *
 * No DB migration backs this (L1 boundary: no migration this phase) — this
 * is intentionally code, not data, exactly like `LISTING_TYPES`/
 * `listing_types` already is.
 */

const LISTING_TYPE_BY_CATEGORY_SLUG = Object.freeze({
  hotels: 'HOTEL',
  apartments: 'PROPERTY',
  villas: 'PROPERTY',
  'guest-houses': 'PROPERTY',
  restaurants: 'RESTAURANT',
  tours: 'TOUR',
  'car-rentals': 'CAR_RENTAL',
  attractions: 'ATTRACTION',
  'entertainment-venues': 'ATTRACTION',
});

/**
 * @param {string|null|undefined} categorySlug
 * @returns {string|null} the canonical `listing_types.code`, or `null` if
 *   this slug has no closed-list mapping (an unmapped/future category —
 *   callers fall back to an explicit `listingType` in that case, never a
 *   guess).
 */
export function deriveListingTypeCodeFromCategorySlug(categorySlug) {
  if (typeof categorySlug !== 'string') return null;
  return LISTING_TYPE_BY_CATEGORY_SLUG[categorySlug] ?? null;
}

export { LISTING_TYPE_BY_CATEGORY_SLUG };
export default deriveListingTypeCodeFromCategorySlug;

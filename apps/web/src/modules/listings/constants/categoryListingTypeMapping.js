/**
 * Step L1 — the frontend mirror of the backend's closed
 * `listing_categories.slug -> listing_types.code` mapping
 * (`apps/api/src/core/domain/categoryListingTypeMapping.js`, whose own
 * header explains why this deterministic relationship exists but was
 * never encoded as data — no DB migration backs it, this is code on both
 * sides, kept in sync deliberately, the same way `LISTING_TYPES` already
 * mirrors the backend's `listing_types` enum).
 *
 * The backend remains authoritative (`ListingService#createListing`
 * derives the persisted type server-side regardless of what, if
 * anything, the client sends) — this copy exists so this mapping itself
 * is directly unit-testable without a live server round trip (Step L1
 * brief §18), and as the one place a frontend test can compute the
 * listing type a given category is expected to produce.
 *
 * Keyed by `slug` (the one stable identifier `GET /search/categories`
 * already returns per category — `toCategoryResultResponse`), never a
 * translated `name`.
 */

export const LISTING_TYPE_BY_CATEGORY_SLUG = Object.freeze({
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
 * @returns {string|null}
 */
export function deriveListingTypeFromCategorySlug(categorySlug) {
  if (typeof categorySlug !== 'string') return null;
  return LISTING_TYPE_BY_CATEGORY_SLUG[categorySlug] ?? null;
}

export default deriveListingTypeFromCategorySlug;

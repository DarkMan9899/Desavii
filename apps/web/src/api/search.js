/**
 * Search module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract: the only place that constructs a Search URL or calls
 * `apiClient` directly). Mirrors `apps/api/src/modules/search/
 * module.routes.js` — no endpoint is called here that doesn't exist on
 * the backend.
 *
 * Every function resolves to the raw `{ success, data, meta, error }`
 * envelope; unwrapping into just `data` is a `queries/`-layer concern
 * (Ch. 14), not this layer's.
 */

import apiClient from './client.js';

/**
 * `GET /search/categories` — public taxonomy browse endpoint. Returns
 * every `listing_categories` row (`id, parent_id, slug, name,
 * listing_count` — `searchDto.js`'s `toCategoryResultResponse`), already
 * localized server-side and already carrying a real per-category
 * `listing_count`.
 * @param {{ locale?: string }} params
 */
export function getCategories(params) {
  return apiClient
    .get('/search/categories', { params })
    .then((response) => response.data);
}

/** Phase 20 (SEO) — real seeded cities with published-listing counts, backing destination landing pages. */
export function getDestinations(params) {
  return apiClient
    .get('/search/destinations', { params })
    .then((response) => response.data);
}

/**
 * `GET /search/suggestions` — public typeahead endpoint: published-listing
 * title prefix match (`id, title, slug` — `searchDto.js`'s
 * `toSuggestionResponse`). The backend itself returns an empty list for
 * queries under its own minimum length, so this makes no length
 * assumption of its own.
 * @param {{ q?: string, locale?: string }} params
 */
export function getSuggestions(params) {
  return apiClient
    .get('/search/suggestions', { params })
    .then((response) => response.data);
}

/**
 * `GET /search` — the real Search & Discovery listing search. Returns the
 * flat, already-localized card shape (`id, partner_id, listing_type, slug,
 * status, title, summary, city_id, city_name, country_id,
 * cover_image_url, created_at` — `searchDto.js`'s `toSearchResultResponse`),
 * not `GET /listings`' bare summary — no per-row follow-up call is needed
 * to render a result card. Only params the backend validator
 * (`modules/search/validators/searchValidators.js`) actually accepts are
 * ever sent — see `docs/API_SPECIFICATION.md` §14.1 for each one's
 * meaning. The first page's `meta.total` is the whole filtered count.
 * @param {{ keyword?: string, categoryId?: number, listingType?: string,
 *   cityId?: number, countryId?: number, partnerId?: number,
 *   locale?: string, sort?: string, dateFrom?: string, dateTo?: string,
 *   guests?: number, priceMin?: number, priceMax?: number,
 *   excludeCategoryTop?: 'true', cursor?: string, limit?: number }} params
 */
export function searchListings(params) {
  return apiClient.get('/search', { params }).then((response) => response.data);
}

/**
 * `GET /search/filters` — the dynamic filter metadata endpoint (Phase 4.2).
 * Returns `{ groups: [{ code, definitions: [{ code, input_type,
 * value_source, unit, min, max, is_multi_valued, options: [{ value, code }]
 * }] }] }` — every field the frontend needs to render the right control per
 * filter and to know which query params it accepts, without any filter
 * list ever being hardcoded here. Omitting `categoryId` returns only the
 * catalog's global filters (currently just amenities).
 * @param {{ categoryId?: number }} params
 */
export function getSearchFilterDefinitions(params) {
  return apiClient
    .get('/search/filters', { params })
    .then((response) => response.data);
}

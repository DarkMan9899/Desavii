/**
 * Search query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `search` React Query hook builds its key through this, never an ad hoc
 * array, mirroring `modules/listings/constants/queryKeys.js`.
 */

import listingKeys from '../../listings/constants/queryKeys.js';

const searchKeys = {
  all: ['search'],
  // The category list is one cache entry app-wide: the header navigation
  // (`useCategoriesQuery`) and Listing Detail / the Partner wizard
  // (`useListingCategoriesQuery`) read the same `GET /search/categories`,
  // so they share the listings key (search may depend on listings, never
  // the reverse) and the page never fetches it twice. Names are localized
  // server-side, so the locale is part of the key.
  categories: (locale) => listingKeys.categories(locale),
  // Destination counts can be scoped to one category (Search's picker).
  destinations: (locale, categoryId) => [
    ...searchKeys.all,
    'destinations',
    { locale, categoryId },
  ],
  results: (filters) => [...searchKeys.all, 'results', filters],
  // The same params as `results` (incl. locale): List and Map of one
  // search are cached side by side, never mixed.
  map: (filters) => [...searchKeys.all, 'map', filters],
  // Amenity labels are localized server-side — per category AND locale.
  filterDefinitions: (categoryId, locale) => [
    ...searchKeys.all,
    'filterDefinitions',
    { categoryId, locale },
  ],
};

export default searchKeys;

/**
 * Search query-key factory (FRONTEND_ARCHITECTURE.md §14.1) — every
 * `search` React Query hook builds its key through this, never an ad hoc
 * array, mirroring `modules/listings/constants/queryKeys.js`.
 */

const searchKeys = {
  all: ['search'],
  // Names are localized server-side, so the locale is part of the key —
  // otherwise whichever language loaded first would stay cached for all.
  categories: (locale) => [...searchKeys.all, 'categories', { locale }],
  // Destination counts can be scoped to one category (Search's picker).
  destinations: (locale, categoryId) => [
    ...searchKeys.all,
    'destinations',
    { locale, categoryId },
  ],
  suggestions: (query) => [...searchKeys.all, 'suggestions', { query }],
  results: (filters) => [...searchKeys.all, 'results', filters],
  // Amenity labels are localized server-side — per category AND locale.
  filterDefinitions: (categoryId, locale) => [
    ...searchKeys.all,
    'filterDefinitions',
    { categoryId, locale },
  ],
};

export default searchKeys;

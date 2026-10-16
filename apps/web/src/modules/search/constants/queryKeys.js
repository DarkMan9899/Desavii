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
  destinations: (locale) => [...searchKeys.all, 'destinations', { locale }],
  suggestions: (query) => [...searchKeys.all, 'suggestions', { query }],
  results: (filters) => [...searchKeys.all, 'results', filters],
  filterDefinitions: (categoryId) => [
    ...searchKeys.all,
    'filterDefinitions',
    { categoryId },
  ],
};

export default searchKeys;

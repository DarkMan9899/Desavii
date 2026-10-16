/**
 * Search/listing sort options — a frontend-side mirror of the backend's
 * real, fixed enum (`apps/api/src/core/domain/sortOptions.js`'s
 * `SORT_KEYS`/`DEFAULT_SORT_KEY`), not an invented option set. `relevance`
 * only means anything once a `keyword` is present (the backend silently
 * falls back to `newest` otherwise) — a `requiresKeyword` consumer hides
 * that option until it would actually do something, rather than
 * presenting a dead choice.
 *
 * Lives at this top-level, non-module-owned location (rather than inside
 * `modules/search/`) because it's shared by more than one module whose
 * dependency direction would otherwise conflict: `search` may depend on
 * `listings`, never the reverse (FRONTEND_ARCHITECTURE.md §6.3), yet
 * `modules/listings/queries/useMyListingsQuery.js` (Phase 9: Partner
 * Dashboard) also needs this exact enum for its own sort control. Same
 * "small set of truly cross-module" rationale the top-level `queries/`/
 * `mutations/` folders already document.
 */

export const SORT_KEYS = Object.freeze([
  'newest',
  'oldest',
  'alphabetical',
  'relevance',
  'price_asc',
  'price_desc',
]);

export const DEFAULT_SORT_KEY = 'newest';

export const SORT_OPTION_META = Object.freeze({
  newest: { requiresKeyword: false },
  oldest: { requiresKeyword: false },
  alphabetical: { requiresKeyword: false },
  relevance: { requiresKeyword: true },
  price_asc: { requiresKeyword: false },
  price_desc: { requiresKeyword: false },
});

export default {
  SORT_KEYS,
  DEFAULT_SORT_KEY,
  SORT_OPTION_META,
};

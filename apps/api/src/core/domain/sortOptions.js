/**
 * Search sort-option resolution — Sprint 8's "newest/oldest/alphabetical/
 * relevance" sorting (`API_SPECIFICATION.md` §14), plus price low-to-high,
 * high-to-low and top rated. Pure domain lookup,
 * mirrors `listingStatusTransitions.js`'s shape.
 *
 * `relevance` only means something when a keyword was supplied (it orders
 * by FULLTEXT match score, `modules/search/repositories/
 * mysqlSearchRepository.js`) — requesting it without a keyword resolves to
 * `newest` rather than erroring, a documented fallback rather than a
 * silent bug (BACKEND_ARCHITECTURE.md §10 validation strategy: a
 * meaningless-but-harmless combination degrades gracefully).
 */

const SORT_OPTIONS = Object.freeze({
  newest: Object.freeze({
    column: 'created_at',
    direction: 'DESC',
    requiresKeyword: false,
  }),
  oldest: Object.freeze({
    column: 'created_at',
    direction: 'ASC',
    requiresKeyword: false,
  }),
  alphabetical: Object.freeze({
    column: 'title',
    direction: 'ASC',
    requiresKeyword: false,
  }),
  relevance: Object.freeze({
    column: 'relevance_score',
    direction: 'DESC',
    requiresKeyword: true,
  }),
  // Search & Discovery rebuild: by the card's own AMD "from" price. Each
  // direction has its own never-NULL sort key (see
  // `mysqlSearchRepository.js`) so unpriced listings always come last and
  // keyset pagination stays a plain tuple comparison.
  price_asc: Object.freeze({
    column: 'price_sort_asc',
    direction: 'ASC',
    requiresKeyword: false,
  }),
  price_desc: Object.freeze({
    column: 'price_sort_desc',
    direction: 'DESC',
    requiresKeyword: false,
  }),
  // Search & Discovery remediation: best approved-review average first;
  // listings with no approved review last (`rating_sort` never NULL).
  rating_desc: Object.freeze({
    column: 'rating_sort',
    direction: 'DESC',
    requiresKeyword: false,
  }),
});

export const SORT_KEYS = Object.freeze(Object.keys(SORT_OPTIONS));

export const DEFAULT_SORT_KEY = 'newest';

/**
 * @param {string} sortKey
 * @param {{hasKeyword?: boolean}} [options]
 * @returns {{key: string, column: string, direction: 'ASC'|'DESC', requiresKeyword: boolean}}
 */
export function resolveSortOption(sortKey, { hasKeyword = false } = {}) {
  const option = SORT_OPTIONS[sortKey];
  if (!option) {
    throw new TypeError(`Unknown sort option "${sortKey}".`);
  }
  if (option.requiresKeyword && !hasKeyword) {
    return { key: DEFAULT_SORT_KEY, ...SORT_OPTIONS[DEFAULT_SORT_KEY] };
  }
  return { key: sortKey, ...option };
}

export default {
  SORT_KEYS,
  DEFAULT_SORT_KEY,
  resolveSortOption,
};

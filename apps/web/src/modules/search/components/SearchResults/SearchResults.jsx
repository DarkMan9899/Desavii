/**
 * SearchResults — grid + loading/empty/error/pagination states.
 *
 * Search & Discovery rebuild: the result count moved up into
 * `SearchToolbar`, which reports the whole filtered total, not the cards
 * loaded so far. While a changed search loads, the previous cards stay in
 * place, dimmed and `aria-busy` (`isUpdating`), instead of the grid
 * collapsing to skeletons and back. The empty state can offer one way
 * out (`emptyActionLabel`/`onEmptyAction`, e.g. Clear filters).
 *
 * Deliberately prop-driven and unaware of React Query, filter state, or
 * "classic" vs. a hypothetical future AI search mode — it only knows
 * about a flat `results` array plus a handful of booleans/callbacks
 * (FRONTEND_ARCHITECTURE.md's "future AI Search" extensibility note in
 * the Phase 4 brief: a different query hook could feed this exact same
 * component later without any change here).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import SearchResultCard from '../SearchResultCard/SearchResultCard.jsx';
import { PLACEMENTS } from '../../../../analytics/index.js';
import styles from './SearchResults.module.scss';

const SKELETON_COUNT = 8;

export default function SearchResults({
  results,
  isPending,
  isError,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  isUpdating = false,
  emptyDescription = undefined,
  emptyActionLabel = undefined,
  onEmptyAction = undefined,
  // Step A3 (engagement analytics) — this same component renders Search
  // results, Category/Destination organic grids, and Home's
  // PopularExperiences carousel, all through `useSearchListingsQuery` —
  // every one of them is `search_results` placement per A1's own locked
  // rule (see `analytics/constants.js`'s own comment), so the caller
  // only ever needs to override `searchContext` (queryText/categoryCode),
  // never `placement` itself.
  searchContext = undefined,
}) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          // Skeleton placeholders are positionally static, non-reorderable.
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={index} variant="rect" height={280} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title={t('search.results.error.title')}
        description={t('search.results.error.description')}
        retryLabel={t('search.results.error.retry')}
        onRetry={onRetry}
      />
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        title={t('search.results.empty.title')}
        description={emptyDescription ?? t('search.results.empty.description')}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  return (
    <div
      className={isUpdating ? styles.updating : undefined}
      aria-busy={isUpdating || undefined}
    >
      <div className={styles.grid}>
        {results.map((result, index) => (
          <SearchResultCard
            key={result.id}
            result={result}
            placement={PLACEMENTS.SEARCH_RESULTS}
            position={index}
            searchContext={searchContext}
          />
        ))}
      </div>
      {hasNextPage && (
        <div className={styles.loadMore}>
          <Button
            variant="secondary"
            onClick={onLoadMore}
            loading={isFetchingNextPage}
          >
            {t('search.results.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

SearchResults.propTypes = {
  // Real `GET /search` row shapes (FRONTEND_ARCHITECTURE.md §10.8's
  // normalized-but-untyped response), not a hand-authored prop contract.
  // eslint-disable-next-line react/forbid-prop-types
  results: PropTypes.arrayOf(PropTypes.object).isRequired,
  isPending: PropTypes.bool.isRequired,
  isError: PropTypes.bool.isRequired,
  onRetry: PropTypes.func.isRequired,
  hasNextPage: PropTypes.bool.isRequired,
  isFetchingNextPage: PropTypes.bool.isRequired,
  onLoadMore: PropTypes.func.isRequired,
  isUpdating: PropTypes.bool,
  emptyDescription: PropTypes.string,
  emptyActionLabel: PropTypes.string,
  onEmptyAction: PropTypes.func,
  searchContext: PropTypes.shape({
    queryText: PropTypes.string,
    categoryCode: PropTypes.string,
  }),
};

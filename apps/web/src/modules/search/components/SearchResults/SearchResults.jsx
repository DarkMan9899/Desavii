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
 *
 * Beside the Map (`layout="split"`) the grid is narrower, and the List and
 * the Map point at each other: a card hovered or focused reports itself
 * (`onActiveChange`) so its marker stands out, and the listing selected on
 * the map (`selectedId`) is outlined and scrolled into view — the link
 * never depends on hover alone.
 */

import { useEffect, useRef } from 'react';
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
import useReducedMotion from '../../../../hooks/useReducedMotion.js';
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
  layout = 'grid',
  selectedId = undefined,
  activeId = undefined,
  onActiveChange = undefined,
}) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const listRef = useRef(null);
  const gridClassName = layout === 'split' ? styles.splitGrid : styles.grid;

  useEffect(() => {
    if (selectedId === undefined) return;
    listRef.current
      ?.querySelector(`[data-listing-id="${selectedId}"]`)
      ?.scrollIntoView({
        block: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
  }, [selectedId, prefersReducedMotion]);

  if (isPending) {
    return (
      <div className={gridClassName}>
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
      <div ref={listRef} className={gridClassName}>
        {results.map((result, index) => {
          const card = (
            <SearchResultCard
              key={result.id}
              result={result}
              placement={PLACEMENTS.SEARCH_RESULTS}
              position={index}
              searchContext={searchContext}
            />
          );
          if (!onActiveChange) return card;
          return (
            <div
              key={result.id}
              className={styles.cardSlot}
              data-listing-id={result.id}
              data-selected={result.id === selectedId || undefined}
              data-active={result.id === activeId || undefined}
              onMouseEnter={() => onActiveChange(result.id)}
              onMouseLeave={() => onActiveChange(undefined)}
              onFocus={() => onActiveChange(result.id)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  onActiveChange(undefined);
                }
              }}
            >
              {card}
            </div>
          );
        })}
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
  /** `split`: the narrower grid beside the Map. */
  layout: PropTypes.oneOf(['grid', 'split']),
  selectedId: PropTypes.number,
  activeId: PropTypes.number,
  /** `(id | undefined)`: the card hovered or focused, for the Map. */
  onActiveChange: PropTypes.func,
};

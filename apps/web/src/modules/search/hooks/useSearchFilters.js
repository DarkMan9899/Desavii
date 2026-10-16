/**
 * `useSearchFilters` — the URL is the single source of truth for Search
 * filter state (FRONTEND_ARCHITECTURE.md's URL-sync rule); this hook is
 * the only thing that reads or writes it.
 *
 * Reading: `parseSearchParams` then `normalizeSearchFilters`
 * (`schemas/searchParams.js`). Until the catalogs a URL depends on have
 * loaded (`categories` for a `categoryId`/`?category=` slug,
 * `destinations` for a `cityId`), `isResolved` is false and the caller
 * holds the search back, so a deep link never fires one request for the
 * raw URL and a second for its resolved meaning.
 *
 * Canonical URL: once resolved, a URL that differs from its canonical
 * form (a nav slug, a stale past date, a range on a single-day
 * category, junk params) is replaced in place. The canonical form parses
 * to the same filters, so the search request it maps to is unchanged —
 * no second request, no extra history entry.
 *
 * Writing: every applied change pushes one history entry (Back undoes
 * exactly that change); `{ replace: true }` is for corrections that
 * aren't user actions. `updateFilters` drops the whole `dynamicFilters`
 * bag the moment the category changes (unless the caller supplies its
 * own): a filter from the old category's catalog (e.g. `bedrooms`) is
 * meaningless under the new one, and leaving it would keep narrowing
 * results by a filter nothing on screen shows. The new category's
 * date/party rules are applied by normalizing again before writing.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  parseSearchParams,
  normalizeSearchFilters,
  buildSearchParams,
} from '../schemas/searchParams.js';
import { DEFAULT_SORT_KEY } from '../../../constants/sortOptions.js';
import { getBusinessToday } from '../../../utils/businessDate.js';

/** Order-insensitive equality, so a reordered URL is not "different". */
function isSameSearch(a, b) {
  const sorted = (params) => {
    const copy = new URLSearchParams(params);
    copy.sort();
    return copy.toString();
  };
  return sorted(a) === sorted(b);
}

export function countActiveFilters(filters) {
  return (
    [
      filters.destination,
      filters.categoryId,
      filters.cityId,
      filters.dateFrom,
      filters.guests,
      filters.priceMin !== undefined || filters.priceMax !== undefined,
    ].filter(Boolean).length + Object.keys(filters.dynamicFilters).length
  );
}

/**
 * @param {{ categories?: Array<object>, destinations?: Array<object> }} catalogs
 */
export function useSearchFilters({ categories, destinations } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getBusinessToday();

  const { filters, categorySlug, isResolved } = useMemo(
    () =>
      normalizeSearchFilters(parseSearchParams(searchParams, { today }), {
        categories,
        destinations,
      }),
    [searchParams, today, categories, destinations],
  );

  useEffect(() => {
    if (!isResolved) return;
    const canonical = buildSearchParams(filters);
    if (!isSameSearch(canonical, searchParams)) {
      setSearchParams(canonical, { replace: true });
    }
  }, [isResolved, filters, searchParams, setSearchParams]);

  const writeFilters = useCallback(
    (next, { replace = false } = {}) => {
      const { filters: normalized } = normalizeSearchFilters(next, {
        categories,
        destinations,
      });
      setSearchParams(buildSearchParams(normalized), { replace });
    },
    [categories, destinations, setSearchParams],
  );

  const updateFilters = useCallback(
    (partial, options) => {
      const next = { ...filters, ...partial };
      if (
        'categoryId' in partial &&
        partial.categoryId !== filters.categoryId &&
        !('dynamicFilters' in partial)
      ) {
        next.dynamicFilters = {};
      }
      writeFilters(next, options);
    },
    [filters, writeFilters],
  );

  /** `patch` is `{ [key]: value }`; an empty value removes that key. */
  const updateDynamicFilter = useCallback(
    (patch) => {
      const nextDynamicFilters = { ...filters.dynamicFilters };
      Object.entries(patch).forEach(([key, value]) => {
        if (value) {
          nextDynamicFilters[key] = value;
        } else {
          delete nextDynamicFilters[key];
        }
      });
      updateFilters({ dynamicFilters: nextDynamicFilters });
    },
    [filters.dynamicFilters, updateFilters],
  );

  // Sort is how results are ordered, not a filter — "Clear filters"
  // keeps it.
  const clearFilters = useCallback(() => {
    writeFilters({
      destination: '',
      sort: filters.sort ?? DEFAULT_SORT_KEY,
      dynamicFilters: {},
    });
  }, [filters.sort, writeFilters]);

  const activeFilterCount = countActiveFilters(filters);

  return {
    filters,
    categorySlug,
    isResolved,
    updateFilters,
    updateDynamicFilter,
    clearFilters,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
}

export default useSearchFilters;

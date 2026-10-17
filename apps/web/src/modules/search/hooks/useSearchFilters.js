/**
 * `useSearchFilters` — the URL is the single source of truth for Search
 * filter state (FRONTEND_ARCHITECTURE.md's URL-sync rule); this hook is
 * the only thing that reads or writes it.
 *
 * Reading: `parseSearchParams` then `normalizeSearchFilters`
 * (`schemas/searchParams.js`), in two passes — first against the
 * categories/destinations catalogs (resolving the category), then also
 * against that category's filter catalog (`GET /search/filters`, exposed
 * here as `filterGroups` so the page renders from the same data). Until
 * every catalog a URL depends on has loaded, `isResolved` is false and the
 * caller holds the search back, so a deep link never fires one request for
 * the raw URL and a second for its resolved meaning.
 *
 * Canonical URL: once resolved, a URL that differs from its canonical
 * form (a nav slug, a stale past date, a range on a single-day category,
 * a filter the category does not offer, junk params) is replaced in
 * place. The canonical form maps to the same request — no second request,
 * no extra history entry.
 *
 * Writing (live filtering): every applied change pushes one history entry
 * (Back undoes exactly that change). A write that would not change the URL
 * is skipped — pressing Search on an already-applied state sends nothing.
 * Changing the category drops every category-specific filter (a Hotels
 * `bedrooms` means nothing for Restaurants) but keeps the global ones
 * (`GLOBAL_DYNAMIC_KEYS`, plus price, dates, destination, keyword); the new
 * category's date/party rules apply on the next normalize.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  parseSearchParams,
  normalizeSearchFilters,
  buildSearchParams,
  GLOBAL_DYNAMIC_KEYS,
} from '../schemas/searchParams.js';
import { useRenderableFilterGroups } from './useRenderableFilterGroups.js';
import { getFilterParamKeys } from '../components/DynamicFilterPanel/filterParamKey.js';
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

function keepGlobalDynamicFilters(dynamicFilters) {
  return Object.fromEntries(
    Object.entries(dynamicFilters).filter(([key]) =>
      GLOBAL_DYNAMIC_KEYS.includes(key),
    ),
  );
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
 * @param {{ categories?: Array<object>, destinations?: Array<object>, locale?: string }} catalogs
 */
export function useSearchFilters({ categories, destinations, locale } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getBusinessToday();

  const parsed = useMemo(
    () => parseSearchParams(searchParams, { today }),
    [searchParams, today],
  );
  const categoryPass = useMemo(
    () => normalizeSearchFilters(parsed, { categories, destinations }),
    [parsed, categories, destinations],
  );
  const needsCategories =
    parsed.categoryId !== undefined || parsed.categorySlug !== undefined;
  const isCategoryKnown = !needsCategories || Boolean(categories);

  const { groups: filterGroups, isPending: isCatalogPending } =
    useRenderableFilterGroups(categoryPass.filters.categoryId, locale, {
      enabled: isCategoryKnown,
    });
  const filterParamKeys = useMemo(
    () =>
      isCatalogPending
        ? undefined
        : new Set(
            filterGroups.flatMap((group) =>
              group.definitions.flatMap(getFilterParamKeys),
            ),
          ),
    [isCatalogPending, filterGroups],
  );

  const { filters, categorySlug, isResolved } = useMemo(
    () =>
      normalizeSearchFilters(parsed, {
        categories,
        destinations,
        filterParamKeys,
      }),
    [parsed, categories, destinations, filterParamKeys],
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
      // The current catalog only describes the current category; a new
      // category's filters are checked once its own catalog has loaded.
      const { filters: normalized } = normalizeSearchFilters(next, {
        categories,
        destinations,
        filterParamKeys:
          next.categoryId === filters.categoryId ? filterParamKeys : undefined,
      });
      const params = buildSearchParams(normalized);
      if (isSameSearch(params, searchParams)) return;
      setSearchParams(params, { replace });
    },
    [
      categories,
      destinations,
      filters.categoryId,
      filterParamKeys,
      searchParams,
      setSearchParams,
    ],
  );

  const updateFilters = useCallback(
    (partial, options) => {
      const next = { ...filters, ...partial };
      if (
        'categoryId' in partial &&
        partial.categoryId !== filters.categoryId &&
        !('dynamicFilters' in partial)
      ) {
        next.dynamicFilters = keepGlobalDynamicFilters(filters.dynamicFilters);
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
    filterGroups,
    isCatalogPending,
    updateFilters,
    updateDynamicFilter,
    clearFilters,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0,
  };
}

export default useSearchFilters;

/**
 * `useCategoriesQuery` — wraps `GET /search/categories`
 * (FRONTEND_ARCHITECTURE.md §14: React Query owns everything that
 * originates from the API). Returns the real `listing_categories` rows
 * directly — no per-row follow-up call is needed since this endpoint
 * already returns everything a category tile needs (`id`, `slug`,
 * `name`, `listing_count`).
 *
 * `staleTime: 5 minutes` — a taxonomy list changes far less often than
 * listings/search results (§14.2's cache-class guidance), so a longer
 * stale window avoids refetching it on every homepage visit.
 */

import { useQuery } from '@tanstack/react-query';
import { getCategories } from '../../../api/search.js';
import searchKeys from '../constants/queryKeys.js';

export function useCategoriesQuery({ locale } = {}) {
  return useQuery({
    queryKey: searchKeys.categories(locale),
    queryFn: async () => {
      const { data } = await getCategories({ locale });
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default useCategoriesQuery;

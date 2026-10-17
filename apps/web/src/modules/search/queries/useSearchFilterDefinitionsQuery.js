/**
 * `useSearchFilterDefinitionsQuery` — wraps `GET /search/filters`
 * (FRONTEND_ARCHITECTURE.md §14: React Query owns everything that
 * originates from the API). This is the ONLY source of the dynamic filter
 * catalog `DynamicFilterPanel` renders — no filter list is ever hardcoded
 * in a component.
 *
 * Refetches whenever `categoryId` changes (it's part of the query key),
 * which is exactly what makes "the filter list automatically changes when
 * category changes" work: `DynamicFilterPanel` always renders whatever
 * this hook's `data` currently holds.
 *
 * `staleTime: 5 minutes` — same cache class as `useCategoriesQuery`
 * (reference-shaped metadata, not search results).
 */

import { useQuery } from '@tanstack/react-query';
import { getSearchFilterDefinitions } from '../../../api/search.js';
import searchKeys from '../constants/queryKeys.js';

export function useSearchFilterDefinitionsQuery(
  categoryId,
  locale,
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: searchKeys.filterDefinitions(categoryId, locale),
    queryFn: async () => {
      const { data } = await getSearchFilterDefinitions({
        categoryId,
        locale,
      });
      return data.groups;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export default useSearchFilterDefinitionsQuery;

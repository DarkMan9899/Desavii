/**
 * `useSearchMapQuery` — wraps `GET /search/map`: the markers for exactly
 * the search the List shows (`toSearchQueryParams` builds both requests
 * from the same committed filters), for the whole match rather than one
 * List page. Enabled only while the Map is shown. Like the List, a
 * superseded request is aborted (`signal`), so a slow, older answer never
 * lands last. The previous answer is kept as placeholder data so the
 * panel stays in place while a changed search loads; `SearchMapPanel`
 * withdraws its markers meanwhile, never placing or clustering them.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchMap } from '../../../api/search.js';
import searchKeys from '../constants/queryKeys.js';
import { toSearchQueryParams } from '../schemas/searchParams.js';

/**
 * @param {object} filters - the committed Search filters (`useSearchFilters`)
 * @param {{ locale?: string, enabled?: boolean }} [options]
 */
export function useSearchMapQuery(filters, { locale, enabled = true } = {}) {
  const queryParams = toSearchQueryParams(filters, locale);
  return useQuery({
    queryKey: searchKeys.map(queryParams),
    queryFn: ({ signal }) => searchMap(queryParams, { signal }),
    staleTime: 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}

export default useSearchMapQuery;

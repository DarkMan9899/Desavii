/**
 * `useDestinationsQuery` — wraps `GET /search/destinations` (Phase 20,
 * SEO). Mirrors `useCategoriesQuery`'s exact shape for the city
 * equivalent — real seeded cities, each already carrying its
 * published-listing count, no per-row follow-up call needed.
 */

import { useQuery } from '@tanstack/react-query';
import { getDestinations } from '../../../api/search.js';
import searchKeys from '../constants/queryKeys.js';

export function useDestinationsQuery({ locale } = {}) {
  return useQuery({
    queryKey: searchKeys.destinations(locale),
    queryFn: async () => {
      const { data } = await getDestinations({ locale });
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default useDestinationsQuery;

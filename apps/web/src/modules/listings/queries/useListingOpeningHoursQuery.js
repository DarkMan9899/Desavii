/**
 * `useListingOpeningHoursQuery` — wraps the public `GET
 * /listings/:id/opening-hours` (Pass 6, Restaurant vertical). Used by
 * both the public Listing Detail page and the Partner Opening Hours
 * editor, same read, same cache key — mirrors `useListingMenuQuery.js`.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingOpeningHours } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useListingOpeningHoursQuery(listingId) {
  return useQuery({
    queryKey: listingKeys.openingHours(listingId),
    queryFn: async () => {
      const { data } = await getListingOpeningHours(listingId);
      return data;
    },
    enabled: Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default useListingOpeningHoursQuery;

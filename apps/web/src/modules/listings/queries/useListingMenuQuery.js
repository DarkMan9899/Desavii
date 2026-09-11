/**
 * `useListingMenuQuery` — wraps the public `GET /listings/:id/menu`
 * (Pass 3 remediation, Restaurant vertical). Used by both the public
 * Listing Detail page (RESTAURANT listings only) and the Partner Menu
 * Manager, same read, same cache key.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingMenu } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useListingMenuQuery(listingId, locale) {
  return useQuery({
    queryKey: listingKeys.menu(listingId, locale),
    queryFn: async () => {
      const { data } = await getListingMenu(listingId, { locale });
      return data;
    },
    enabled: Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default useListingMenuQuery;

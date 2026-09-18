/**
 * `useAdminListingsQuery` — wraps `GET /listings/admin` (admin
 * moderation queue), cursor-paginated the same way every other admin
 * list in this app is (`useInfiniteQuery` + "Load more").
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getAdminListings } from '../../../api/listings.js';

export const ADMIN_LISTINGS_LIMIT = 20;

export function useAdminListingsQuery({
  keyword,
  moderationStatus,
  status,
  lifecycleFilter,
} = {}) {
  return useInfiniteQuery({
    queryKey: [
      'admin',
      'listings',
      { keyword, moderationStatus, status, lifecycleFilter },
    ],
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await getAdminListings({
        keyword: keyword || undefined,
        moderationStatus: moderationStatus || undefined,
        status: status || undefined,
        lifecycleFilter: lifecycleFilter || undefined,
        limit: ADMIN_LISTINGS_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    staleTime: 30 * 1000,
  });
}

export default useAdminListingsQuery;

/**
 * `usePartnerAnalyticsListingsQuery` — `GET /analytics/partner/listings`
 * (Step A5). Mirrors `usePartnerBookingsQuery`'s established shape
 * exactly: `useInfiniteQuery` feeding a "Load more" `DataTable` footer
 * (this codebase's cursor-pagination convention for dashboard tables),
 * never `useQuery` re-fetched per page and never all pages loaded
 * locally then paginated client-side (brief §23).
 *
 * Cache key omits `cursor` (accumulated within one key, like every other
 * infinite query here) but includes `sort` — changing sort is a new
 * server-side ordering, not a page within the same list (brief §39).
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { listPartnerAnalyticsListings } from '../api/partnerAnalytics.js';
import partnerAnalyticsKeys from '../constants/queryKeys.js';

export const LISTINGS_PAGE_LIMIT = 20;

export function usePartnerAnalyticsListingsQuery({
  partnerId,
  rangeDays,
  sort,
}) {
  return useInfiniteQuery({
    queryKey: partnerAnalyticsKeys.listings(partnerId, rangeDays, sort),
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await listPartnerAnalyticsListings({
        partnerId,
        range: rangeDays,
        sort,
        limit: LISTINGS_PAGE_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    enabled: Boolean(partnerId),
    staleTime: 60 * 1000,
  });
}

export default usePartnerAnalyticsListingsQuery;

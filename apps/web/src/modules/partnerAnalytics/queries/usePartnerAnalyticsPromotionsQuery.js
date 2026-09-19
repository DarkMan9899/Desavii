/**
 * `usePartnerAnalyticsPromotionsQuery` — `GET /analytics/partner/promotions`
 * (Step A6.1). Mirrors `usePartnerAnalyticsListingsQuery`'s shape exactly:
 * `useInfiniteQuery` feeding a "Load more" `DataTable` footer, cache key
 * scoped by `partnerId` + `rangeDays` (no client sort param — the
 * endpoint's sort is fixed server-side, brief §8).
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { listPartnerAnalyticsPromotions } from '../api/partnerAnalytics.js';
import partnerAnalyticsKeys from '../constants/queryKeys.js';

export const PROMOTIONS_PAGE_LIMIT = 20;

export function usePartnerAnalyticsPromotionsQuery({ partnerId, rangeDays }) {
  return useInfiniteQuery({
    queryKey: partnerAnalyticsKeys.promotions(partnerId, rangeDays),
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await listPartnerAnalyticsPromotions({
        partnerId,
        range: rangeDays,
        limit: PROMOTIONS_PAGE_LIMIT,
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

export default usePartnerAnalyticsPromotionsQuery;

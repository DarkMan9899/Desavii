/**
 * `usePartnerAnalyticsOverviewQuery` — `GET /analytics/partner/overview`
 * (Step A5). Cache key is scoped by `partnerId` + `rangeDays` (brief
 * §39): switching the active partner or the selected range always
 * resolves to its own cache entry, never a stale sibling's.
 */

import { useQuery } from '@tanstack/react-query';
import { getPartnerAnalyticsOverview } from '../api/partnerAnalytics.js';
import partnerAnalyticsKeys from '../constants/queryKeys.js';

export function usePartnerAnalyticsOverviewQuery({ partnerId, rangeDays }) {
  return useQuery({
    queryKey: partnerAnalyticsKeys.overview(partnerId, rangeDays),
    queryFn: async () => {
      const { data } = await getPartnerAnalyticsOverview({
        partnerId,
        range: rangeDays,
      });
      return data;
    },
    enabled: Boolean(partnerId),
    staleTime: 60 * 1000,
  });
}

export default usePartnerAnalyticsOverviewQuery;

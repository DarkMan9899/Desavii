/**
 * `usePartnerAnalyticsPromotionDetailQuery` —
 * `GET /analytics/partner/promotions/:promotionId` (Step A5). `enabled`
 * requires a real, already-known `promotionId` — this module never
 * discovers promotion ids on its own (brief §31/§33: A5 exposes no
 * partner-facing promotion-list endpoint, so nothing here invents N+1
 * discovery to build one).
 */

import { useQuery } from '@tanstack/react-query';
import { getPartnerAnalyticsPromotionDetail } from '../api/partnerAnalytics.js';
import partnerAnalyticsKeys from '../constants/queryKeys.js';

export function usePartnerAnalyticsPromotionDetailQuery({
  partnerId,
  promotionId,
  rangeDays,
}) {
  return useQuery({
    queryKey: partnerAnalyticsKeys.promotionDetail(
      partnerId,
      promotionId,
      rangeDays,
    ),
    queryFn: async () => {
      const { data } = await getPartnerAnalyticsPromotionDetail({
        partnerId,
        promotionId,
        range: rangeDays,
      });
      return data;
    },
    enabled: Boolean(partnerId) && Boolean(promotionId),
    staleTime: 60 * 1000,
  });
}

export default usePartnerAnalyticsPromotionDetailQuery;

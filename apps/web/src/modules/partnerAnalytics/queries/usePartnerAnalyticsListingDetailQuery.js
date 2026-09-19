/**
 * `usePartnerAnalyticsListingDetailQuery` —
 * `GET /analytics/partner/listings/:listingId` (Step A5). `enabled` on
 * both `partnerId` and `listingId` — never queried before a listing is
 * actually selected/deep-linked to.
 */

import { useQuery } from '@tanstack/react-query';
import { getPartnerAnalyticsListingDetail } from '../api/partnerAnalytics.js';
import partnerAnalyticsKeys from '../constants/queryKeys.js';

export function usePartnerAnalyticsListingDetailQuery({
  partnerId,
  listingId,
  rangeDays,
}) {
  return useQuery({
    queryKey: partnerAnalyticsKeys.listingDetail(
      partnerId,
      listingId,
      rangeDays,
    ),
    queryFn: async () => {
      const { data } = await getPartnerAnalyticsListingDetail({
        partnerId,
        listingId,
        range: rangeDays,
      });
      return data;
    },
    enabled: Boolean(partnerId) && Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default usePartnerAnalyticsListingDetailQuery;

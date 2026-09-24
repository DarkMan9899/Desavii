/**
 * `useListingModerationHistoryQuery` — wraps `GET
 * /listings/admin/:id/moderation-history` (Step M3.1). Scoped
 * server-side to one listing's own audit rows, reachable with
 * `listing.moderate` alone — unlike `useAdminAuditLogsQuery`, which
 * requires the caller to hold the global `audit.view` permission.
 * Same cursor-pagination shape, so `ModerationHistoryPanel` can switch
 * between the two hooks without changing how it consumes the result.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getListingModerationHistory } from '../../../api/listings.js';

export const LISTING_MODERATION_HISTORY_LIMIT = 20;

export function useListingModerationHistoryQuery(
  listingId,
  { enabled = true } = {},
) {
  return useInfiniteQuery({
    queryKey: ['admin', 'listings', listingId, 'moderation-history'],
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await getListingModerationHistory(listingId, {
        limit: LISTING_MODERATION_HISTORY_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    staleTime: 30 * 1000,
    enabled: Boolean(listingId) && enabled,
  });
}

export default useListingModerationHistoryQuery;

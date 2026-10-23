/**
 * `useListingAvailabilityQuery` — the listing's public blocked date ranges
 * (`GET /availability/:listingId`) for `ListingAvailabilitySection`
 * (FRONTEND_ARCHITECTURE.md §14: React Query owns everything that
 * originates from the API).
 *
 * Calendar Excellence: this used to ask the unit-specific day calendar
 * first and fall back to these ranges when a multi-room listing answered
 * `422 AMBIGUOUS_UNIT` — a guaranteed failing request on every hotel page,
 * for day rows the section never rendered. The ranges are listing-level
 * (no unit, no date window), so they are asked for directly; per-day and
 * per-unit availability come from the availability-summary and day-status
 * reads instead.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingPublicRanges } from '../../../api/availability.js';
import listingKeys from '../constants/queryKeys.js';

export function useListingAvailabilityQuery(listingId) {
  return useQuery({
    queryKey: listingKeys.availability(listingId),
    queryFn: async () => {
      const { data } = await getListingPublicRanges(listingId);
      return { ranges: data };
    },
    enabled: Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default useListingAvailabilityQuery;

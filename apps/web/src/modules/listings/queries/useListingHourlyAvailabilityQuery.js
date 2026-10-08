/**
 * Step L6.3B — one hourly-enabled room's free rooms per whole-hour slot on
 * one date (`GET /availability/:listingId/units/:unitId/hourly-availability`).
 * A preview for choosing times: the hold itself re-checks everything under
 * lock on the server. Disabled until a room and a date are chosen.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingHourlyAvailability } from '../../../api/availability.js';
import listingKeys from '../constants/queryKeys.js';

const HOURLY_AVAILABILITY_STALE_MS = 30 * 1000;

export function useListingHourlyAvailabilityQuery(listingId, unitId, date) {
  return useQuery({
    queryKey: listingKeys.hourlyAvailability(listingId, unitId, date),
    queryFn: async () => {
      const { data } = await getListingHourlyAvailability(
        listingId,
        unitId,
        date,
      );
      return data;
    },
    enabled: Boolean(listingId) && Boolean(unitId) && Boolean(date),
    staleTime: HOURLY_AVAILABILITY_STALE_MS,
  });
}

export default useListingHourlyAvailabilityQuery;

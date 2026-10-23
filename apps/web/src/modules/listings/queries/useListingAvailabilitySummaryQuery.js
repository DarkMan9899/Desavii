/**
 * `useListingAvailabilitySummaryQuery` — Phase 17 (Listing Detail): wraps
 * the public, customer-safe `GET /availability/:listingId/availability-summary`
 * read: a 30-day window from today's Asia/Yerevan date (never the UTC
 * date, which is still yesterday between 00:00 and 04:00 in Yerevan). It
 * returns one summary entry per bookable unit unconditionally.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingAvailabilitySummary } from '../../../api/availability.js';
import listingKeys from '../constants/queryKeys.js';
import {
  addBusinessDays,
  getBusinessToday,
} from '../../../utils/businessDate.js';

const SUMMARY_WINDOW_DAYS = 30;

export function useListingAvailabilitySummaryQuery(listingId) {
  return useQuery({
    queryKey: listingKeys.availabilitySummary(listingId),
    queryFn: async () => {
      const from = getBusinessToday();
      const to = addBusinessDays(from, SUMMARY_WINDOW_DAYS - 1);
      const { data } = await getListingAvailabilitySummary(listingId, {
        from,
        to,
      });
      return data;
    },
    enabled: Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default useListingAvailabilitySummaryQuery;

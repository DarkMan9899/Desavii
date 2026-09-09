import { useQuery } from '@tanstack/react-query';
import { listMyBookings } from '../../../api/bookings.js';
import bookingKeys from '../constants/queryKeys.js';

/**
 * `GET /bookings?partnerId=&unitId=&from=&to=` (Sprint D-2: Partner
 * Calendar source-aware UX) — the bookings touching one bookable unit
 * within a date span, for the Calendar's Week/Day views to render as the
 * "Desavii booking" source and drill through to the existing
 * `/partner/bookings/:id` detail page. A plain (non-infinite) query: the
 * span a Week/Day view ever requests is at most a few weeks, never large
 * enough to need `usePartnerBookingsQuery`'s cursor pagination.
 */
export function useUnitBookingsQuery(partnerId, unitId, from, to) {
  return useQuery({
    queryKey: bookingKeys.list({ partnerId, unitId, from, to }),
    queryFn: () =>
      listMyBookings({ partnerId, unitId, from, to, limit: 100 }).then(
        (res) => res.data,
      ),
    enabled: Boolean(partnerId && unitId && from && to),
    staleTime: 10_000,
  });
}

export default useUnitBookingsQuery;

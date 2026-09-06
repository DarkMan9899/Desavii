/**
 * `useListingBookableUnitsQuery` — wraps the Phase 7 public read
 * `GET /availability/:listingId/units` (FRONTEND_ARCHITECTURE.md §14).
 * `ListingReservationWidget` uses this to resolve which unit(s) a
 * customer can select before requesting a hold — a listing with zero
 * units has nothing bookable yet (the widget falls back to an honest
 * "not bookable yet" state); exactly one unit is auto-selected; more
 * than one requires the customer to pick.
 *
 * Sprint A (Time-Aware Booking Foundation): an optional `date` re-fetches
 * with a per-date availability/price snapshot on each unit — used only by
 * the widget's time-slot picker, once a date is chosen, to know which
 * sibling departure/session units still have capacity that day. Every
 * other caller (Admin Inventory, the Partner Bookable Units panel, and
 * this widget's own initial date-less unit list) omits it and keeps its
 * existing cache entry/behavior exactly as before.
 *
 * Sprint C-3 (Date-Range Room Availability): `checkIn`+`checkOut` (given
 * together, mutually exclusive with `date`) instead re-fetch with a
 * whole-stay snapshot per unit — the Rooms section/Reservation widget's
 * read once a customer has picked a check-in and check-out date.
 */

import { useQuery } from '@tanstack/react-query';
import { getListingBookableUnits } from '../../../api/availability.js';
import listingKeys from '../constants/queryKeys.js';

export function useListingBookableUnitsQuery(
  listingId,
  { date, checkIn, checkOut } = {},
) {
  return useQuery({
    queryKey: listingKeys.bookableUnits(listingId, date, checkIn, checkOut),
    queryFn: async () => {
      const { data } = await getListingBookableUnits(listingId, {
        date,
        checkIn,
        checkOut,
      });
      return data;
    },
    enabled: Boolean(listingId),
    staleTime: 60 * 1000,
  });
}

export default useListingBookableUnitsQuery;

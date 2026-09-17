/**
 * `usePublishListingMutation` — wraps `POST /listings/:id/publish`
 * (FRONTEND_ARCHITECTURE.md §14.5). Rejects with a 422 carrying an
 * itemized `details` array (`{ field, issue }[]`) until every
 * publish-readiness check passes — `ReviewStep` renders that array
 * directly as its inline validation summary, never re-deriving
 * readiness client-side.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { publishListing } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function usePublishListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    // Listing Lifetime / Renewal, Step B3: `publicationPeriodDays` is
    // required only on a listing's first lifecycle-managed publish — the
    // server decides that from its own state, never this call site — and
    // silently ignored on any later republish, so `ReviewStep` always
    // passes its current selection regardless of which case applies.
    mutationFn: ({ id, publicationPeriodDays }) =>
      publishListing(id, { publicationPeriodDays }),
    onSuccess: (_response, { id }) => {
      queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: listingKeys.lists() });
      // Phase 9 (Partner Dashboard): the Listings Management table reads
      // through `mine()`, not the public `lists()` key. Must be the bare
      // `mines()` prefix, not `mine()` with no argument — see
      // `queryKeys.js`'s own header for why the latter silently fails to
      // match TanStack Query's partial-key invalidation.
      queryClient.invalidateQueries({ queryKey: listingKeys.mines() });
    },
  });
}

export default usePublishListingMutation;

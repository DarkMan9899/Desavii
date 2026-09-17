/**
 * `useRenewListingMutation` — Listing Lifetime / Renewal, Step B5, wraps
 * `POST /listings/:id/renew`. Rejects with a 422 (invalid/missing period,
 * same itemized `details` shape every other readiness/validation error
 * already uses) or a 409 (`LISTING_NOT_RENEWABLE`/`RENEWAL_STATE_CHANGED`)
 * — the caller reads `error.message`/`error.code` the same way
 * `usePublishListingMutation` already does for its own error cases.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renewListing } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useRenewListingMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, publicationPeriodDays }) =>
      renewListing(id, { publicationPeriodDays }),
    onSuccess: (_response, { id }) => {
      queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: listingKeys.lists() });
      // Same "must be the bare mines() prefix" rule
      // `usePublishListingMutation.js` already documents — the Listings
      // Management table reads through `mine()`, not the public `lists()`.
      queryClient.invalidateQueries({ queryKey: listingKeys.mines() });
    },
  });
}

export default useRenewListingMutation;

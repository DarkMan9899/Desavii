/**
 * `useReplaceListingOpeningHoursMutation` — wraps `PUT
 * /listings/:id/opening-hours` (Pass 6, Restaurant vertical). Full-replace:
 * the Partner Opening Hours editor always sends the complete desired
 * `days` array, never a delta — mirrors
 * `useReplaceListingHighlightsMutation.js`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { replaceListingOpeningHours } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useReplaceListingOpeningHoursMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, days }) => replaceListingOpeningHours(id, days),
    onSuccess: (_response, { id }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.openingHours(id),
      });
    },
  });
}

export default useReplaceListingOpeningHoursMutation;

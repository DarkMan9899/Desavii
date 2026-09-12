/**
 * `useCreateListingMenuMutation` — wraps `POST /listings/:id/menu` (Pass
 * 6, Partner Menu Authoring). Invalidates the same `listingKeys.menu`
 * cache entry the public detail page and this manager both read through
 * `useListingMenuQuery`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createListingMenu } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useCreateListingMenuMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, ...body }) => createListingMenu(listingId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useCreateListingMenuMutation;

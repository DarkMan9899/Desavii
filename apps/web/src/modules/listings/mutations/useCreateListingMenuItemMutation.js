/**
 * `useCreateListingMenuItemMutation` — wraps `POST
 * /listings/menu/sections/:sectionId/items` (Pass 6, Partner Menu
 * Authoring).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createListingMenuItem } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useCreateListingMenuItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...body }) =>
      createListingMenuItem(sectionId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useCreateListingMenuItemMutation;

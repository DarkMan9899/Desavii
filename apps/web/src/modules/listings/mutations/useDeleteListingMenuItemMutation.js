/**
 * `useDeleteListingMenuItemMutation` — wraps `DELETE
 * /listings/menu/items/:itemId` (Pass 6, Partner Menu Authoring).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteListingMenuItem } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useDeleteListingMenuItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId }) => deleteListingMenuItem(itemId),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useDeleteListingMenuItemMutation;

/**
 * `useUpdateListingMenuItemMutation` — wraps `PATCH
 * /listings/menu/items/:itemId` (Pass 6, Partner Menu Authoring). Also
 * used for the item-row active/inactive toggle, same as
 * `restaurantMenu.test.js`'s "disabling an item via update" flow.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateListingMenuItem } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useUpdateListingMenuItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, ...body }) => updateListingMenuItem(itemId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useUpdateListingMenuItemMutation;

/**
 * `useDeleteListingMenuMutation` — wraps `DELETE /listings/menu/:menuId`
 * (Pass 6, Partner Menu Authoring). The server rejects this with 409
 * while the menu still has sections (`RestaurantMenuService#deleteMenu`)
 * — surfaced by the caller via `mutation.error`, never pre-guessed here.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteListingMenu } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useDeleteListingMenuMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ menuId }) => deleteListingMenu(menuId),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useDeleteListingMenuMutation;

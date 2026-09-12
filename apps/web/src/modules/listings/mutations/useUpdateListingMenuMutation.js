/**
 * `useUpdateListingMenuMutation` — wraps `PATCH /listings/menu/:menuId`
 * (Pass 6, Partner Menu Authoring).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateListingMenu } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useUpdateListingMenuMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ menuId, ...body }) => updateListingMenu(menuId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useUpdateListingMenuMutation;

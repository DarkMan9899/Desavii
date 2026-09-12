/**
 * `useCreateListingMenuSectionMutation` — wraps `POST
 * /listings/menu/:menuId/sections` (Pass 6, Partner Menu Authoring).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createListingMenuSection } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useCreateListingMenuSectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ menuId, ...body }) => createListingMenuSection(menuId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useCreateListingMenuSectionMutation;

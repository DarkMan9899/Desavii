/**
 * `useDeleteListingMenuSectionMutation` — wraps `DELETE
 * /listings/menu/sections/:sectionId` (Pass 6, Partner Menu Authoring).
 * The server rejects this with 409 while the section still has items
 * (`RestaurantMenuService#deleteSection`) — surfaced via `mutation.error`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteListingMenuSection } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useDeleteListingMenuSectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId }) => deleteListingMenuSection(sectionId),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useDeleteListingMenuSectionMutation;

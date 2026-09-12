/**
 * `useUpdateListingMenuSectionMutation` — wraps `PATCH
 * /listings/menu/sections/:sectionId` (Pass 6, Partner Menu Authoring).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateListingMenuSection } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useUpdateListingMenuSectionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sectionId, ...body }) =>
      updateListingMenuSection(sectionId, body),
    onSuccess: (_response, { listingId, locale }) => {
      queryClient.invalidateQueries({
        queryKey: listingKeys.menu(listingId, locale),
      });
    },
  });
}

export default useUpdateListingMenuSectionMutation;

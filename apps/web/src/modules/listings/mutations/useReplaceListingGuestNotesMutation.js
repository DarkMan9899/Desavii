/**
 * `useReplaceListingGuestNotesMutation` — wraps `PATCH
 * /listings/:id/guest-notes`. Full-replace for one language: `ContentStep`
 * always sends that language's complete notes, never a delta.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { replaceListingGuestNotes } from '../../../api/listings.js';
import listingKeys from '../constants/queryKeys.js';

export function useReplaceListingGuestNotesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes, languageCode }) =>
      replaceListingGuestNotes(id, notes, languageCode),
    onSuccess: (_response, { id }) => {
      queryClient.invalidateQueries({ queryKey: listingKeys.detail(id) });
    },
  });
}

export default useReplaceListingGuestNotesMutation;

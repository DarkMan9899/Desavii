import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createInventoryBlock } from '../../../api/availability.js';
import { invalidateInventoryBlockViews } from './invalidateInventoryBlockViews.js';

/** `POST /availability/blocks` — Quick Block (spec §11). Invalidates the listing's blocks list and every open breakdown/ledger view. */
export function useCreateInventoryBlockMutation(listingId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createInventoryBlock(payload),
    onSuccess: () => invalidateInventoryBlockViews(queryClient, listingId),
  });
}

export default useCreateInventoryBlockMutation;

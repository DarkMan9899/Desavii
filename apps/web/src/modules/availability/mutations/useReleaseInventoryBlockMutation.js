import { useMutation, useQueryClient } from '@tanstack/react-query';
import { releaseInventoryBlock } from '../../../api/availability.js';
import { invalidateInventoryBlockViews } from './invalidateInventoryBlockViews.js';

/** `DELETE /availability/blocks/:id` — Quick Unblock. */
export function useReleaseInventoryBlockMutation(listingId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => releaseInventoryBlock(id),
    onSuccess: () => invalidateInventoryBlockViews(queryClient, listingId),
  });
}

export default useReleaseInventoryBlockMutation;

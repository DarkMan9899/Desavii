import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateInventoryBlock } from '../../../api/availability.js';
import { invalidateInventoryBlockViews } from './invalidateInventoryBlockViews.js';

/** `PATCH /availability/blocks/:id` — edit a block's dates, quantity, reason or notes. */
export function useUpdateInventoryBlockMutation(listingId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => updateInventoryBlock(id, payload),
    onSuccess: () => invalidateInventoryBlockViews(queryClient, listingId),
  });
}

export default useUpdateInventoryBlockMutation;

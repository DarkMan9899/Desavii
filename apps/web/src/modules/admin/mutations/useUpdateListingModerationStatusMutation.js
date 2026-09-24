/**
 * `useUpdateListingModerationStatusMutation` — wraps
 * `PATCH /listings/admin/:id/moderation-status` (approve/reject/flag,
 * with optional notes).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateListingModerationStatus } from '../../../api/listings.js';

export function useUpdateListingModerationStatusMutation() {
  const queryClient = useQueryClient();

  function invalidateListingQueries(id) {
    queryClient.invalidateQueries({ queryKey: ['admin', 'listings', id] });
    queryClient.invalidateQueries({
      queryKey: ['admin', 'listings'],
      exact: false,
    });
    queryClient.invalidateQueries({
      queryKey: ['admin', 'audit-logs'],
      exact: false,
    });
  }

  return useMutation({
    mutationFn: ({ id, status, notes }) =>
      updateListingModerationStatus(id, status, notes),
    onSuccess: (_response, { id }) => invalidateListingQueries(id),
    // Step M3 (brief §17): a 409 means the backend's own row lock caught
    // a transition that's no longer legal — the queue/detail views must
    // never keep showing the stale pre-conflict state (a dead Approve/
    // Return-for-changes button on a row that already moved on). Refetch
    // regardless of WHY the mutation failed; a permission/network error
    // gains nothing from it, but a stale-state conflict is exactly what
    // this exists to correct, and there's no cheap way to distinguish
    // the two here without duplicating the caller's own error handling.
    onError: (_error, { id }) => invalidateListingQueries(id),
  });
}

export default useUpdateListingModerationStatusMutation;

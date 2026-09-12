/**
 * Sprint E — the four single-id admin lifecycle actions
 * (mark-paid/approve/reject/cancel) share the exact same shape (call the
 * endpoint, invalidate the list + this one detail), so they're built off
 * one small factory rather than four near-identical files.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  markAdvertisementPaid,
  approveAdvertisement,
  rejectAdvertisement,
  cancelAdvertisement,
  pauseAdvertisement,
  resumeAdvertisement,
  extendAdvertisement,
} from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

function useAdvertisementActionMutation(actionFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => actionFn(id),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: advertisingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: advertisingKeys.detail(id) });
    },
  });
}

export function useMarkAdvertisementPaidMutation() {
  return useAdvertisementActionMutation(markAdvertisementPaid);
}

export function useApproveAdvertisementMutation() {
  return useAdvertisementActionMutation(approveAdvertisement);
}

export function useRejectAdvertisementMutation() {
  return useAdvertisementActionMutation(rejectAdvertisement);
}

export function useCancelAdvertisementMutation() {
  return useAdvertisementActionMutation(cancelAdvertisement);
}

/** Pass 7B — reversible pause/resume, distinct from cancel. */
export function usePauseAdvertisementMutation() {
  return useAdvertisementActionMutation(pauseAdvertisement);
}

export function useResumeAdvertisementMutation() {
  return useAdvertisementActionMutation(resumeAdvertisement);
}

export function useExtendAdvertisementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endDate }) => extendAdvertisement(id, { endDate }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: advertisingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: advertisingKeys.detail(id) });
    },
  });
}

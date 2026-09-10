import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createDraft } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useCreateDraftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => createDraft(payload).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
    },
  });
}

export default useCreateDraftMutation;

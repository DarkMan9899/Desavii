import { useMutation, useQueryClient } from '@tanstack/react-query';
import { upsertPostTranslation } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useUpsertPostTranslationMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ languageCode, ...payload }) =>
      upsertPostTranslation(id, languageCode, payload).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
    },
  });
}

export default useUpsertPostTranslationMutation;

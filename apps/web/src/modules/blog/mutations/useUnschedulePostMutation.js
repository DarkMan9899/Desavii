import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unschedulePost } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useUnschedulePostMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unschedulePost(id).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
    },
  });
}

export default useUnschedulePostMutation;

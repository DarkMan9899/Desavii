import { useMutation, useQueryClient } from '@tanstack/react-query';
import { schedulePost } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useSchedulePostMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduledAt) =>
      schedulePost(id, scheduledAt).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
    },
  });
}

export default useSchedulePostMutation;

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updatePostSettings } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useUpdatePostSettingsMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      updatePostSettings(id, payload).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
    },
  });
}

export default useUpdatePostSettingsMutation;

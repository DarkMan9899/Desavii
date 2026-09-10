import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unpublishPost } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useUnpublishPostMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unpublishPost(id).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.lists() });
      queryClient.invalidateQueries({ queryKey: blogKeys.public.lists() });
    },
  });
}

export default useUnpublishPostMutation;

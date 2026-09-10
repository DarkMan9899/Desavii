import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removeCoverImage } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useRemoveCoverImageMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => removeCoverImage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
    },
  });
}

export default useRemoveCoverImageMutation;

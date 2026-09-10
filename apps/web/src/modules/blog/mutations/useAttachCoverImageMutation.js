import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attachCoverImage } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

export function useAttachCoverImageMutation(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, altText }) =>
      attachCoverImage(id, file, altText).then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blogKeys.admin.detail(id) });
    },
  });
}

export default useAttachCoverImageMutation;

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveContactInquiry } from '../../../api/contact.js';
import contactKeys from '../constants/queryKeys.js';

/** `POST /contact/admin/:id/resolve` (`contact.manage`). */
export function useResolveContactInquiryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => resolveContactInquiry(id),
    onSuccess: (_result, id) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.admin.lists() });
      queryClient.invalidateQueries({
        queryKey: contactKeys.admin.detail(id),
      });
    },
  });
}

export default useResolveContactInquiryMutation;

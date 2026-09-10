import { useMutation } from '@tanstack/react-query';
import { promoteToMarketing } from '../../../api/blog.js';

/** `POST /blog/admin/marketing-role/promote` — grants the global MARKETING role to an existing user (Admin, `marketing.assign`). */
export function usePromoteToMarketingMutation() {
  return useMutation({ mutationFn: (userId) => promoteToMarketing(userId) });
}

export default usePromoteToMarketingMutation;

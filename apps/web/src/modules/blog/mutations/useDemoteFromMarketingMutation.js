import { useMutation } from '@tanstack/react-query';
import { demoteFromMarketing } from '../../../api/blog.js';

/** `POST /blog/admin/marketing-role/demote` — revokes the global MARKETING role (Admin, `marketing.assign`). */
export function useDemoteFromMarketingMutation() {
  return useMutation({ mutationFn: (userId) => demoteFromMarketing(userId) });
}

export default useDemoteFromMarketingMutation;

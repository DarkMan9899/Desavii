import { useMutation, useQueryClient } from '@tanstack/react-query';
import { unassignCompanyFromManager } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `DELETE /managers/admin/:userId/companies/:partnerId` — unassigns a company from a Manager (Admin). */
export function useUnassignCompanyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, partnerId }) =>
      unassignCompanyFromManager(userId, partnerId),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: managersKeys.admin.lists() });
      queryClient.invalidateQueries({
        queryKey: managersKeys.admin.detail(userId),
      });
    },
  });
}

export default useUnassignCompanyMutation;

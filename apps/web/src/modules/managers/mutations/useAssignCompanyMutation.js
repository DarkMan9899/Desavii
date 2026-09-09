import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assignCompanyToManager } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `POST /managers/admin/:userId/companies` — assigns a company to a Manager (Admin). */
export function useAssignCompanyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, partnerId }) =>
      assignCompanyToManager(userId, partnerId),
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: managersKeys.admin.lists() });
      queryClient.invalidateQueries({
        queryKey: managersKeys.admin.detail(userId),
      });
    },
  });
}

export default useAssignCompanyMutation;

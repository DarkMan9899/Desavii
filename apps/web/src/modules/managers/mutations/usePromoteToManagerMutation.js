import { useMutation, useQueryClient } from '@tanstack/react-query';
import { promoteToManager } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `POST /managers/admin/promote` — grants the global MANAGER role to an existing user (Admin). */
export function usePromoteToManagerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId) => promoteToManager(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: managersKeys.admin.lists() });
    },
  });
}

export default usePromoteToManagerMutation;

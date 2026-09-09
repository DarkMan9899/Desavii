import { useQuery } from '@tanstack/react-query';
import { getManagerDetail } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/admin/:userId` — one Manager's assignments + cross-company dashboard (Admin). */
export function useManagerDetailQuery(userId) {
  return useQuery({
    queryKey: managersKeys.admin.detail(userId),
    queryFn: () => getManagerDetail(userId).then((res) => res.data),
    enabled: Boolean(userId),
  });
}

export default useManagerDetailQuery;

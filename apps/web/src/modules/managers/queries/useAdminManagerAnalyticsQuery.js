import { useQuery } from '@tanstack/react-query';
import { getAdminManagerAnalytics } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/admin/:userId/analytics` — Admin reviewing one Manager's performance (spec §23). */
export function useAdminManagerAnalyticsQuery(userId, filters = {}) {
  return useQuery({
    queryKey: managersKeys.admin.analytics(userId, filters),
    queryFn: () =>
      getAdminManagerAnalytics(userId, filters).then((res) => res.data),
    enabled: Boolean(userId),
  });
}

export default useAdminManagerAnalyticsQuery;

import { useQuery } from '@tanstack/react-query';
import { getMyManagerAnalytics } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/mine/analytics` — the caller's filtered breakdown (spec §20: dateRange/company/listing/status, always server-scoped). */
export function useMyManagerAnalyticsQuery(filters = {}) {
  return useQuery({
    queryKey: managersKeys.mine.analytics(filters),
    queryFn: () => getMyManagerAnalytics(filters).then((res) => res.data),
  });
}

export default useMyManagerAnalyticsQuery;

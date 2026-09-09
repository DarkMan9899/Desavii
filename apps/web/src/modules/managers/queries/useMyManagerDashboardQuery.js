import { useQuery } from '@tanstack/react-query';
import { getMyManagerDashboard } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/mine/dashboard` — the caller's cross-company summary. */
export function useMyManagerDashboardQuery() {
  return useQuery({
    queryKey: managersKeys.mine.dashboard(),
    queryFn: () => getMyManagerDashboard().then((res) => res.data),
  });
}

export default useMyManagerDashboardQuery;

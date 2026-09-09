import { useQuery } from '@tanstack/react-query';
import { listManagers } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/admin` — the full Manager roster (Admin). */
export function useManagersQuery(filters = {}) {
  return useQuery({
    queryKey: managersKeys.admin.list(filters),
    queryFn: () => listManagers(filters).then((res) => res.data),
  });
}

export default useManagersQuery;

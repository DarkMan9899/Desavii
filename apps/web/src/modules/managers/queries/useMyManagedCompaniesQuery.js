import { useQuery } from '@tanstack/react-query';
import { getMyManagedCompanies } from '../../../api/managers.js';
import managersKeys from '../constants/queryKeys.js';

/** `GET /managers/mine/companies` — the caller's own assigned companies. */
export function useMyManagedCompaniesQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: managersKeys.mine.companies(),
    queryFn: () => getMyManagedCompanies().then((res) => res.data),
    enabled,
  });
}

export default useMyManagedCompaniesQuery;

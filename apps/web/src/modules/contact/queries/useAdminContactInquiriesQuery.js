import { useQuery } from '@tanstack/react-query';
import { getAdminContactInquiries } from '../../../api/contact.js';
import contactKeys from '../constants/queryKeys.js';

/** `GET /contact/admin` — the Admin inbox (`contact.manage`). */
export function useAdminContactInquiriesQuery(filters = {}) {
  return useQuery({
    queryKey: contactKeys.admin.list(filters),
    queryFn: () => getAdminContactInquiries(filters).then((res) => res.data),
  });
}

export default useAdminContactInquiriesQuery;

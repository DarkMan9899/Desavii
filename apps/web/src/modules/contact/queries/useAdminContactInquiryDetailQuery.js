import { useQuery } from '@tanstack/react-query';
import { getAdminContactInquiryDetail } from '../../../api/contact.js';
import contactKeys from '../constants/queryKeys.js';

/** `GET /contact/admin/:id` (`contact.manage`). */
export function useAdminContactInquiryDetailQuery(id, options = {}) {
  return useQuery({
    queryKey: contactKeys.admin.detail(id),
    queryFn: () => getAdminContactInquiryDetail(id).then((res) => res.data),
    enabled: Boolean(id) && options.enabled !== false,
  });
}

export default useAdminContactInquiryDetailQuery;

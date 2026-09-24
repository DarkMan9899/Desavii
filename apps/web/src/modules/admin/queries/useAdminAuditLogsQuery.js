/**
 * `useAdminAuditLogsQuery` — wraps `GET /admin/audit-logs` (Stage 11.7:
 * Audit Logs), cursor-paginated the same way every other admin list in
 * this app is (`useInfiniteQuery` + "Load more").
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getAuditLogs } from '../../../api/admin.js';

export const ADMIN_AUDIT_LOGS_LIMIT = 20;

export function useAdminAuditLogsQuery({
  targetType,
  targetId,
  action,
  enabled = true,
} = {}) {
  return useInfiniteQuery({
    queryKey: ['admin', 'audit-logs', { targetType, targetId, action }],
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await getAuditLogs({
        targetType: targetType || undefined,
        targetId: targetId || undefined,
        action: action || undefined,
        limit: ADMIN_AUDIT_LOGS_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    staleTime: 30 * 1000,
    enabled,
  });
}

export default useAdminAuditLogsQuery;

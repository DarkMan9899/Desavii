import { useQuery } from '@tanstack/react-query';
import { getAdminPostDetail } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

/**
 * `GET /blog/admin/posts/:id` — full detail with every locale's translation.
 * Also the authenticated "preview" data source (spec §24) — the public
 * article layout renders this instead of the public endpoint's response.
 * `retry: false`: see `usePublicPostQuery.js`'s file header — needed here
 * so `BlogPostEditorContent`'s own 404 branch (a stale/bad `:id`) is
 * actually reachable instead of hanging on the loading spinner.
 */
export function useAdminPostDetailQuery(id, options = {}) {
  return useQuery({
    queryKey: blogKeys.admin.detail(id),
    queryFn: () => getAdminPostDetail(id).then((res) => res.data),
    enabled: Boolean(id) && options.enabled !== false,
    retry: false,
  });
}

export default useAdminPostDetailQuery;

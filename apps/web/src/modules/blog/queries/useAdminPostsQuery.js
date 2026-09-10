import { useQuery } from '@tanstack/react-query';
import { getAdminPosts } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

/**
 * `GET /blog/admin/posts` — every status, requires `blog.manage`.
 * `retry: false`: see `usePublicPostQuery.js`'s file header.
 */
export function useAdminPostsQuery(filters = {}) {
  return useQuery({
    queryKey: blogKeys.admin.list(filters),
    queryFn: () => getAdminPosts(filters).then((res) => res.data),
    retry: false,
  });
}

export default useAdminPostsQuery;

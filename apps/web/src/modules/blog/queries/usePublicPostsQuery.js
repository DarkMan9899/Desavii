import { useQuery } from '@tanstack/react-query';
import { listPublicPosts } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

/**
 * `GET /blog/posts` — public, published/due-scheduled posts only.
 * `retry: false`: see `usePublicPostQuery.js`'s file header — the
 * platform default retry setting never resolves `isError` for a
 * rejected query in this app's current React Query setup, which would
 * make the public Blog index's own error-state retry button unreachable.
 */
export function usePublicPostsQuery(filters = {}) {
  return useQuery({
    queryKey: blogKeys.public.list(filters),
    queryFn: () => listPublicPosts(filters),
    retry: false,
  });
}

export default usePublicPostsQuery;

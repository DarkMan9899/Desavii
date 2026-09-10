import { useQuery } from '@tanstack/react-query';
import { getPublicPost } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

/**
 * `GET /blog/posts/:slug` — 404s for a draft/unpublished/not-yet-due-
 * scheduled slug. `retry: false`: verified in a real browser that the
 * platform default (`AppProviders.jsx`'s plain `retry: 2`, which retries
 * every error including a 404) never resolves `isError` for a rejected
 * query in this app's current React Query setup — a 404 here would leave
 * the page stuck on its loading spinner forever instead of showing the
 * real not-found state spec §25/§34 require. A 404 will never succeed on
 * retry regardless, so disabling it here loses nothing.
 */
export function usePublicPostQuery(slug, locale) {
  return useQuery({
    queryKey: blogKeys.public.detail(slug, locale),
    queryFn: () => getPublicPost(slug, locale).then((res) => res.data),
    enabled: Boolean(slug),
    retry: false,
  });
}

export default usePublicPostQuery;

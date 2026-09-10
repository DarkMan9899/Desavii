import { useQuery } from '@tanstack/react-query';
import { listPublicCategories, listPublicTags } from '../../../api/blog.js';
import blogKeys from '../constants/queryKeys.js';

/**
 * `GET /blog/categories` — public, for the index page's filter UI.
 * `retry: false`: see `usePublicPostQuery.js`'s file header.
 */
export function usePublicCategoriesQuery(locale) {
  return useQuery({
    queryKey: blogKeys.public.categories(locale),
    queryFn: () => listPublicCategories(locale).then((res) => res.data),
    retry: false,
  });
}

/** `GET /blog/tags` — public, for the index page's filter UI. */
export function usePublicTagsQuery(locale) {
  return useQuery({
    queryKey: blogKeys.public.tags(locale),
    queryFn: () => listPublicTags(locale).then((res) => res.data),
    retry: false,
  });
}

export default { usePublicCategoriesQuery, usePublicTagsQuery };

import { useQuery } from '@tanstack/react-query';
import { getPublicCategoryTop } from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

/** `GET /advertising/public/category-top` — a category page's TOP section, shown before the normal grid. */
export function usePublicCategoryTopQuery(
  categoryId,
  { locale, enabled = true } = {},
) {
  return useQuery({
    queryKey: advertisingKeys.categoryTop(categoryId, locale),
    queryFn: () =>
      getPublicCategoryTop({ categoryId, locale }).then((res) => res.data),
    enabled: Boolean(categoryId) && enabled,
    staleTime: 30_000,
  });
}

export default usePublicCategoryTopQuery;

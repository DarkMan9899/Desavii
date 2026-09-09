import { useQuery } from '@tanstack/react-query';
import { getPublicHomeFeatured } from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

/** `GET /advertising/public/home-featured` — the Home page's real Featured/TOP section. */
export function usePublicHomeFeaturedQuery({ locale } = {}) {
  return useQuery({
    queryKey: advertisingKeys.homeFeatured(locale),
    queryFn: () => getPublicHomeFeatured({ locale }).then((res) => res.data),
    staleTime: 30_000,
  });
}

export default usePublicHomeFeaturedQuery;

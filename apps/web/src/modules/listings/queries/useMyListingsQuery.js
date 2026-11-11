/**
 * `useMyListingsQuery` — Phase 9 (Partner Dashboard): a partner's own
 * listings across every status (draft/published/unpublished/archived).
 *
 * Goes through `GET /search` (`searchListings`) rather than `GET /listings`
 * (the public, published-only browse endpoint returning only the bare
 * summary DTO) — `searchListings` already returns the richer flat shape
 * (`title`, `status`, `cover_image_url`, `city_name`, lifecycle dates) a
 * management table needs, with zero per-row follow-up calls; `status` and
 * the lifecycle dates come only in this owner view. Called directly rather than via
 * `useSearchListingsQuery`/`toSearchQueryParams` (`modules/search`), since
 * those are tailored to the public customer-filter shape and have no
 * concept of `partnerId`/`status`.
 *
 * `useInfiniteQuery`, same cursor-based pagination convention as
 * `useMyBookingsQuery.js`/`useSearchListingsQuery.js`.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { searchListings } from '../../../api/search.js';
import listingKeys from '../constants/queryKeys.js';
import { DEFAULT_SORT_KEY } from '../../../constants/sortOptions.js';

export const MY_LISTINGS_LIMIT = 10;

/**
 * @param {{ partnerId: number, status?: string, keyword?: string, sort?: string, locale?: string }} filters
 */
export function useMyListingsQuery({
  partnerId,
  status,
  keyword,
  sort = DEFAULT_SORT_KEY,
  locale,
} = {}) {
  return useInfiniteQuery({
    queryKey: listingKeys.mine({ partnerId, status, keyword, sort, locale }),
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await searchListings({
        partnerId,
        status: status || undefined,
        keyword: keyword || undefined,
        sort,
        locale,
        limit: MY_LISTINGS_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    enabled: Boolean(partnerId),
    staleTime: 30 * 1000,
  });
}

export default useMyListingsQuery;

import { useInfiniteQuery } from '@tanstack/react-query';
import { listAdvertisements } from '../../../api/advertising.js';
import advertisingKeys from '../constants/queryKeys.js';

export const ADVERTISEMENTS_LIMIT = 20;

/** `GET /advertising/admin` — Admin's promotion management list, optionally scoped to one listing. */
export function useAdvertisementsQuery({
  listingId,
  placementCode,
  statusCode,
} = {}) {
  const filters = { listingId, placementCode, statusCode };
  return useInfiniteQuery({
    queryKey: advertisingKeys.list(filters),
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await listAdvertisements({
        ...filters,
        limit: ADVERTISEMENTS_LIMIT,
        cursor: pageParam ?? undefined,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    staleTime: 15_000,
  });
}

export default useAdvertisementsQuery;

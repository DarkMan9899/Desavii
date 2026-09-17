/**
 * `usePartnerListingsQuery` — wraps `GET /partners/:slug/listings`
 * (FRONTEND_ARCHITECTURE.md §14: React Query owns everything that
 * originates from the API). Company Public Profile (Step A2).
 *
 * `useInfiniteQuery`, mirroring `useCompaniesQuery.js` exactly — the
 * backend's own pagination is already cursor-based
 * (`meta.next_cursor`/`meta.has_more`), the same shape `getNextPageParam`
 * expects. `enabled: Boolean(slug)` mirrors `useCompanyQuery`'s own
 * guard — this hook is only ever called once a company slug is known
 * from the route.
 *
 * `locale` (Step A4): forwarded to the API exactly like
 * `useSearchListingsQuery(filters, { locale })` already does, so listing
 * titles resolve to the visitor's locale instead of always the server's
 * default language.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getPartnerListings } from '../../../api/partners.js';
import companyKeys from '../constants/queryKeys.js';

export const COMPANY_LISTINGS_PAGE_LIMIT = 12;

export function usePartnerListingsQuery(slug, locale) {
  return useInfiniteQuery({
    queryKey: companyKeys.listings(slug, locale),
    queryFn: async ({ pageParam }) => {
      const { data, meta } = await getPartnerListings(slug, {
        limit: COMPANY_LISTINGS_PAGE_LIMIT,
        cursor: pageParam ?? undefined,
        locale,
      });
      return { results: data, meta };
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.meta?.next_cursor ?? undefined,
    enabled: Boolean(slug),
    staleTime: 5 * 60 * 1000,
  });
}

export default usePartnerListingsQuery;

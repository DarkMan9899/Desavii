/**
 * useFeaturedRail — the data behind Home's featured rail
 * (`selectFeaturedListings` explains the selection).
 *
 * The promotions request always runs. The fill request
 * (`GET /search?sort=rating_desc`, first page) runs only once the
 * promotions have settled and cannot fill the rail on their own — a rail
 * full of promotions costs no second request. If the promotions request
 * fails, the rail still shows real top-rated / newest listings (never
 * with a TOP badge); the error only surfaces when there is nothing to
 * show at all.
 */

import { useMemo } from 'react';
import { usePublicHomeFeaturedQuery } from '../../advertising/index.js';
import { useSearchListingsQuery } from '../../search/index.js';
import {
  needsFeaturedFill,
  selectFeaturedListings,
} from '../utils/selectFeaturedListings.js';

const FILL_FILTERS = Object.freeze({ sort: 'rating_desc' });

export default function useFeaturedRail({ locale }) {
  const promotions = usePublicHomeFeaturedQuery({ locale });
  const promoted = promotions.data;
  const promotionsSettled = !promotions.isPending;
  const fillEnabled =
    promotionsSettled && needsFeaturedFill(promoted?.length ?? 0);
  const fill = useSearchListingsQuery(FILL_FILTERS, {
    locale,
    enabled: fillEnabled,
  });
  const candidates = fill.data?.pages[0]?.results;

  const items = useMemo(
    () =>
      selectFeaturedListings(
        promoted ?? [],
        fillEnabled ? (candidates ?? []) : [],
      ),
    [promoted, candidates, fillEnabled],
  );
  const isPending = !promotionsSettled || (fillEnabled && fill.isPending);

  return {
    items,
    isPending,
    isError: !isPending && items.length === 0 && promotions.isError,
  };
}

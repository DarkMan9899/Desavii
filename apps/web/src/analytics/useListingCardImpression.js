/**
 * `useListingCardImpression` — the impression reporting every listing
 * card shares (Step A3, brief §14/§16): once the card has been visible
 * long enough (`useListingImpression`), report a listing impression for
 * its placement, plus a promotion impression when the card is a paid
 * placement (`promotionId`). Extracted from `SearchResultCard` when the
 * Home featured rail got its own card, so both report impressions
 * identically instead of each restating the rules.
 *
 * Nothing is observed without a `placement` or while collection is
 * disabled.
 *
 * @param {object} params
 * @param {number} params.listingId
 * @param {string} [params.placement] - one of `PLACEMENTS`.
 * @param {number} [params.position] - the card's rank in its list.
 * @param {string} [params.categoryCode]
 * @param {string} [params.locale]
 * @param {number} [params.promotionId] - only for a paid placement.
 * @returns {import('react').RefObject} attach to the card's root node.
 */

import { useListingImpression } from './useListingImpression.js';
import {
  isAnalyticsCollectionEnabled,
  trackListingImpression,
  trackPromotionImpression,
} from './analyticsClient.js';

export function useListingCardImpression({
  listingId,
  placement = undefined,
  position = undefined,
  categoryCode = undefined,
  locale = undefined,
  promotionId = undefined,
}) {
  return useListingImpression({
    enabled: Boolean(placement) && isAnalyticsCollectionEnabled(),
    onImpression: () => {
      trackListingImpression({
        listingId,
        placement,
        position,
        categoryCode,
        locale,
      });
      if (promotionId) {
        trackPromotionImpression({ promotionId, listingId, placement });
      }
    },
  });
}

export default useListingCardImpression;

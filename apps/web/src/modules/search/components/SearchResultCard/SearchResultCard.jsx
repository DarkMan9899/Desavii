/**
 * SearchResultCard — one listing from a public listing feed (`GET /search`
 * and the advertising placements, which return the same flat card DTO) as
 * the shared Desavii card (`components/ListingCard`). Used by Search, the
 * Category and Destination pages, Company profiles, the Home rails and
 * Related listings.
 *
 * This file's own job is the feed-specific part: the card model
 * (`buildListingCardModel`), the destination with the Search's booking
 * context (`buildListingHref`), the badge, the favourite button and the
 * engagement analytics. Everything visual lives in `ListingCard`.
 *
 * Badge (one at most, in this order): `highlight="top"` — a paid TOP
 * placement, set only by callers rendering a promotions feed; the
 * objective "Top guest rating" (`isTopRated`); `highlight="new"` — the
 * Home featured rail's newest-per-category fill.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import ListingCard from '../../../../components/ListingCard/ListingCard.jsx';
import { FavoriteButton } from '../../../favorites/index.js';
import { buildListingCardModel } from '../../../../utils/listingCardModel.js';
import {
  useListingCardImpression,
  trackSearchResultClick,
  trackCompanyListingClick,
  trackPromotionClicked,
  PLACEMENTS,
} from '../../../../analytics/index.js';
import { buildListingHref } from '../../utils/searchContextQuery.js';

export const CARD_HIGHLIGHTS = Object.freeze(['top', 'new']);

/** The one badge a card carries, or null. */
function resolveBadge(highlight, topRated, t) {
  if (highlight === 'top') {
    return {
      tone: 'top',
      label: t('advertising.topBadge'),
      description: t('listingCard.badge.promoted'),
    };
  }
  if (topRated) {
    return { tone: 'accent', label: t('listingCard.badge.topRated') };
  }
  if (highlight === 'new') {
    return { tone: 'neutral', label: t('listingCard.badge.newest') };
  }
  return null;
}

export default function SearchResultCard({
  result,
  priorityImage = false,
  highlight = undefined,
  // Step A3 (engagement analytics) — explicit analytics context from the
  // parent (never inferred from the URL/badge text): its placement, this
  // card's rank in the list, the promotion behind a paid placement and,
  // on a Company profile, the company.
  placement = undefined,
  position = undefined,
  promotionId = undefined,
  companySlug = undefined,
  searchContext = undefined,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();
  const { topRated, ...card } = buildListingCardModel(result, t, {
    href: buildListingHref(locale, result, searchParams),
  });

  const impressionRef = useListingCardImpression({
    listingId: result.id,
    placement,
    position,
    categoryCode: result.category_slug ?? undefined,
    locale,
    promotionId,
  });

  const handleClick = () => {
    if (companySlug) {
      trackCompanyListingClick({ companySlug, listingId: result.id });
    } else if (placement === PLACEMENTS.SEARCH_RESULTS) {
      trackSearchResultClick({
        listingId: result.id,
        position,
        queryText: searchContext?.queryText,
        categoryCode:
          searchContext?.categoryCode ?? result.category_slug ?? undefined,
        locale,
      });
    }
    if (promotionId) {
      trackPromotionClicked({ promotionId, listingId: result.id, placement });
    }
  };

  return (
    <ListingCard
      ref={impressionRef}
      // eslint-disable-next-line react/jsx-props-no-spreading -- the card model is the ListingCard prop contract
      {...card}
      badge={resolveBadge(highlight, topRated, t)}
      favoriteButton={<FavoriteButton listingId={result.id} />}
      locale={locale}
      priorityImage={priorityImage}
      onClick={handleClick}
    />
  );
}

SearchResultCard.propTypes = {
  // Real `GET /search` row shape (FRONTEND_ARCHITECTURE.md §10.8's
  // normalized-but-untyped response), not a hand-authored prop contract.
  // eslint-disable-next-line react/forbid-prop-types
  result: PropTypes.object.isRequired,
  priorityImage: PropTypes.bool,
  highlight: PropTypes.oneOf(CARD_HIGHLIGHTS),
  placement: PropTypes.oneOf(Object.values(PLACEMENTS)),
  position: PropTypes.number,
  promotionId: PropTypes.number,
  companySlug: PropTypes.string,
  searchContext: PropTypes.shape({
    queryText: PropTypes.string,
    categoryCode: PropTypes.string,
  }),
};

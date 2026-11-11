/**
 * FavoriteListingCard — one favourited listing as the shared Desavii card
 * (`components/ListingCard`), built from the same card model every listing
 * surface uses (`utils/listingCardModel.js`). The Favorites DTO carries the
 * card fields of a search result, keyed by `listing_id`.
 *
 * Used by the Favorites page and the account dashboard's favourites
 * teaser. It cannot reuse `search`'s `SearchResultCard`: `search` already
 * depends on `favorites` (every card renders a `FavoriteButton`), so that
 * would close an import cycle. The only badge is the objective "Top guest
 * rating" — these surfaces have no placements.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import ListingCard from '../../../../components/ListingCard/ListingCard.jsx';
import { buildListingCardModel } from '../../../../utils/listingCardModel.js';
import FavoriteButton from '../FavoriteButton/FavoriteButton.jsx';

export default function FavoriteListingCard({ favorite }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { topRated, ...card } = buildListingCardModel(
    { ...favorite, id: favorite.listing_id },
    t,
    { href: `/${locale}/listings/${favorite.slug ?? favorite.listing_id}` },
  );
  return (
    <ListingCard
      // eslint-disable-next-line react/jsx-props-no-spreading -- the card model is the ListingCard prop contract
      {...card}
      badge={
        topRated
          ? { tone: 'accent', label: t('listingCard.badge.topRated') }
          : null
      }
      favoriteButton={<FavoriteButton listingId={favorite.listing_id} />}
      locale={locale}
    />
  );
}

FavoriteListingCard.propTypes = {
  // A `GET /favorites` row (`favoriteDto.js`), not a hand-authored shape.
  // eslint-disable-next-line react/forbid-prop-types
  favorite: PropTypes.object.isRequired,
};

/**
 * MapListingPreview — what a marker opens: the shared Desavii card in its
 * compact layout (`components/ListingCard`), built from the marker data
 * alone (no listing-detail request) by the same card model every listing
 * surface uses, and "Learn more" to its page with the Search's booking
 * context (`buildListingHref`). The listing page re-checks availability and
 * price itself; nothing here is a booking or a promise.
 *
 * A private stay's marker is only an approximate point, and the card says
 * so next to the city. Its title is focused when the preview opens
 * (`headingId`, `MapPreview`).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import ListingCard from '../../../../components/ListingCard/ListingCard.jsx';
import { buildListingCardModel } from '../../../../utils/listingCardModel.js';
import { buildListingHref } from '../../utils/searchContextQuery.js';
import { mapMarkerShape } from './mapPropShapes.js';

export default function MapListingPreview({ listing, headingId = undefined }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();
  const { topRated, ...card } = buildListingCardModel(listing, t, {
    href: buildListingHref(locale, listing, searchParams),
  });

  return (
    <ListingCard
      // eslint-disable-next-line react/jsx-props-no-spreading -- the card model is the ListingCard prop contract
      {...card}
      layout="compact"
      titleId={headingId}
      ctaLabel={t('search.map.preview.learnMore')}
      locationNote={
        listing.location_precision === 'approximate'
          ? t('search.map.preview.approximate')
          : null
      }
      badge={
        topRated
          ? { tone: 'accent', label: t('listingCard.badge.topRated') }
          : null
      }
      locale={locale}
    />
  );
}

MapListingPreview.propTypes = {
  listing: mapMarkerShape.isRequired,
  headingId: PropTypes.string,
};

/**
 * MapListingPreview — what a marker opens: a compact, truthful summary of
 * one listing from its marker data alone (no listing-detail request), and
 * "Learn more" to its page with the Search's booking context
 * (`buildListingHref`). The listing page re-checks availability and price
 * itself; nothing here is a booking or a promise.
 *
 * Facts are the card's own (`buildCategoryCardMeta`): only values the
 * listing really has, picked per category — never invented.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { RatingStars } from '@desavii/ui/components/data-display';
import Money from '../../../../components/Money/Money.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { buildCategoryCardMeta } from '../../../../utils/buildCategoryCardMeta.js';
import { buildListingHref } from '../../utils/searchContextQuery.js';
import { mapMarkerShape } from './mapPropShapes.js';
import styles from './MapPreview.module.scss';

export default function MapListingPreview({ listing, headingId = undefined }) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const [searchParams] = useSearchParams();
  const { metaChips, priceSuffix } = buildCategoryCardMeta(listing, t);
  const typeLabel = t(`listings.type.${listing.listing_type}`, {
    defaultValue: listing.listing_type,
  });

  return (
    <article className={styles.preview} aria-labelledby={headingId}>
      {listing.cover_image_url && (
        <img
          className={styles.cover}
          src={listing.cover_image_url}
          alt=""
          loading="lazy"
        />
      )}
      <div className={styles.body}>
        <p className={styles.type}>{typeLabel}</p>
        <h3 id={headingId} className={styles.title} tabIndex={-1}>
          {listing.title}
        </h3>
        {listing.city_name && (
          <p className={styles.location}>
            <MapPin size={14} aria-hidden="true" />
            {listing.city_name}
            {listing.location_precision === 'approximate' && (
              <>
                <span aria-hidden="true">·</span>
                <span className={styles.approximate}>
                  {t('search.map.preview.approximate')}
                </span>
              </>
            )}
          </p>
        )}
        {listing.review_count > 0 && (
          <RatingStars
            value={listing.rating_average}
            reviewCount={listing.review_count}
            size="sm"
          />
        )}
        {metaChips.length > 0 && (
          <ul className={styles.facts}>
            {metaChips.slice(0, 3).map((chip) => (
              <li key={chip.key} className={styles.fact}>
                {chip.label}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.footer}>
          {listing.price_amount && (
            <p className={styles.price}>
              <span className={styles.pricePrefix}>
                {t('search.card.fromPrice')}
              </span>
              <Money
                amountAmd={listing.price_amount}
                locale={locale}
                size="md"
                suffix={priceSuffix ?? undefined}
              />
            </p>
          )}
          <RouterLink
            href={buildListingHref(locale, listing, searchParams)}
            className={styles.learnMore}
          >
            {t('search.map.preview.learnMore')}
          </RouterLink>
        </div>
      </div>
    </article>
  );
}

MapListingPreview.propTypes = {
  listing: mapMarkerShape.isRequired,
  headingId: PropTypes.string,
};

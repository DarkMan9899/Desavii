/**
 * FeaturedListingCard — one card of Home's featured rail. Home-only: the
 * Search page keeps `SearchResultCard`; this card is composed for a
 * rail of a few cards side by side rather than a results grid.
 *
 * Image first (the locked 4:3 promoted-card ratio), then an editorial
 * caption: category and city on a gold hairline, the title in the display
 * face, at most two real category facts, and a footer with the "from"
 * price and a ringed arrow cue. The whole card is one link (the title's
 * link stretches over it); the favourite button sits above it.
 *
 * The badge says why the card is on the rail (`source`, see
 * `selectFeaturedListings`): TOP for a paid Home placement, "Guest
 * favourite" for a reviewed listing, "New" for the newest of its
 * category. Only a promoted card reports promotion analytics.
 */

import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Star } from 'lucide-react';
import { PriceTag } from '@desavii/ui/components/data-display';
import DestinationArt from '../../../../components/DestinationArt/DestinationArt.jsx';
import Money from '../../../../components/Money/Money.jsx';
import { buildCategoryCardMeta } from '../../../../utils/buildCategoryCardMeta.js';
import {
  PLACEMENTS,
  trackPromotionClicked,
  useListingCardImpression,
} from '../../../../analytics/index.js';
import { FavoriteButton } from '../../../favorites/index.js';
import { FEATURED_SOURCES } from '../../utils/selectFeaturedListings.js';
import styles from './FeaturedListingCard.module.scss';

const MAX_FACTS = 2;
const RATING_DIGITS = 1;

function SourceBadge({ source }) {
  const { t } = useTranslation();
  if (source === FEATURED_SOURCES.PROMOTED) {
    // "TOP (promoted listing)" to assistive technology.
    const promotedNote = ` (${t('home.featured.badge.promoted')})`;
    return (
      <span className={[styles.badge, styles.badgeTop].join(' ')}>
        {t('advertising.topBadge')}
        <span className={styles.visuallyHidden}>{promotedNote}</span>
      </span>
    );
  }
  return (
    <span className={styles.badge}>
      {t(
        source === FEATURED_SOURCES.RATED
          ? 'home.featured.badge.rated'
          : 'home.featured.badge.newest',
      )}
    </span>
  );
}

SourceBadge.propTypes = {
  source: PropTypes.oneOf(Object.values(FEATURED_SOURCES)).isRequired,
};

export default function FeaturedListingCard({
  listing,
  source,
  position,
  priorityImage = false,
}) {
  const { t } = useTranslation();
  const { locale } = useParams();
  const titleId = useId();
  const [imageFailed, setImageFailed] = useState(false);
  const isPromoted = source === FEATURED_SOURCES.PROMOTED;
  const promotionId = isPromoted ? listing.promotion_id : undefined;

  // Only a paid placement is reported as one; the filler cards are not
  // promotions and must never count towards a promotion's impressions.
  const impressionRef = useListingCardImpression({
    listingId: listing.id,
    placement: isPromoted ? PLACEMENTS.HOME_FEATURED : undefined,
    position,
    categoryCode: listing.category_slug ?? undefined,
    locale,
    promotionId,
  });
  const handleClick = () => {
    if (promotionId) {
      trackPromotionClicked({
        promotionId,
        listingId: listing.id,
        placement: PLACEMENTS.HOME_FEATURED,
      });
    }
  };

  const { categoryVisualKey, metaChips, priceSuffix } = buildCategoryCardMeta(
    listing,
    t,
  );
  const typeLabel = t(`listings.type.${listing.listing_type}`, {
    defaultValue: listing.listing_type,
  });
  const facts = metaChips.slice(0, MAX_FACTS);
  const reviewCount = Number(listing.review_count) || 0;
  const rating = Number(listing.rating_average);

  return (
    <article
      ref={impressionRef}
      className={styles.card}
      aria-labelledby={titleId}
      data-category={categoryVisualKey}
      data-source={source}
    >
      <div className={styles.media}>
        {listing.cover_image_url && !imageFailed ? (
          <img
            className={styles.image}
            src={listing.cover_image_url}
            alt=""
            loading={priorityImage ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <DestinationArt seed={listing.title} className={styles.image} />
        )}
        <SourceBadge source={source} />
        <span className={styles.favorite}>
          <FavoriteButton listingId={listing.id} />
        </span>
      </div>

      <div className={styles.body}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowText}>{typeLabel}</span>
          {listing.city_name && (
            <>
              <span aria-hidden="true" className={styles.dot} />
              <span className={styles.eyebrowText}>{listing.city_name}</span>
            </>
          )}
        </p>
        <h3 id={titleId} className={styles.title}>
          <Link
            className={styles.link}
            to={`/${locale}/listings/${listing.slug ?? listing.id}`}
            onClick={handleClick}
          >
            {listing.title}
          </Link>
        </h3>

        {(reviewCount > 0 || facts.length > 0) && (
          <ul className={styles.facts}>
            {reviewCount > 0 && Number.isFinite(rating) && (
              <li className={styles.fact}>
                <Star size={14} aria-hidden="true" className={styles.star} />
                {t('home.featured.rating', {
                  rating: rating.toFixed(RATING_DIGITS),
                  count: reviewCount,
                })}
              </li>
            )}
            {facts.map((fact) => (
              <li key={fact.key} className={styles.fact}>
                {fact.icon && <fact.icon size={14} aria-hidden="true" />}
                {fact.label}
              </li>
            ))}
          </ul>
        )}

        <div className={styles.footer}>
          {listing.price_amount ? (
            <p className={styles.price}>
              <span className={styles.priceLabel}>
                {t('search.card.fromPrice')}
              </span>
              {/* Every platform price is authored in AMD and converted to
                  the visitor's currency; any other code is shown as-is. */}
              {listing.price_currency_code === 'AMD' ? (
                <Money
                  amountAmd={listing.price_amount}
                  locale={locale}
                  size="md"
                />
              ) : (
                <PriceTag
                  amount={listing.price_amount}
                  currencyCode={listing.price_currency_code}
                  locale={locale}
                  size="md"
                />
              )}
              {priceSuffix && (
                <span className={styles.priceLabel}>{priceSuffix}</span>
              )}
            </p>
          ) : (
            <p className={styles.priceLabel}>
              {t('home.featured.priceOnRequest')}
            </p>
          )}
          <span className={styles.cue} aria-hidden="true">
            <ArrowUpRight size={18} />
          </span>
        </div>
      </div>
    </article>
  );
}

FeaturedListingCard.propTypes = {
  // The flat `GET /search` card DTO (also what the Home placements return).
  // eslint-disable-next-line react/forbid-prop-types
  listing: PropTypes.object.isRequired,
  source: PropTypes.oneOf(Object.values(FEATURED_SOURCES)).isRequired,
  position: PropTypes.number.isRequired,
  priorityImage: PropTypes.bool,
};

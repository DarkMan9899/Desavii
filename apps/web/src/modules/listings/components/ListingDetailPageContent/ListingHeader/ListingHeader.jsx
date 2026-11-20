/**
 * ListingHeader — the first thing read under the photos, in the order a
 * traveller decides (docs/LISTING_DETAIL_REDESIGN.md):
 *
 * 1. what and where — the precise category · city, country (with
 *    "Approximate area" for a private stay, whose exact place is never
 *    shown), then the title;
 * 2. what guests think — the approved-review rating and count linking to
 *    the reviews, or an honest "No reviews yet";
 * 3. what matters most — the partner's highlights, the category's key
 *    facts (`ListingKeyFacts`) and its top features (the card's
 *    decision-relevant amenities).
 *
 * The price is never repeated here: from laptop the pinned reservation
 * panel shows it, below laptop the fixed booking bar does — one price
 * source on screen, never two that could disagree.
 *
 * Everything is real or absent: no rating without reviews, no fact the
 * listing never stored.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { HighlightsList } from '@desavii/ui/components/data-display';
import ListingRating, {
  listingRatingShape,
} from '../../../../../components/ListingRating/ListingRating.jsx';
import resolveHighlightIcon from '../../../utils/highlightIcons.js';
import ListingKeyFacts from '../ListingKeyFacts/ListingKeyFacts.jsx';
import styles from './ListingHeader.module.scss';

export default function ListingHeader({
  title,
  typeLabel,
  cityName = null,
  countryName = null,
  isApproximate = false,
  rating = null,
  reviewsAnchorId,
  highlights = [],
  keyFacts = [],
  features = [],
  actions = undefined,
}) {
  const { t } = useTranslation();
  const place = [cityName, countryName].filter(Boolean).join(', ');

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <p className={styles.eyebrow}>
          <span className={styles.type}>{typeLabel}</span>
          {place && (
            <span className={styles.place}>
              <MapPin size={14} aria-hidden="true" />
              {place}
              {isApproximate && (
                <span className={styles.approximate}>
                  {t('pages.listingDetail.header.approximateArea')}
                </span>
              )}
            </span>
          )}
        </p>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.metaRow}>
          {rating ? (
            <a href={`#${reviewsAnchorId}`} className={styles.rating}>
              <ListingRating rating={rating} />
            </a>
          ) : (
            <p className={styles.rating}>
              <ListingRating rating={null} />
            </p>
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </div>

      {highlights.length > 0 && (
        <HighlightsList
          highlights={highlights.map((highlight) => ({
            text: highlight.text,
            icon: resolveHighlightIcon(highlight.icon_code),
          }))}
          className={styles.highlights}
        />
      )}

      <ListingKeyFacts facts={keyFacts} />

      {features.length > 0 && (
        <ul
          className={styles.features}
          aria-label={t('pages.listingDetail.header.featuresLabel')}
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.key} className={styles.feature}>
                {Icon && <Icon size={16} aria-hidden="true" />}
                {feature.label}
              </li>
            );
          })}
        </ul>
      )}
    </header>
  );
}

ListingHeader.propTypes = {
  title: PropTypes.string.isRequired,
  typeLabel: PropTypes.string.isRequired,
  cityName: PropTypes.string,
  countryName: PropTypes.string,
  isApproximate: PropTypes.bool,
  rating: listingRatingShape,
  reviewsAnchorId: PropTypes.string.isRequired,
  highlights: PropTypes.arrayOf(
    PropTypes.shape({
      icon_code: PropTypes.string,
      text: PropTypes.string.isRequired,
    }),
  ),
  keyFacts: ListingKeyFacts.propTypes.facts,
  features: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      icon: PropTypes.elementType,
      label: PropTypes.string.isRequired,
    }),
  ),
  actions: PropTypes.node,
};

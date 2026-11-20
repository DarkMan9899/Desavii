/**
 * ListingRating — a listing's approved-review rating as every Desavii
 * surface shows it (docs/LISTING_CARDS.md): a gold star, the average to one
 * decimal in the page language and the approved-review count ("★ 4.7 · 7
 * reviews", "★ 4,7 · 7 կարծիք"), spoken as
 * one sentence; or an honest "No reviews yet" — never a 0.0 or empty
 * stars. Renders inline content only, so a card can put it in a paragraph
 * and the Listing Detail header in a link to its reviews.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { formatRatingAverage } from '../../utils/formatRating.js';
import styles from './ListingRating.module.scss';

export const listingRatingShape = PropTypes.shape({
  average: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired,
});

export default function ListingRating({ rating = null }) {
  const { t, i18n } = useTranslation();
  if (!rating) {
    return (
      <>
        <Star size={14} aria-hidden="true" className={styles.starEmpty} />
        {t('listingCard.reviews.none')}
      </>
    );
  }
  return (
    <>
      <Star size={14} aria-hidden="true" className={styles.star} />
      <span aria-hidden="true" className={styles.value}>
        {formatRatingAverage(rating.average, i18n.language)}
      </span>
      <span aria-hidden="true" className={styles.dot} />
      <span aria-hidden="true">
        {t('listingCard.reviews.count', { count: rating.count })}
      </span>
      <span className={styles.visuallyHidden}>
        {t('listingCard.reviews.label', {
          rating: formatRatingAverage(rating.average, i18n.language),
          count: rating.count,
        })}
      </span>
    </>
  );
}

ListingRating.propTypes = {
  rating: listingRatingShape,
};

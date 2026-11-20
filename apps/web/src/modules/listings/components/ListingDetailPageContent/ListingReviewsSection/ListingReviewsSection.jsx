/**
 * ListingReviewsSection — what real guests think. One summary — the
 * approved-review average in large type, a gold star and the
 * approved-review count, spoken as one sentence — then the reviews
 * themselves (`ReviewsList`, newest first, "Load more"). Display only:
 * reviews are written from a completed booking, never here.
 *
 * No per-star distribution: with the handful of reviews most listings
 * have, a bar chart would suggest a precision the data does not have.
 *
 * Without a single approved review the section is one honest line — no
 * empty-state block, no request for a list known to be empty.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import { Star } from 'lucide-react';
import { listingRatingShape } from '../../../../../components/ListingRating/ListingRating.jsx';
import { formatRatingAverage } from '../../../../../utils/formatRating.js';
import { ReviewsList } from '../../../../reviews/index.js';
import styles from './ListingReviewsSection.module.scss';

export default function ListingReviewsSection({
  listingId,
  companySlug = undefined,
  rating = null,
  sectionId = undefined,
}) {
  const { t, i18n } = useTranslation();

  return (
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.reviews.heading')}
    >
      <h2 id={sectionId}>{t('pages.listingDetail.reviews.heading')}</h2>
      {rating ? (
        <div className={styles.body}>
          <p className={styles.summary}>
            <span className={styles.average} aria-hidden="true">
              {formatRatingAverage(rating.average, i18n.language)}
            </span>
            <span className={styles.ratingLine} aria-hidden="true">
              <Star size={16} className={styles.star} />
              {t('listingCard.reviews.count', { count: rating.count })}
            </span>
            <span className={styles.visuallyHidden}>
              {t('listingCard.reviews.label', {
                rating: formatRatingAverage(rating.average, i18n.language),
                count: rating.count,
              })}
            </span>
          </p>
          <ReviewsList listingId={listingId} companySlug={companySlug} />
        </div>
      ) : (
        <p className={styles.none}>{t('pages.listingDetail.reviews.none')}</p>
      )}
    </Section>
  );
}

ListingReviewsSection.propTypes = {
  listingId: PropTypes.number.isRequired,
  // The listing's public company — lets its OWNER/MANAGER staff reply.
  companySlug: PropTypes.string,
  rating: listingRatingShape,
  sectionId: PropTypes.string,
};

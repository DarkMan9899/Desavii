/**
 * ListingReviewsSection — Phase 18 (Premium Listing Detail): adds the
 * shared `ReviewSummary` primitive (big average + rating stars) above
 * the existing `ReviewsList`, using the listing's own `rating_average`/
 * `review_count` (Phase 12's real, backend-computed aggregate — never
 * fabricated). No distribution bars: the backend doesn't compute a
 * per-star breakdown, and `ReviewSummary` already treats that as
 * optional rather than requiring an estimate. Reviews are only ever
 * submitted from a completed booking's own detail page
 * (`BookingDetailPageContent`'s review gate) — this section stays
 * display-only, no "write a review" CTA here.
 *
 * Listing Detail rebuild: with no review at all (`reviewCount` is the live
 * count of approved reviews, the same filter the list itself reads) the
 * section is one quiet line — no empty-state block, and no request for a
 * list known to be empty.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { ReviewSummary } from '@desavii/ui/components/data-display';
import { Section, Stack } from '@desavii/ui/components/layout';
import { ReviewsList } from '../../../../reviews/index.js';
import styles from './ListingReviewsSection.module.scss';

export default function ListingReviewsSection({
  listingId,
  partnerId = undefined,
  ratingAverage = null,
  reviewCount = 0,
  sectionId = undefined,
}) {
  const { t } = useTranslation();

  return (
    // Redesign phase (2026) — `<Section spacing="none">`, matching every
    // sibling section's own root shape, so `ListingDetailPageContent.
    // module.scss`'s shared `.main > section` card treatment applies here
    // too (this was previously the one section rendering a bare `Stack`,
    // the one section that stayed un-carded and visually inconsistent).
    <Section
      spacing="none"
      aria-label={t('pages.listingDetail.reviews.heading')}
    >
      <Stack gap="4">
        <h2 id={sectionId}>{t('pages.listingDetail.reviews.heading')}</h2>
        {reviewCount === 0 ? (
          <p className={styles.none}>{t('pages.listingDetail.reviews.none')}</p>
        ) : (
          <>
            {ratingAverage !== null && (
              <ReviewSummary
                average={ratingAverage}
                reviewCount={reviewCount}
              />
            )}
            <ReviewsList listingId={listingId} partnerId={partnerId} />
          </>
        )}
      </Stack>
    </Section>
  );
}

ListingReviewsSection.propTypes = {
  listingId: PropTypes.number.isRequired,
  // The listing's owning partner — lets `ReviewsList` show Reply/Edit/
  // Delete affordances to that partner's OWNER/MANAGER staff.
  partnerId: PropTypes.number,
  ratingAverage: PropTypes.number,
  reviewCount: PropTypes.number,
  sectionId: PropTypes.string,
};

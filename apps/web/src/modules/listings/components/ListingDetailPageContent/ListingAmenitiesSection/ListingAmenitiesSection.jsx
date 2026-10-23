/**
 * ListingAmenitiesSection — what the listing offers, at a glance first
 * (docs/LISTING_DETAIL_FIELD_GAP.md §3).
 *
 * A short list is shown in full as one compact icon grid. A long one
 * shows the listing's most-looked-for amenities (`POPULAR_AMENITY_KEYS`:
 * Wi-Fi, parking, breakfast… — the Hotels.com / Booking.com "popular"
 * pattern), and the complete list, grouped, opens in a dialog, so a
 * 30-amenity villa never turns into a page-long wall.
 *
 * Every amenity has its own icon (`amenityIcons.js`, by the amenity's
 * stable key) and its localized label from `metadata.amenity_groups`
 * (matched to the listing's `amenity_ids`). A stored amenity the category
 * no longer offers is not in the catalog and so is never shown.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FeatureGrid } from '@desavii/ui/components/data-display';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { Section } from '@desavii/ui/components/layout';
import {
  resolveAmenityFeatureGroups,
  resolvePopularAmenities,
} from '../../../utils/resolveAmenityFeatureGroups.js';
import styles from './ListingAmenitiesSection.module.scss';

// Up to this many amenities read fine as one icon grid on the page.
const INLINE_AMENITY_LIMIT = 10;
const POPULAR_AMENITY_LIMIT = 8;

export default function ListingAmenitiesSection({
  amenityGroups = [],
  amenityIds = [],
  headingKey = 'pages.listingDetail.amenities.heading',
  sectionId = undefined,
}) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const groups = resolveAmenityFeatureGroups(amenityGroups, amenityIds, t);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (total === 0) return null;

  const heading = t(headingKey);
  const allItems = groups.flatMap((group) => group.items);
  // A short list reads best as one flat icon grid — grouping six amenities
  // under six headings is a tall, sparse column. A long one shows the
  // most-looked-for amenities (or simply the first ones, if too few of
  // them are "popular") and the complete grouped list in a dialog.
  let visibleItems = allItems;
  if (total > INLINE_AMENITY_LIMIT) {
    const popular = resolvePopularAmenities(groups, POPULAR_AMENITY_LIMIT);
    visibleItems =
      popular.length >= POPULAR_AMENITY_LIMIT / 2
        ? popular
        : allItems.slice(0, POPULAR_AMENITY_LIMIT);
  }
  const hasMore = visibleItems.length < total;

  return (
    <Section spacing="none" aria-label={heading}>
      <h2 id={sectionId}>{heading}</h2>
      <div className={styles.amenities}>
        <ul className={styles.grid}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <li className={styles.item} key={item.label}>
                <Icon
                  className={styles.icon}
                  aria-hidden="true"
                  focusable="false"
                />
                <span>{item.label}</span>
              </li>
            );
          })}
        </ul>
        {hasMore && (
          <Button
            variant="secondary"
            onClick={() => setIsDialogOpen(true)}
            ariaHasPopup="dialog"
          >
            {t('pages.listingDetail.amenities.showAllCount', { count: total })}
          </Button>
        )}
      </div>
      {isDialogOpen && (
        <Modal
          isOpen
          onClose={() => setIsDialogOpen(false)}
          title={heading}
          closeLabel={t('common.close')}
          size="lg"
        >
          <FeatureGrid groups={groups} collapsible={false} />
        </Modal>
      )}
    </Section>
  );
}

ListingAmenitiesSection.propTypes = {
  amenityGroups: PropTypes.arrayOf(
    PropTypes.shape({
      code: PropTypes.string.isRequired,
      amenities: PropTypes.arrayOf(
        PropTypes.shape({
          value: PropTypes.number.isRequired,
          code: PropTypes.string.isRequired,
          key: PropTypes.string,
        }),
      ).isRequired,
    }),
  ),
  amenityIds: PropTypes.arrayOf(PropTypes.number),
  // The section's i18n heading key — "Amenities", or a category's own
  // wording (a car's "Features & equipment").
  headingKey: PropTypes.string,
  sectionId: PropTypes.string,
};

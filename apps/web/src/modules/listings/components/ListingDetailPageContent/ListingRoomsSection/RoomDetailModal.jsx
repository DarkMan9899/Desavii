/**
 * RoomDetailModal — Sprint C-2 (Public Rooms / Choose Your Room). The
 * full-detail view for one HOTEL_ROOM unit: reuses `Modal` (same portal/
 * focus-trap/Escape/scroll-lock/focus-return behavior every other
 * dialog on this page already gets for free — see `ListingGallery.jsx`'s
 * own lightbox) and `ListingGallery` itself for the room-specific photo
 * grid+lightbox (`unit.media`, never the listing's own gallery — see
 * this component's own render below), plus `FeatureGrid` for the full
 * room-amenities list (`ListingAmenitiesSection`'s own primitive, fed by
 * the shared `resolveAmenityFeatureGroups` matcher).
 *
 * Information hierarchy follows the brief's own customer-first order:
 * photos, title, description, key facts (guests/beds/size), room
 * features (bathroom/view/smoking), amenities, price, then the one
 * "Select Room" action — never internal inventory concepts like pooled
 * `capacity`.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import { Button } from '@desavii/ui/components/primitives';
import { PriceTag, FeatureGrid } from '@desavii/ui/components/data-display';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  Users,
  Maximize2,
  BedDouble,
  Bath,
  Eye,
  Cigarette,
} from 'lucide-react';
import ListingGallery from '../ListingGallery/ListingGallery.jsx';
import getLocalizedTranslation from '../../../utils/getLocalizedTranslation.js';
import { resolveUnitDisplayLabel } from '../../../utils/resolveUnitDisplayLabel.js';
import { formatBedConfiguration } from '../../../utils/bedConfigurationDisplay.js';
import { resolveAmenityFeatureGroups } from '../../../utils/resolveAmenityFeatureGroups.js';
import {
  formatBathroomType,
  formatViewType,
  formatSmokingPolicy,
} from './roomAttributeLabels.js';
import styles from './RoomDetailModal.module.scss';

export default function RoomDetailModal({
  unit,
  amenityGroups = [],
  pricingModelLabel = undefined,
  locale = undefined,
  isSelected,
  isOpen,
  onClose,
  onSelect,
}) {
  const { t } = useTranslation();

  const title = resolveUnitDisplayLabel(t, unit);
  const description = getLocalizedTranslation(
    unit.translations,
    locale,
  )?.description;
  const bedsSummary = formatBedConfiguration(t, unit.bed_configuration);
  const bathroomLabel = formatBathroomType(t, unit.bathroom_type);
  const viewLabel = formatViewType(t, unit.view_type);
  const smokingLabel = formatSmokingPolicy(t, unit.smoking_policy);
  const amenityGroupsResolved = resolveAmenityFeatureGroups(
    amenityGroups,
    unit.amenity_ids,
    t,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeLabel={t('pages.listingDetail.rooms.closeRoomDetail')}
      size="lg"
      footer={
        <Inline gap="2" justify="flex-end" className={styles.footer}>
          {unit.base_price_amount != null && (
            <PriceTag
              amount={unit.base_price_amount}
              currencyCode={unit.base_price_currency}
              locale={locale}
              suffix={pricingModelLabel}
              size="md"
            />
          )}
          <Button
            variant={isSelected ? 'ghost' : 'primary'}
            size="md"
            disabled={isSelected}
            onClick={() => onSelect(unit.id)}
          >
            {isSelected
              ? t('pages.listingDetail.rooms.selected')
              : t('pages.listingDetail.rooms.selectRoom')}
          </Button>
        </Inline>
      }
    >
      <Stack gap="6">
        {unit.media?.length > 0 ? (
          <ListingGallery media={unit.media} title={title} />
        ) : (
          <p className={styles.noPhotos}>
            {t('pages.listingDetail.rooms.noRoomPhotos')}
          </p>
        )}

        {description && <p className={styles.description}>{description}</p>}

        <Inline gap="6" wrap className={styles.keyFacts}>
          {unit.max_guests != null && (
            <span className={styles.keyFact}>
              <Users size={18} aria-hidden="true" />
              {t('partner.listingWizard.availability.maxGuestsSummary', {
                count: unit.max_guests,
              })}
            </span>
          )}
          {bedsSummary && (
            <span className={styles.keyFact}>
              <BedDouble size={18} aria-hidden="true" />
              {bedsSummary}
            </span>
          )}
          {unit.room_size_sqm != null && (
            <span className={styles.keyFact}>
              <Maximize2 size={18} aria-hidden="true" />
              {t('pages.listingDetail.rooms.roomSizeValue', {
                // See RoomCard.jsx's identical conversion for why.
                size: Number(unit.room_size_sqm),
              })}
            </span>
          )}
        </Inline>

        {(bathroomLabel || viewLabel || smokingLabel) && (
          <Inline gap="6" wrap className={styles.keyFacts}>
            {bathroomLabel && (
              <span className={styles.keyFact}>
                <Bath size={18} aria-hidden="true" />
                {bathroomLabel}
              </span>
            )}
            {viewLabel && (
              <span className={styles.keyFact}>
                <Eye size={18} aria-hidden="true" />
                {viewLabel}
              </span>
            )}
            {smokingLabel && (
              <span className={styles.keyFact}>
                <Cigarette size={18} aria-hidden="true" />
                {smokingLabel}
              </span>
            )}
          </Inline>
        )}

        {amenityGroupsResolved.length > 0 && (
          <Stack gap="2">
            <h3 className={styles.amenitiesHeading}>
              {t('pages.listingDetail.rooms.roomAmenitiesHeading')}
            </h3>
            <FeatureGrid
              groups={amenityGroupsResolved}
              showAllLabel={t('pages.listingDetail.amenities.showAll')}
              showLessLabel={t('pages.listingDetail.amenities.showLess')}
            />
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

RoomDetailModal.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- real GET /availability/:listingId/units row shape (toPublicBookableUnitResponse)
  unit: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- real GET /listings/metadata amenity_groups shape
  amenityGroups: PropTypes.array,
  pricingModelLabel: PropTypes.string,
  locale: PropTypes.string,
  isSelected: PropTypes.bool.isRequired,
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};

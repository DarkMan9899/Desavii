/**
 * RoomCard — Sprint C-2 (Public Rooms / Choose Your Room). One real
 * HOTEL_ROOM bookable unit, rendered as a comparable card: cover photo,
 * name, a short description excerpt, key facts (guests/beds/size/
 * bathroom/view), up to 5 room amenities, its own base price, and two
 * actions ("View room" opens the full `RoomDetailModal`; "Select room"
 * sets this unit as the listing's one canonical selection — the same
 * `onSelect` `ListingReservationWidget`'s own unit `Select` already
 * calls, never a second, parallel booking state).
 *
 * Reuses `resolveAmenityFeatureGroups` (the same id-to-label/icon
 * matching `ListingAmenitiesSection` uses for the listing's own
 * amenities) and `formatBedConfiguration`/`getLocalizedTranslation`
 * (already public, already used by `ListingReservationWidget`/the main
 * listing description) — no new resolution logic invented for data that
 * already has one.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Check, Maximize2, Users } from 'lucide-react';
import { Card, Button } from '@desavii/ui/components/primitives';
import { PriceTag } from '@desavii/ui/components/data-display';
import { Stack, Inline } from '@desavii/ui/components/layout';
import DestinationArt from '../../../../../components/DestinationArt/DestinationArt.jsx';
import getLocalizedTranslation from '../../../utils/getLocalizedTranslation.js';
import { resolveUnitDisplayLabel } from '../../../utils/resolveUnitDisplayLabel.js';
import { formatBedConfiguration } from '../../../utils/bedConfigurationDisplay.js';
import { resolveAmenityFeatureGroups } from '../../../utils/resolveAmenityFeatureGroups.js';
import { formatBathroomType, formatViewType } from './roomAttributeLabels.js';
import styles from './RoomCard.module.scss';

const CARD_AMENITY_LIMIT = 5;

export default function RoomCard({
  unit,
  amenityGroups = [],
  pricingModelLabel = undefined,
  locale = undefined,
  isSelected,
  onSelect,
  onViewDetail,
  priorityImage = false,
}) {
  const { t } = useTranslation();

  const title = resolveUnitDisplayLabel(t, unit);
  const coverMedia = (unit.media ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .find((item) => item.media_type === 'IMAGE');
  const description = getLocalizedTranslation(
    unit.translations,
    locale,
  )?.description;
  const bedsSummary = formatBedConfiguration(t, unit.bed_configuration);
  const bathroomLabel = formatBathroomType(t, unit.bathroom_type);
  const viewLabel = formatViewType(t, unit.view_type);
  const amenityItems = resolveAmenityFeatureGroups(
    amenityGroups,
    unit.amenity_ids,
    t,
  ).flatMap((group) => group.items);
  const visibleAmenities = amenityItems.slice(0, CARD_AMENITY_LIMIT);
  const extraAmenityCount = amenityItems.length - visibleAmenities.length;

  return (
    <Card
      padding="none"
      elevated
      className={[styles.card, isSelected && styles.selected]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.media}>
        {coverMedia ? (
          <img
            src={coverMedia.thumbnail_url ?? coverMedia.url}
            alt={title}
            className={styles.image}
            loading={priorityImage ? 'eager' : 'lazy'}
            // eslint-disable-next-line react/no-unknown-property -- lowercase spelling passes straight through as the real HTML attribute (see ListingGallery.jsx's identical usage)
            fetchpriority={priorityImage ? 'high' : undefined}
          />
        ) : (
          <DestinationArt seed={unit.id} className={styles.imagePlaceholder} />
        )}
        {isSelected && (
          <span className={styles.selectedBadge}>
            <Check size={14} aria-hidden="true" />
            {t('pages.listingDetail.rooms.selected')}
          </span>
        )}
      </div>

      <Stack gap="3" className={styles.body}>
        <h3 className={styles.title}>{title}</h3>

        {description && <p className={styles.description}>{description}</p>}

        <Inline gap="3" wrap className={styles.facts}>
          {unit.max_guests != null && (
            <span className={styles.fact}>
              <Users size={14} aria-hidden="true" />
              {t('partner.listingWizard.availability.maxGuestsSummary', {
                count: unit.max_guests,
              })}
            </span>
          )}
          {unit.room_size_sqm != null && (
            <span className={styles.fact}>
              <Maximize2 size={14} aria-hidden="true" />
              {t('pages.listingDetail.rooms.roomSizeValue', {
                // The API's DECIMAL(6,2) column serializes as a fixed
                // 2-decimal string ("18.00") — Number() strips a whole
                // value's trailing zeros for display while still
                // preserving a genuinely fractional size ("18.5").
                size: Number(unit.room_size_sqm),
              })}
            </span>
          )}
        </Inline>

        {(bedsSummary || bathroomLabel || viewLabel) && (
          <p className={styles.subFacts}>
            {[bedsSummary, bathroomLabel, viewLabel]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        {visibleAmenities.length > 0 && (
          <Inline gap="2" wrap className={styles.amenities}>
            {visibleAmenities.map((item) => (
              <span key={item.label} className={styles.amenityChip}>
                <item.icon size={14} aria-hidden="true" />
                {item.label}
              </span>
            ))}
            {extraAmenityCount > 0 && (
              <span className={styles.amenityChip}>
                {t('pages.listingDetail.rooms.moreAmenities', {
                  count: extraAmenityCount,
                })}
              </span>
            )}
          </Inline>
        )}

        {unit.base_price_amount != null && (
          <PriceTag
            amount={unit.base_price_amount}
            currencyCode={unit.base_price_currency}
            locale={locale}
            suffix={pricingModelLabel}
            size="md"
          />
        )}

        <Inline gap="2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewDetail(unit.id)}
            ariaLabel={t('pages.listingDetail.rooms.viewRoomAriaLabel', {
              title,
            })}
          >
            {t('pages.listingDetail.rooms.viewRoom')}
          </Button>
          <Button
            variant={isSelected ? 'ghost' : 'primary'}
            size="sm"
            disabled={isSelected}
            onClick={() => onSelect(unit.id)}
            ariaLabel={t('pages.listingDetail.rooms.selectRoomAriaLabel', {
              title,
            })}
          >
            {isSelected
              ? t('pages.listingDetail.rooms.selected')
              : t('pages.listingDetail.rooms.selectRoom')}
          </Button>
        </Inline>
      </Stack>
    </Card>
  );
}

RoomCard.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- real GET /availability/:listingId/units row shape (toPublicBookableUnitResponse), not a hand-authored contract
  unit: PropTypes.object.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- real GET /listings/metadata amenity_groups shape
  amenityGroups: PropTypes.array,
  pricingModelLabel: PropTypes.string,
  locale: PropTypes.string,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onViewDetail: PropTypes.func.isRequired,
  priorityImage: PropTypes.bool,
};

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
 *
 * Sprint C-3 (Date-Range Room Availability): the footer's price/action row
 * mirrors `RoomCard.jsx`'s own stay-total/sold-out treatment exactly — the
 * same `unit` object (carrying the same additive fields once a stay range
 * is chosen), so a room's detail view never disagrees with its own card.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Modal } from '@desavii/ui/components/feedback-overlays';
import { Button, Badge } from '@desavii/ui/components/primitives';
import { FeatureGrid } from '@desavii/ui/components/data-display';
import { Stack, Inline } from '@desavii/ui/components/layout';
import {
  Users,
  Maximize2,
  BedDouble,
  Bath,
  Eye,
  Cigarette,
  Baby,
  Utensils,
} from 'lucide-react';
import ListingGallery from '../ListingGallery/ListingGallery.jsx';
import DestinationArt from '../../../../../components/DestinationArt/DestinationArt.jsx';
import PriceInCurrency from '../../../../../components/Money/PriceInCurrency.jsx';
import getLocalizedTranslation from '../../../utils/getLocalizedTranslation.js';
import { resolveUnitDisplayLabel } from '../../../utils/resolveUnitDisplayLabel.js';
import { describeBedConfiguration } from '../../../utils/bedConfigurationDisplay.js';
import { isHourlyRoom } from '../../../utils/hourlyStay.js';
import { resolveAmenityFeatureGroups } from '../../../utils/resolveAmenityFeatureGroups.js';
import {
  formatBathroomType,
  formatViewType,
  formatSmokingPolicy,
  formatMealPlan,
} from './roomAttributeLabels.js';
import styles from './RoomDetailModal.module.scss';

// Sleeping options for children, marked with their own icon.
const CHILD_SLEEPING_TYPES = new Set(['CHILD_BED', 'CRIB']);

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
  // Step L6.3A: one line per bed type, children's options marked apart.
  const bedLines = (unit.bed_configuration ?? [])
    .filter((row) => row.count > 0)
    .map((row, index) => ({
      type: row.type,
      label: describeBedConfiguration(t, [row])[0],
      key: `${row.type}-${index}`,
    }));
  const mealLabel = formatMealPlan(t, unit.meal_plan);
  const bathroomLabel = formatBathroomType(t, unit.bathroom_type);
  const viewLabel = formatViewType(t, unit.view_type);
  const smokingLabel = formatSmokingPolicy(t, unit.smoking_policy);
  const amenityGroupsResolved = resolveAmenityFeatureGroups(
    amenityGroups,
    unit.amenity_ids,
    t,
  );

  const stayStatus = unit.availability_status_for_stay;
  const hasStayInfo = stayStatus !== undefined;
  const isStaySoldOut = stayStatus === 'SOLD_OUT';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      closeLabel={t('pages.listingDetail.rooms.closeRoomDetail')}
      size="lg"
      footer={
        <Inline gap="3" justify="flex-end" wrap className={styles.footer}>
          {hasStayInfo && unit.stay_total_amount != null ? (
            <Stack gap="1">
              <PriceInCurrency
                amount={unit.stay_total_amount}
                currency={unit.stay_total_currency}
                locale={locale}
                suffix={t('pages.listingDetail.rooms.stayTotalSuffix', {
                  count: unit.night_count_for_stay,
                })}
                size="md"
              />
              {stayStatus !== 'AVAILABLE' && (
                <Badge
                  variant={isStaySoldOut ? 'danger' : 'warning'}
                  size="sm"
                  label={
                    isStaySoldOut
                      ? t('pages.listingDetail.rooms.soldOutForDates')
                      : t('pages.listingDetail.rooms.fewRoomsLeftForStay', {
                          count: unit.remaining_count_for_stay,
                        })
                  }
                />
              )}
            </Stack>
          ) : (
            unit.base_price_amount != null && (
              <PriceInCurrency
                amount={unit.base_price_amount}
                currency={unit.base_price_currency}
                locale={locale}
                suffix={pricingModelLabel}
                size="md"
              />
            )
          )}
          <Button
            variant={isSelected ? 'ghost' : 'primary'}
            size="md"
            disabled={isSelected || isStaySoldOut}
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
          <div className={styles.noPhotos}>
            <DestinationArt seed={unit.id} className={styles.noPhotosArt} />
            <p className={styles.noPhotosCaption}>
              {t('pages.listingDetail.rooms.noRoomPhotos')}
            </p>
          </div>
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

        {bedLines.length > 0 && (
          <Stack gap="2">
            <h3 className={styles.amenitiesHeading}>
              {t('pages.listingDetail.rooms.sleepingHeading')}
            </h3>
            <ul className={styles.bedList}>
              {bedLines.map((line) => {
                const Icon = CHILD_SLEEPING_TYPES.has(line.type)
                  ? Baby
                  : BedDouble;
                return (
                  <li key={line.key} className={styles.keyFact}>
                    <Icon size={18} aria-hidden="true" />
                    {line.label}
                  </li>
                );
              })}
            </ul>
          </Stack>
        )}

        {mealLabel && (
          <Stack gap="2">
            <h3 className={styles.amenitiesHeading}>
              {t('pages.listingDetail.rooms.mealsHeading')}
            </h3>
            <p className={styles.meal}>
              <Utensils size={18} aria-hidden="true" />
              {mealLabel}
            </p>
          </Stack>
        )}

        {/* Step L6.3B: a room that can also be booked by the hour shows both
            options before the traveler starts booking. */}
        {isHourlyRoom(unit) && (
          <Stack gap="2">
            <h3 className={styles.amenitiesHeading}>
              {t('pages.listingDetail.rooms.hourlyHeading')}
            </h3>
            <p className={styles.description}>
              {t('pages.listingDetail.rooms.hourlyIntro')}
            </p>
            <ul className={styles.bedList}>
              <li className={styles.keyFact}>
                <PriceInCurrency
                  amount={unit.hourly_price_amount}
                  currency={unit.hourly_price_currency}
                  locale={locale}
                  suffix={t('pages.listingDetail.rooms.perHour')}
                  size="sm"
                />
              </li>
              <li className={styles.keyFact}>
                {t('pages.listingDetail.rooms.hourlyWindow', {
                  from: unit.hourly_available_from,
                  until: unit.hourly_available_until,
                })}
              </li>
              <li className={styles.keyFact}>
                {t('pages.listingDetail.rooms.hourlyDurationRange', {
                  minimum: unit.hourly_min_duration_hours,
                  maximum: unit.hourly_max_duration_hours,
                  count: unit.hourly_max_duration_hours,
                })}
              </li>
            </ul>
          </Stack>
        )}

        {(bathroomLabel || viewLabel || smokingLabel) && (
          <Stack gap="2">
            <h3 className={styles.amenitiesHeading}>
              {t('pages.listingDetail.rooms.roomDetailsHeading')}
            </h3>
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
          </Stack>
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

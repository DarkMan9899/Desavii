/**
 * ListingRoomsSection — Sprint C-2 (Public Rooms / Choose Your Room).
 * Renders a real room card per HOTEL_ROOM bookable unit (one card is a
 * legitimate, required state — never gated on "more than one room
 * type", see this component's own audit). Reuses the SAME
 * `useListingBookableUnitsQuery(listingId)` cache entry `ListingReservation
 * Widget` already populates — no second network fetch for the same
 * data, no parallel unit list.
 *
 * `selectedUnitId`/`onSelectUnit` are lifted from `ListingDetailPage
 * Content` (the one canonical selection also passed into
 * `ListingReservationWidget`) — picking "Select room" here IS picking a
 * unit in the reservation widget, never a second booking state.
 *
 * Sprint C-3 (Date-Range Room Availability): `dateRange` is the SAME
 * lifted check-in/check-out state `ListingReservationWidget`'s own date
 * picker writes to — once both are set, this re-fetches the identical
 * `useListingBookableUnitsQuery` cache entry with `?checkIn=&checkOut=`
 * instead of no date params at all, which additively augments every unit
 * with a real whole-stay `availability_status_for_stay`/
 * `remaining_count_for_stay`/`night_count_for_stay`/`stay_total_amount`
 * (`toPublicBookableUnitResponse`'s own additive fields — see
 * `availabilityDto.js`). Before a valid range exists, this fetches
 * exactly what it always did (no date params, no stay claims on any
 * card) — there is no separate "preview" request path to keep in sync.
 */

import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Section } from '@desavii/ui/components/layout';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';
import { resolvePricingModelLabel } from '../../../utils/reservationLabels.js';
import RoomCard from './RoomCard.jsx';
import RoomDetailModal from './RoomDetailModal.jsx';
import styles from './ListingRoomsSection.module.scss';

const HOTEL_ROOM_TYPE = 'HOTEL_ROOM';

export default function ListingRoomsSection({
  listingId,
  amenityGroups = [],
  pricing = null,
  locale = undefined,
  selectedUnitId = null,
  onSelectUnit,
  dateRange = null,
  sectionId = undefined,
}) {
  const { t } = useTranslation();
  const [openRoomId, setOpenRoomId] = useState(null);

  // Hooks must run unconditionally, before the early returns below — see
  // this file's own `react/jsx-no-bind` requirement: a plain function
  // declaration in the component body is a new value every render, so
  // each handler passed as a JSX prop is memoized here instead.
  const handleSelect = useCallback(
    (unitId) => onSelectUnit(unitId),
    [onSelectUnit],
  );
  const handleSelectFromDetail = useCallback(
    (unitId) => {
      onSelectUnit(unitId);
      setOpenRoomId(null);
    },
    [onSelectUnit],
  );
  const handleCloseDetail = useCallback(() => setOpenRoomId(null), []);

  const hasValidStayRange = Boolean(dateRange?.start && dateRange?.end);
  const { data: units, isPending } = useListingBookableUnitsQuery(
    listingId,
    hasValidStayRange
      ? { checkIn: dateRange.start, checkOut: dateRange.end }
      : {},
  );
  const roomUnits = (units ?? []).filter(
    (unit) => unit.bookable_unit_type === HOTEL_ROOM_TYPE,
  );

  if (isPending) {
    return (
      <Section
        spacing="none"
        aria-label={t('pages.listingDetail.rooms.heading')}
      >
        <Skeleton variant="rect" height={280} />
      </Section>
    );
  }

  if (roomUnits.length === 0) return null;

  const pricingModelLabel = resolvePricingModelLabel(t, pricing);
  const openRoom = roomUnits.find((unit) => unit.id === openRoomId) ?? null;

  return (
    <Section spacing="none" aria-label={t('pages.listingDetail.rooms.heading')}>
      <h2 id={sectionId}>{t('pages.listingDetail.rooms.heading')}</h2>
      <p className={styles.subheading}>
        {t('pages.listingDetail.rooms.subheading')}
      </p>

      {!hasValidStayRange && (
        <p className={styles.datesHint}>
          {t('pages.listingDetail.rooms.selectDatesHint')}
        </p>
      )}

      <div className={styles.grid}>
        {roomUnits.map((unit, index) => (
          <RoomCard
            key={unit.id}
            unit={unit}
            amenityGroups={amenityGroups}
            pricingModelLabel={pricingModelLabel}
            locale={locale}
            isSelected={unit.id === selectedUnitId}
            onSelect={handleSelect}
            onViewDetail={setOpenRoomId}
            priorityImage={index === 0}
          />
        ))}
      </div>

      {openRoom && (
        <RoomDetailModal
          unit={openRoom}
          amenityGroups={amenityGroups}
          pricingModelLabel={pricingModelLabel}
          locale={locale}
          isSelected={openRoom.id === selectedUnitId}
          isOpen={Boolean(openRoom)}
          onClose={handleCloseDetail}
          onSelect={handleSelectFromDetail}
        />
      )}
    </Section>
  );
}

ListingRoomsSection.propTypes = {
  listingId: PropTypes.number.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- real GET /listings/metadata amenity_groups shape
  amenityGroups: PropTypes.array,
  pricing: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    currency: PropTypes.string,
    pricing_model: PropTypes.string,
  }),
  locale: PropTypes.string,
  selectedUnitId: PropTypes.number,
  onSelectUnit: PropTypes.func.isRequired,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }),
  sectionId: PropTypes.string,
};

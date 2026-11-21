/**
 * VehicleRentalFields — a car rental's pickup and return legs
 * (docs/BOOKING_WIDGET_REBUILD.md §4, W-01/W-02). Each leg names its
 * place and asks for its time; there is no guest, room or night field
 * anywhere in a rental. Pickup and return are the listing's one registered
 * location (`listing_locations` is one row per listing), shown as text —
 * there is nothing to choose.
 *
 * Leg titles are sentence case: an uppercased Armenian or Russian word
 * reads as shouting and loses its diacritic shape.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Input } from '@desavii/ui/components/form-controls';
import { Stack } from '@desavii/ui/components/layout';
import styles from './ListingReservationWidget.module.scss';

function RentalLeg({
  title,
  locationLabel = null,
  timeLabel,
  time,
  disabled,
  onChangeTime,
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="1" className={styles.rentalLeg}>
      <p className={styles.rentalLegLabel}>{title}</p>
      <p className={styles.rentalLocation}>
        {locationLabel ??
          t('pages.listingDetail.reservation.locationUnavailable')}
      </p>
      <Input
        type="time"
        label={timeLabel}
        value={time}
        disabled={disabled}
        onChange={(event) => onChangeTime(event.target.value)}
      />
    </Stack>
  );
}

RentalLeg.propTypes = {
  title: PropTypes.string.isRequired,
  locationLabel: PropTypes.string,
  timeLabel: PropTypes.string.isRequired,
  time: PropTypes.string.isRequired,
  disabled: PropTypes.bool.isRequired,
  onChangeTime: PropTypes.func.isRequired,
};

export default function VehicleRentalFields({
  locationLabel = null,
  dateRange,
  pickupTime,
  returnTime,
  onChangePickupTime,
  onChangeReturnTime,
  intervalIssue = null,
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="3">
      <RentalLeg
        title={t('pages.listingDetail.reservation.pickupLabel')}
        locationLabel={locationLabel}
        timeLabel={t('pages.listingDetail.reservation.pickupTimeLabel')}
        time={pickupTime}
        disabled={!dateRange.start}
        onChangeTime={onChangePickupTime}
      />
      <RentalLeg
        title={t('pages.listingDetail.reservation.returnLabel')}
        locationLabel={locationLabel}
        timeLabel={t('pages.listingDetail.reservation.returnTimeLabel')}
        time={returnTime}
        disabled={!dateRange.end}
        onChangeTime={onChangeReturnTime}
      />
      {intervalIssue === 'RETURN_NOT_AFTER_PICKUP' && (
        <p role="alert" className={styles.rentalIntervalError}>
          {t('pages.listingDetail.reservation.invalidRentalInterval')}
        </p>
      )}
    </Stack>
  );
}

VehicleRentalFields.propTypes = {
  locationLabel: PropTypes.string,
  dateRange: PropTypes.shape({
    start: PropTypes.string,
    end: PropTypes.string,
  }).isRequired,
  pickupTime: PropTypes.string.isRequired,
  returnTime: PropTypes.string.isRequired,
  onChangePickupTime: PropTypes.func.isRequired,
  onChangeReturnTime: PropTypes.func.isRequired,
  intervalIssue: PropTypes.string,
};

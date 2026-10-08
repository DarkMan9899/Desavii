/**
 * Step L6.3B — "Stay overnight" / "Book by hour", shown only for a room the
 * Partner opened to hourly stays. A native radio group (arrow keys move
 * between the two options; the choice reads from the checked state, never
 * colour alone). Overnight is the default.
 */

import { useId } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Radio } from '@desavii/ui/components/form-controls';
import { BOOKING_MODES } from '../../../utils/hourlyStay.js';
import styles from './ListingReservationWidget.module.scss';

export default function StayModeSelector({ value, onChange }) {
  const { t } = useTranslation();
  const name = useId();
  return (
    <fieldset className={styles.modeSelector}>
      <legend className={styles.modeLegend}>
        {t('pages.listingDetail.reservation.stayModeLabel')}
      </legend>
      <Radio
        name={name}
        value={BOOKING_MODES.NIGHTLY}
        label={t('pages.listingDetail.reservation.stayOvernight')}
        checked={value === BOOKING_MODES.NIGHTLY}
        onChange={() => onChange(BOOKING_MODES.NIGHTLY)}
      />
      <Radio
        name={name}
        value={BOOKING_MODES.HOURLY}
        label={t('pages.listingDetail.reservation.bookByHour')}
        checked={value === BOOKING_MODES.HOURLY}
        onChange={() => onChange(BOOKING_MODES.HOURLY)}
      />
    </fieldset>
  );
}

StayModeSelector.propTypes = {
  value: PropTypes.oneOf(Object.values(BOOKING_MODES)).isRequired,
  onChange: PropTypes.func.isRequired,
};

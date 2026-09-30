/**
 * BookingTotal — Step L6.2H2B. A booking's total as every booking surface
 * shows it (My Trips card, customer/Partner/admin detail): a new, free
 * restaurant reservation reads "Free reservation — pay at the restaurant"
 * instead of a misleading "0 AMD"; every other booking — including a
 * historical restaurant booking with a stored nonzero total — keeps its
 * real amount.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PriceTag } from '@desavii/ui/components/data-display';
import { isFreeReservation } from '../../utils/restaurantReservation.js';
import styles from './BookingTotal.module.scss';

export default function BookingTotal({
  booking,
  amount,
  currencyCode,
  suffix,
  locale = undefined,
  size = undefined,
}) {
  const { t } = useTranslation();

  if (isFreeReservation(booking)) {
    return (
      <span className={styles.free}>{t('bookings.freeReservation.label')}</span>
    );
  }

  return (
    <PriceTag
      amount={amount}
      currencyCode={currencyCode}
      locale={locale}
      suffix={suffix}
      size={size}
    />
  );
}

BookingTotal.propTypes = {
  booking: PropTypes.shape({
    booking_type: PropTypes.string,
    total_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  currencyCode: PropTypes.string.isRequired,
  suffix: PropTypes.string.isRequired,
  locale: PropTypes.string,
  size: PropTypes.string,
};

/**
 * ReservationSummary — what the guest is about to request, just above the
 * action (docs/BOOKING_WIDGET_REBUILD.md §4, W-07/W-13): the stay or
 * rental length, the count of rooms, cars or people, the estimated total
 * (or the free-reservation line for a table), and what happens next —
 * nothing is charged now; the partner confirms the request.
 *
 * Amounts here are an estimate for orientation only. The hold returns the
 * server's own quote, and checkout prices from that quote, never from this.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import PriceInCurrency from '../../../../../components/Money/PriceInCurrency.jsx';
import styles from './ReservationSummary.module.scss';

export default function ReservationSummary({
  rows,
  estimatedTotal = null,
  isFreeReservation = false,
  locale,
}) {
  const { t } = useTranslation();
  const hasContent = rows.length > 0 || estimatedTotal || isFreeReservation;
  if (!hasContent) return null;

  return (
    <div className={styles.summary}>
      {rows.length > 0 && (
        <dl className={styles.rows}>
          {rows.map((row) => (
            <div key={row.key} className={styles.row}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {estimatedTotal && (
        <div className={styles.total}>
          <span className={styles.totalLabel}>
            {t('pages.listingDetail.reservation.summary.estimatedTotal')}
          </span>
          <PriceInCurrency
            amount={estimatedTotal.amount}
            currency={estimatedTotal.currency}
            locale={locale}
            size="md"
          />
        </div>
      )}
      {isFreeReservation && (
        <p className={styles.free}>{t('bookings.freeReservation.label')}</p>
      )}
    </div>
  );
}

ReservationSummary.propTypes = {
  rows: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
        .isRequired,
    }),
  ).isRequired,
  estimatedTotal: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    currency: PropTypes.string,
  }),
  isFreeReservation: PropTypes.bool,
  locale: PropTypes.string.isRequired,
};

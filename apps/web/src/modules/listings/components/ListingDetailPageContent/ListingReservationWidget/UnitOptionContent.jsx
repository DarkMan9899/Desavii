/**
 * One room/unit row in the reservation widget's unit Select: the name on
 * its own line, then short, separate facts — how many guests it sleeps,
 * its price on the basis being booked (per night, or per hour in hourly
 * mode) in the canonical money display, and its availability for the
 * chosen stay when the server has given one. Availability is never
 * derived from the unit's inventory size (`capacity`): no truthful
 * date-aware figure, no availability line.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import PriceInCurrency from '../../../../../components/Money/PriceInCurrency.jsx';
import styles from './UnitOptionContent.module.scss';

export default function UnitOptionContent({
  name,
  maxGuests = null,
  price = null,
  availability = null,
  locale,
}) {
  const { t } = useTranslation();
  return (
    <span className={styles.option}>
      <span className={styles.name}>{name}</span>
      <span className={styles.facts}>
        {maxGuests !== null && (
          <span>
            {t('partner.listingWizard.availability.maxGuestsSummary', {
              count: maxGuests,
            })}
          </span>
        )}
        {price && (
          <PriceInCurrency
            amount={price.amount}
            currency={price.currency}
            locale={locale}
            suffix={price.suffix}
            size="sm"
          />
        )}
        {availability && (
          <span
            className={availability.soldOut ? styles.soldOut : styles.fewLeft}
          >
            {availability.soldOut
              ? t('pages.listingDetail.rooms.soldOutForDates')
              : t('pages.listingDetail.rooms.fewRoomsLeftForStay', {
                  count: availability.remaining,
                })}
          </span>
        )}
      </span>
    </span>
  );
}

UnitOptionContent.propTypes = {
  name: PropTypes.string.isRequired,
  maxGuests: PropTypes.number,
  price: PropTypes.shape({
    amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
      .isRequired,
    currency: PropTypes.string.isRequired,
    suffix: PropTypes.string,
  }),
  availability: PropTypes.shape({
    soldOut: PropTypes.bool.isRequired,
    remaining: PropTypes.number,
  }),
  locale: PropTypes.string.isRequired,
};

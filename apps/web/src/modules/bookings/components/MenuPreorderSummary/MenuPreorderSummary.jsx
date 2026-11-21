/**
 * MenuPreorderSummary — a restaurant reservation's dish pre-order, as the
 * guest, the partner and an admin read it (docs/BOOKING_WIDGET_REBUILD.md
 * §5): each dish with its quantity and line total, the subtotal, and the
 * one payment rule — paid at the restaurant, never charged on Desavii.
 *
 * Before booking (`priceMode="live"`) amounts follow the visitor's display
 * currency like every other pre-booking price; on a booking
 * (`priceMode="snapshot"`) they are the stored snapshot, in the currency it
 * was recorded in, so a later menu edit never rewrites what was ordered.
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { PriceTag } from '@desavii/ui/components/data-display';
import PriceInCurrency from '../../../../components/Money/PriceInCurrency.jsx';
import styles from './MenuPreorderSummary.module.scss';

function Amount({ amount, currency, locale, priceMode, size }) {
  if (priceMode === 'snapshot') {
    return (
      <PriceTag
        amount={amount}
        currencyCode={currency}
        locale={locale}
        size={size}
      />
    );
  }
  return (
    <PriceInCurrency
      amount={amount}
      currency={currency}
      locale={locale}
      size={size}
    />
  );
}

Amount.propTypes = {
  amount: PropTypes.string.isRequired,
  currency: PropTypes.string.isRequired,
  locale: PropTypes.string.isRequired,
  priceMode: PropTypes.oneOf(['live', 'snapshot']).isRequired,
  size: PropTypes.oneOf(['sm', 'md']).isRequired,
};

export default function MenuPreorderSummary({
  lines,
  subtotalAmount,
  currency,
  locale,
  priceMode = 'live',
  heading = undefined,
  headingLevel = 3,
}) {
  const { t } = useTranslation();
  const Heading = `h${headingLevel}`;
  return (
    <div className={styles.summary}>
      <Heading className={styles.heading}>
        {heading ?? t('bookings.menuPreorder.heading')}
      </Heading>
      <ul className={styles.lines}>
        {lines.map((line) => (
          <li key={line.key} className={styles.line}>
            <span className={styles.lineTitle}>
              <span className={styles.quantity}>
                {t('bookings.menuPreorder.quantity', {
                  count: line.quantity,
                })}
              </span>{' '}
              {line.title}
            </span>
            <span className={styles.lineAmount}>
              <Amount
                amount={line.lineTotalAmount}
                currency={currency}
                locale={locale}
                priceMode={priceMode}
                size="sm"
              />
            </span>
          </li>
        ))}
      </ul>
      <div className={styles.subtotal}>
        <span>{t('bookings.menuPreorder.subtotal')}</span>
        <Amount
          amount={subtotalAmount}
          currency={currency}
          locale={locale}
          priceMode={priceMode}
          size="md"
        />
      </div>
      <p className={styles.payNote}>{t('bookings.menuPreorder.payAtVenue')}</p>
    </div>
  );
}

MenuPreorderSummary.propTypes = {
  lines: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string.isRequired,
      quantity: PropTypes.number.isRequired,
      lineTotalAmount: PropTypes.string.isRequired,
    }),
  ).isRequired,
  subtotalAmount: PropTypes.string.isRequired,
  currency: PropTypes.string.isRequired,
  locale: PropTypes.string.isRequired,
  priceMode: PropTypes.oneOf(['live', 'snapshot']),
  heading: PropTypes.string,
  headingLevel: PropTypes.oneOf([2, 3, 4]),
};

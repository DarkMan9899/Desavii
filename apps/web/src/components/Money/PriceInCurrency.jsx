/**
 * PriceInCurrency — Step L6.2H4. A not-yet-booked price that carries its own
 * currency: a server quote at checkout, or the reservation widget's
 * estimate.
 *
 * An AMD price renders through `<Money>`, like every other pre-booking price
 * (live display-currency conversion; a booking then snapshots the server's
 * own rate). A price in any other currency — a Partner's USD/EUR/RUB unit or
 * calendar price — has no display conversion and renders in its own
 * currency, never relabelled as AMD.
 */

import PropTypes from 'prop-types';
import { PriceTag } from '@desavii/ui/components/data-display';
import Money from './Money.jsx';
import { CURRENCY_DISPLAY_DECIMALS } from '../../utils/formatMoney.js';

const CONVERTIBLE_CURRENCY = 'AMD';
const DEFAULT_DECIMALS = 2;

export default function PriceInCurrency({
  amount,
  currency,
  locale,
  size = 'md',
  suffix = undefined,
}) {
  if (currency === CONVERTIBLE_CURRENCY) {
    return (
      <Money amountAmd={amount} locale={locale} size={size} suffix={suffix} />
    );
  }
  const decimals = CURRENCY_DISPLAY_DECIMALS[currency] ?? DEFAULT_DECIMALS;
  return (
    <PriceTag
      amount={amount}
      currencyCode={currency}
      locale={locale}
      size={size}
      suffix={suffix}
      minimumFractionDigits={decimals}
      maximumFractionDigits={decimals}
    />
  );
}

PriceInCurrency.propTypes = {
  amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  currency: PropTypes.string.isRequired,
  locale: PropTypes.string.isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  suffix: PropTypes.node,
};

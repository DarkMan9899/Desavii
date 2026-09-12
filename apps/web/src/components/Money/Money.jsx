/**
 * Money — the shared "already-resolved-to-display-currency" price
 * component (Pass 8, brief §14). Wraps `PriceTag` (the pure display
 * primitive) with the one piece of business logic every public price
 * surface needs: read the customer's effective currency + the current FX
 * rates from `CurrencyContext`, convert, format. Every card/detail/widget
 * this pass rewires renders through this component instead of handing
 * PriceTag a raw AMD amount directly.
 *
 * DISPLAY ONLY — never for an already-created booking's stored total
 * (that has its own immutable `display_currency`/`display_total_amount`
 * snapshot; see `resolveBookingDisplayAmount.js`, which renders those
 * directly through `PriceTag`, deliberately bypassing this component so
 * a later rate change can never make an old booking's shown total drift).
 */

import PropTypes from 'prop-types';
import { PriceTag } from '@desavii/ui/components/data-display';
import { useCurrency } from '../../contexts/CurrencyContext.jsx';
import {
  convertAmdToDisplay,
  CURRENCY_DISPLAY_DECIMALS,
} from '../../utils/formatMoney.js';

export default function Money({
  amountAmd,
  locale = 'en',
  size = 'md',
  suffix = undefined,
  onDark = false,
}) {
  const { currency, rates } = useCurrency();
  const displayAmount = convertAmdToDisplay(amountAmd, currency, rates);
  // Brief §12/§20 — never fabricate: no rate yet available (still
  // loading, or the backend genuinely has none) falls back to AMD, the
  // one currency that never needs a rate, rather than a blank/wrong price.
  const resolvedCurrency = displayAmount === null ? 'AMD' : currency;
  const resolvedAmount = displayAmount === null ? amountAmd : displayAmount;
  const decimals = CURRENCY_DISPLAY_DECIMALS[resolvedCurrency];

  return (
    <PriceTag
      amount={resolvedAmount}
      currencyCode={resolvedCurrency}
      locale={locale}
      size={size}
      suffix={suffix}
      onDark={onDark}
      minimumFractionDigits={decimals}
      maximumFractionDigits={decimals}
    />
  );
}

Money.propTypes = {
  amountAmd: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    .isRequired,
  locale: PropTypes.string,
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  suffix: PropTypes.node,
  onDark: PropTypes.bool,
};

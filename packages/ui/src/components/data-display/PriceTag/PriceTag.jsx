/**
 * PriceTag — data-display's read-only price primitive (no business
 * logic: formatting only, per this folder's README "read-only display
 * primitives with no business logic" contract). Used both for a single
 * money amount (listing cards, payments) and paired with a free-form
 * `suffix` node (a pricing-model label, "per night", "estimated total",
 * …) supplied by the caller, since the wording differs per context and
 * this component has no opinion on it.
 */

import PropTypes from 'prop-types';
import styles from './PriceTag.module.scss';

const SIZES = ['sm', 'md', 'lg'];

export default function PriceTag({
  amount,
  currencyCode,
  locale = 'en',
  size = 'md',
  suffix = undefined,
  onDark = false,
  minimumFractionDigits = undefined,
  maximumFractionDigits = undefined,
}) {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    currencyDisplay: 'narrowSymbol',
    ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
    ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
  }).format(Number(amount));

  return (
    <span
      className={[
        styles.priceTag,
        styles[`priceTag--${size}`],
        onDark && styles['priceTag--onDark'],
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.amount}>{formatted}</span>
      {suffix && <span className={styles.suffix}>{suffix}</span>}
    </span>
  );
}

PriceTag.propTypes = {
  amount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  currencyCode: PropTypes.string.isRequired,
  locale: PropTypes.string,
  size: PropTypes.oneOf(SIZES),
  suffix: PropTypes.node,
  // Opt-in only (2026 Customer Account redesign's `NextTripPanel`, a
  // dark photo-backdrop hero) — every existing caller keeps its default
  // light-surface coloring untouched.
  onDark: PropTypes.bool,
  // Pass 8 (Multi-Currency / CBA FX Pricing) — opt-in fraction-digit
  // override (the `<Money>` component's own deterministic rounding
  // policy, `formatMoney.js`'s `CURRENCY_DISPLAY_DECIMALS`). Omitted by
  // every pre-existing caller, which keeps Intl's own per-currency
  // default digit count exactly as before this pass.
  minimumFractionDigits: PropTypes.number,
  maximumFractionDigits: PropTypes.number,
};

export { SIZES as PRICE_TAG_SIZES };

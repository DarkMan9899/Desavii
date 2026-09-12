/**
 * formatMoney — the ONE shared price-formatting function for every
 * customer-facing price surface (Pass 8, brief §14/§15). Every prior
 * ad-hoc formatter this pass audits and replaces converges here.
 *
 * Conversion is DISPLAY ONLY (brief §7's own `Money` conversion boundary
 * note) — never used for a transactional total. A booking's real
 * `display_total_amount` is computed server-side, decimal-safely, via
 * `fxConversion.js#convertAmdToDisplayCurrency`; this function's ordinary
 * JS-number division is fine for what it does (an on-screen estimate),
 * exactly the same tolerance `PriceTag.jsx` (this function's own render
 * target) already had before this pass.
 *
 * Rounding policy (brief §16, one deterministic rule — never per-page
 * drift): AMD displays as a whole dram (no fractional luma shown — the
 * DB still stores/computes AMD at 2 decimal places; this is a display-only
 * convention), USD/RUB display at 2 decimals. The same rule applies
 * everywhere this function is called — card, detail, checkout, booking
 * confirmation — so the same AMD amount converted under the same rate
 * snapshot never disagrees between surfaces.
 */

export const CURRENCY_DISPLAY_DECIMALS = { AMD: 0, USD: 2, RUB: 2 };

/**
 * @param {string|number} amountAmd - the canonical AMD amount.
 * @param {'AMD'|'USD'|'RUB'} currency - the target display currency.
 * @param {Record<string,string>|null|undefined} rates - `{AMD,USD,RUB}` AMD-per-unit strings from `GET /fx/rates`.
 * @returns {number|null} the converted amount, or `null` when `currency` needs a rate that isn't available.
 */
export function convertAmdToDisplay(amountAmd, currency, rates) {
  const amount = Number(amountAmd);
  if (currency === 'AMD') return amount;
  const amdPerUnit = Number(rates?.[currency]);
  if (!amdPerUnit || amdPerUnit <= 0) return null;
  return amount / amdPerUnit;
}

/**
 * @param {{amountAmd: string|number, currency: 'AMD'|'USD'|'RUB', locale: string, rates?: Record<string,string>|null}} params
 * @returns {string} an `Intl.NumberFormat`-rendered price string, never a manually-concatenated symbol.
 */
export function formatMoney({ amountAmd, currency, locale, rates }) {
  const displayAmount = convertAmdToDisplay(amountAmd, currency, rates);
  // Brief §12/§20 — never fabricate a rate. No rate available for the
  // requested currency falls back to AMD, the one currency that never
  // needs one, rather than showing a blank/broken price.
  const resolvedCurrency = displayAmount === null ? 'AMD' : currency;
  const resolvedAmount =
    displayAmount === null ? Number(amountAmd) : displayAmount;
  const decimals = CURRENCY_DISPLAY_DECIMALS[resolvedCurrency] ?? 2;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: resolvedCurrency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(resolvedAmount);
}

export default { CURRENCY_DISPLAY_DECIMALS, convertAmdToDisplay, formatMoney };

/**
 * Step L6.2H4 — the one per-range price calculation. Booking conversion
 * (`BookingService#resolveItem`), the server-issued hold quote
 * (`AvailabilityService#reserveCapacity`) and the public stay total
 * (`AvailabilityService#getPublicUnits`) all sum a unit's charged dates
 * through this function, so a quote can never be computed by a formula the
 * charge does not use.
 *
 * Per date: calendar override -> unit base price -> listing base price
 * (`resolvePriceForDate`). The dates are the CHARGED dates — the caller
 * passes `resolveConsumedRange`'s range (checkout-exclusive nights for
 * lodging, inclusive days for every other unit type), so the per-category
 * formulas stay where they already live. Arithmetic is integer minor units
 * (`Money`); one item never mixes currencies.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { Money } from './money.js';
import { resolvePriceForDate } from './accommodationPriceResolution.js';

export const UNIT_RANGE_PRICE_ISSUES = Object.freeze({
  INCOMPLETE: 'PRICING_INCOMPLETE',
  CURRENCY_MISMATCH: 'PRICING_CURRENCY_MISMATCH',
});

/**
 * @param {object} input
 * @param {string[]} input.dates - the charged dates (`YYYY-MM-DD`).
 * @param {Map<string, {amount: string|number|null, currencyCode: string|null}>} input.overrideByDate
 * @param {{amount?: string|number|null, currencyCode?: string|null}} [input.unitBase]
 * @param {{amount?: string|number|null, currencyCode?: string|null}} [input.listingBase]
 * @returns {{unitPrice: Money, issue: null} | {unitPrice: null, issue: string}}
 *   the price of ONE unit of capacity across every charged date, or the
 *   reason no single price exists.
 */
export function sumUnitRangePrice({
  dates,
  overrideByDate,
  unitBase = {},
  listingBase = {},
}) {
  const resolvedPrices = dates.map((date) => {
    const override = overrideByDate.get(date);
    return resolvePriceForDate({
      overrideAmount: override?.amount,
      overrideCurrencyCode: override?.currencyCode,
      unitBaseAmount: unitBase.amount,
      unitBaseCurrencyCode: unitBase.currencyCode,
      listingBaseAmount: listingBase.amount,
      listingBaseCurrencyCode: listingBase.currencyCode,
    });
  });
  if (resolvedPrices.length === 0 || resolvedPrices.includes(null)) {
    return { unitPrice: null, issue: UNIT_RANGE_PRICE_ISSUES.INCOMPLETE };
  }

  const { currencyCode } = resolvedPrices[0];
  if (resolvedPrices.some((price) => price.currencyCode !== currencyCode)) {
    return {
      unitPrice: null,
      issue: UNIT_RANGE_PRICE_ISSUES.CURRENCY_MISMATCH,
    };
  }

  const unitPrice = resolvedPrices.reduce(
    (sum, price) =>
      sum.add(Money.fromDecimalString(String(price.amount), currencyCode)),
    Money.zero(currencyCode),
  );
  return { unitPrice, issue: null };
}

export default { UNIT_RANGE_PRICE_ISSUES, sumUnitRangePrice };

/**
 * Step L6.2H4 — the booking quote contract.
 *
 * A hold returns a server quote per item (`AvailabilityService#reserveCapacity`).
 * The customer accepts it at checkout and `POST /bookings` sends it back as
 * `expectedTotalAmount` + `expectedCurrency` per item. Booking conversion
 * recomputes every item's canonical price and continues only if each one
 * equals the accepted quote exactly — amount AND currency, in integer minor
 * units. Any difference, cheaper or dearer, is a `PRICE_CHANGED` re-quote:
 * the customer is never silently charged a price they did not accept.
 *
 * The expected values are comparison input only — never the charge. A
 * tampered value can only cause a re-quote, never a different charge.
 *
 * A quote is NOT a price lock: a Partner may still change prices during a
 * hold; the customer then sees and accepts the new price.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { Money } from './money.js';

/**
 * A canonical 2-decimal amount within `DECIMAL(12,2)`: no sign, no exponent,
 * no leading zeros, exactly two decimals — the exact form
 * `Money#toDecimalString` emits for every quote.
 */
export const EXPECTED_AMOUNT_PATTERN = /^(0|[1-9]\d{0,9})\.\d{2}$/;

/** A quote's item total: the per-unit range price × held quantity. */
export function quoteItemTotal(unitPrice, quantity) {
  return unitPrice.multiply(quantity);
}

/**
 * @param {{expectedTotalAmount: string, expectedCurrency: string}} expected
 *   the accepted quote (already structurally validated).
 * @param {Money} currentTotal - the canonical item total computed now.
 * @returns {boolean} whether the accepted quote is exactly the current one.
 */
export function isAcceptedQuoteCurrent(
  { expectedTotalAmount, expectedCurrency },
  currentTotal,
) {
  return Money.fromDecimalString(expectedTotalAmount, expectedCurrency).equals(
    currentTotal,
  );
}

export default {
  EXPECTED_AMOUNT_PATTERN,
  quoteItemTotal,
  isAcceptedQuoteCurrent,
};

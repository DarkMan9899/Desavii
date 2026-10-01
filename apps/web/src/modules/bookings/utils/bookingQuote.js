/**
 * Step L6.2H4 — the checkout's quote contract with the server.
 *
 * `POST /booking-holds` returns a server quote per held item
 * (`{ unit_price_amount, total_amount, currency }`, decimal strings). Checkout
 * shows it and `POST /bookings` sends it back as the accepted quote. If the
 * price changed since, the server answers 409 `PRICE_CHANGED` with each
 * item's current quote in `error.details` (`field: 'items.<index>'`); the
 * customer must accept it explicitly before booking again. The quote is
 * comparison input only — the server always charges its own price.
 */

export const PRICE_CHANGED_ERROR_CODE = 'PRICE_CHANGED';

/** The booking-item fields that accept `quote` (the server's exact strings). */
export function toAcceptedQuoteFields(quote) {
  return {
    expectedTotalAmount: quote.total_amount,
    expectedCurrency: quote.currency,
  };
}

/**
 * @returns {{unit_price_amount: string, total_amount: string, currency: string}|null}
 *   request item `index`'s current quote from a `PRICE_CHANGED` error, or
 *   `null` for any other error or a malformed detail.
 */
export function readCurrentQuote(error, index = 0) {
  if (error?.code !== PRICE_CHANGED_ERROR_CODE) return null;
  const details = Array.isArray(error.details) ? error.details : [];
  const detail = details.find((entry) => entry?.field === `items.${index}`);
  if (
    typeof detail?.total_amount !== 'string' ||
    typeof detail?.currency !== 'string'
  ) {
    return null;
  }
  return {
    unit_price_amount: detail.unit_price_amount,
    total_amount: detail.total_amount,
    currency: detail.currency,
  };
}

/**
 * Step L6.2H4 — the shared "accept the hold's server quote" helper for
 * integration tests.
 *
 * `POST /bookings` requires every item's accepted quote
 * (`expectedTotalAmount` + `expectedCurrency`), which a real client takes
 * from the hold response's per-item `quote`. Tests do the same here:
 * `rememberHoldQuotes` records the quote of every hold id in a
 * `POST /booking-holds` response, and `quotedItem` builds a booking item that
 * echoes it. A test exercising a tampered/missing quote passes its own
 * `expectedTotalAmount`/`expectedCurrency` in `extras`, which win.
 *
 * Module state is per test file (Jest isolates module registries).
 */

const quoteByHoldId = new Map();

/**
 * For a hold whose unit has no complete price (`quote: null`): a client has
 * nothing to echo, so a test that books it anyway — to reach the server's
 * PRICING_INCOMPLETE / PRICING_CURRENCY_MISMATCH / HOLD_EXPIRED answer —
 * sends this well-formed placeholder quote.
 */
export const UNPRICED_HOLD_QUOTE = Object.freeze({
  expectedTotalAmount: '0.00',
  expectedCurrency: 'AMD',
});

/** Records the quote of each held item; returns the response unchanged. */
export function rememberHoldQuotes(holdResponse) {
  (holdResponse.body?.data?.items ?? []).forEach((item) => {
    item.hold_ids.forEach((holdId) => quoteByHoldId.set(holdId, item.quote));
  });
  return holdResponse;
}

/** The accepted-quote fields for a held item's server quote (none when the hold has no quote). */
export function acceptedQuoteFields(quote) {
  if (!quote) return {};
  return {
    expectedTotalAmount: quote.total_amount,
    expectedCurrency: quote.currency,
  };
}

/** A `POST /bookings` item for `holdIds`, accepting the quote their hold returned. */
export function quotedItem(holdIds, extras = {}) {
  return {
    holdIds,
    ...acceptedQuoteFields(quoteByHoldId.get(holdIds[0])),
    ...extras,
  };
}

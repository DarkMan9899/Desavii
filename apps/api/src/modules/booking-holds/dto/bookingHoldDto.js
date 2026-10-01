/**
 * Booking-Holds module response DTOs (BACKEND_ARCHITECTURE.md Ch.9).
 */

/**
 * Step L6.2H4 — the server quote for one held item, or `null` when the unit
 * has no complete single-currency price. Decimal strings, never numbers.
 */
function toItemQuoteResponse(quote) {
  if (!quote) return null;
  return {
    unit_price_amount: quote.unitPrice.toDecimalString(),
    total_amount: quote.total.toDecimalString(),
    currency: quote.total.currency,
  };
}

/**
 * The whole batch's total — only meaningful when every item has a quote in
 * one currency (a booking never mixes currencies); `null` otherwise.
 */
function toBatchQuoteTotalResponse(items) {
  const quotes = items.map((item) => item.quote);
  if (quotes.length === 0 || quotes.includes(null)) return null;
  const { currency } = quotes[0].total;
  if (quotes.some((quote) => quote.total.currency !== currency)) return null;
  const total = quotes
    .slice(1)
    .reduce((sum, quote) => sum.add(quote.total), quotes[0].total);
  return { amount: total.toDecimalString(), currency };
}

export function toHoldBatchResponse({ items, expiresAt }) {
  return {
    items: items.map((item) => ({
      bookable_unit_id: item.unitId,
      date_from: item.dateFrom,
      date_to: item.dateTo,
      // Sprint B (Car Rental Pickup/Return Interval) — the server-
      // validated, granted value, echoed back the same way `date_from`/
      // `date_to` already are; `null` for every non-VEHICLE hold.
      start_time: item.startTime ?? null,
      end_time: item.endTime ?? null,
      quantity: item.quantity,
      hold_ids: item.holdIds,
      quote: toItemQuoteResponse(item.quote),
    })),
    quote_total: toBatchQuoteTotalResponse(items),
    expires_at: expiresAt,
  };
}

export function toHoldResponse(hold) {
  return {
    id: hold.id,
    bookable_unit_id: hold.bookableUnitId,
    date_from: hold.dateFrom,
    date_to: hold.dateTo,
    expires_at: hold.expiresAt,
    created_at: hold.createdAt,
  };
}

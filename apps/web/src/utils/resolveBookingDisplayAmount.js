/**
 * resolveBookingDisplayAmount — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * A CREATED booking's price is never re-converted for display (brief
 * §26's immutability rule: a confirmed booking's total must never change
 * when CBA later publishes a new rate). `bookingDto.js`'s `toBookingResponse`
 * already carries either an immutable display-currency snapshot
 * (`display_currency`/`display_total_amount`, set only when the customer
 * picked a non-AMD currency at booking time) or nothing at all (AMD is
 * the only price on record). This just picks whichever is present —
 * deliberately bypassing `<Money>`/`CurrencyContext`'s LIVE-rate
 * conversion entirely, so a booking already shown in USD keeps showing
 * that exact USD amount forever, even if the customer's current currency
 * selector is set to RUB.
 *
 * @param {{currency: string, total_amount: string, display_currency?: string|null, display_total_amount?: string|null}} booking
 * @returns {{amount: string, currencyCode: string}}
 */
export function resolveBookingDisplayAmount(booking) {
  if (booking.display_currency && booking.display_total_amount != null) {
    return {
      amount: booking.display_total_amount,
      currencyCode: booking.display_currency,
    };
  }
  return { amount: booking.total_amount, currencyCode: booking.currency };
}

export default resolveBookingDisplayAmount;

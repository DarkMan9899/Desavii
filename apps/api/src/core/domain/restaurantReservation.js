/**
 * Step L6.2H2B — the restaurant reservation contract.
 *
 * - The reservation itself is free: a restaurant's PER_PERSON listing price
 *   is display metadata ("average spend per person"), and menu prices are
 *   separate — neither is ever charged. A restaurant booking item is priced
 *   at zero in AMD, the platform's base currency (FX display conversion
 *   only accepts an AMD amount — see `fxConversion.js`).
 * - One booking item is exactly one reservation: a RESTAURANT_TABLE unit's
 *   capacity counts concurrent reservations, never diners, so a hold
 *   always takes one slot whatever the party size.
 * - The party size (`booking_items.guest_count`) is required when booking.
 *   Its only upper bound is the SMALLINT UNSIGNED storage ceiling
 *   (`validation/sqlIntegerBounds.js`) — there is no product maximum.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { Money } from './money.js';

export const RESTAURANT_RESERVATION_QUANTITY = 1;

const RESERVATION_CHARGE_CURRENCY = 'AMD';

/** The per-item charge of a restaurant reservation: always zero. */
export function restaurantReservationCharge() {
  return Money.zero(RESERVATION_CHARGE_CURRENCY);
}

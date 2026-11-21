/**
 * Restaurant menu pre-order rules (docs/BOOKING_WIDGET_REBUILD.md §5).
 *
 * - A pre-order belongs to one restaurant reservation item and lists
 *   dishes from that restaurant's own active menus. The customer sends
 *   only `{ menuItemId, quantity }` pairs; every title and price comes
 *   from the restaurant's current menu, never from the request.
 * - It is paid at the restaurant. The menu subtotal is a snapshot the
 *   partner and the customer both read; it is never part of the booking's
 *   charged total, which stays the free reservation.
 * - The customer confirms the subtotal they saw (`expectedMenuSubtotal`).
 *   A price change in the meantime is refused, never silently applied.
 *
 * Domain layer (`core` may depend only on `core`) — no database access.
 */

import { Money } from './money.js';

/** Distinct dishes in one pre-order. */
export const MAX_PREORDER_LINES = 30;
/** Portions of one dish. A larger order is a conversation with the venue. */
export const MAX_PREORDER_QUANTITY = 20;

/** How a pre-order is paid. Only one rule exists today. */
export const PREORDER_PAYMENT = Object.freeze({ PAY_AT_VENUE: 'PAY_AT_VENUE' });

/**
 * Prices the requested lines against the restaurant's current menu.
 *
 * @param {Array<{menuItemId: number, quantity: number}>} selections
 * @param {Map<number, {id: number, title: string, sectionTitle: string|null, languageCode: string, priceAmount: string, currencyCode: string}>} activeItems
 *   the restaurant's own active dishes among the requested ids
 * @returns {{ unavailableIds: number[], mixedCurrency: boolean, lines: object[], subtotal: Money|null }}
 */
export function pricePreorder(selections, activeItems) {
  const unavailableIds = selections
    .map((selection) => selection.menuItemId)
    .filter((id) => !activeItems.has(id));
  if (unavailableIds.length > 0) {
    return { unavailableIds, mixedCurrency: false, lines: [], subtotal: null };
  }
  const currencies = new Set(
    selections.map(
      (selection) => activeItems.get(selection.menuItemId).currencyCode,
    ),
  );
  if (currencies.size > 1) {
    return {
      unavailableIds: [],
      mixedCurrency: true,
      lines: [],
      subtotal: null,
    };
  }
  const [currency] = currencies;
  const lines = selections.map((selection, index) => {
    const item = activeItems.get(selection.menuItemId);
    const unitPrice = Money.fromDecimalString(item.priceAmount, currency);
    return {
      menuItemId: item.id,
      title: item.title,
      sectionTitle: item.sectionTitle,
      languageCode: item.languageCode,
      quantity: selection.quantity,
      unitPrice,
      lineTotal: unitPrice.multiply(selection.quantity),
      sortOrder: index,
    };
  });
  const subtotal = lines.reduce(
    (sum, line) => sum.add(line.lineTotal),
    Money.zero(currency),
  );
  return { unavailableIds: [], mixedCurrency: false, lines, subtotal };
}

/** The customer's confirmed subtotal is exactly the current one. */
export function isAcceptedMenuSubtotalCurrent(expected, subtotal) {
  return (
    expected?.amount === subtotal.toDecimalString() &&
    expected?.currency === subtotal.currency
  );
}

export default {
  MAX_PREORDER_LINES,
  MAX_PREORDER_QUANTITY,
  PREORDER_PAYMENT,
  pricePreorder,
  isAcceptedMenuSubtotalCurrent,
};

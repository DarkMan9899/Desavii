/**
 * useCheckoutPreorder — the restaurant pre-order at checkout
 * (docs/BOOKING_WIDGET_REBUILD.md §5).
 *
 * The pre-order arrives with the hold hand-off (`holdState.menuPreorder`):
 * the dishes and the subtotal the guest saw. Booking sends only dish ids
 * and quantities plus that subtotal; the server re-prices every dish. Its
 * two refusals are handled here without ever losing the reservation:
 *
 * - MENU_ITEM_UNAVAILABLE (422): the named dishes are taken out of the
 *   pre-order (the guest is told which), the rest stays, the table stays
 *   held — the guest submits again.
 * - MENU_PRICE_CHANGED (409): the server's current lines replace nothing
 *   on their own; the guest sees them and accepts them explicitly, the
 *   same rule the booking price follows (`useCheckoutQuote`).
 *
 * The guest can also drop the pre-order and reserve the table alone.
 */

import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  sumDecimalAmounts,
  toMenuSelectionsPayload,
} from '../../listings/utils/menuPreorder.js';

export const MENU_PRICE_CHANGED_ERROR_CODE = 'MENU_PRICE_CHANGED';
const MENU_ITEM_UNAVAILABLE_ISSUE = 'MENU_ITEM_UNAVAILABLE';

/** The server's current pre-order from a MENU_PRICE_CHANGED refusal. */
export function readChangedPreorder(error) {
  if (error?.code !== MENU_PRICE_CHANGED_ERROR_CODE) return null;
  const details = error.details ?? {};
  if (
    !Array.isArray(details.lines) ||
    typeof details.subtotal_amount !== 'string'
  ) {
    return null;
  }
  return {
    lines: details.lines.map((line) => ({
      menuItemId: line.menu_item_id,
      title: line.title,
      quantity: line.quantity,
      unitPriceAmount: line.unit_price_amount,
      lineTotalAmount: line.line_total_amount,
    })),
    subtotalAmount: details.subtotal_amount,
    currency: details.currency,
  };
}

/** The dish ids a MENU_ITEM_UNAVAILABLE refusal names. */
export function readUnavailableDishIds(error) {
  const details = Array.isArray(error?.details) ? error.details : [];
  return details
    .filter((detail) => detail?.issue === MENU_ITEM_UNAVAILABLE_ISSUE)
    .map((detail) => detail.menuItemId)
    .filter(Number.isInteger);
}

export default function useCheckoutPreorder(holdState) {
  const location = useLocation();
  const navigate = useNavigate();
  const [preorder, setPreorderState] = useState(
    holdState?.menuPreorder ?? null,
  );
  // The history entry keeps the pre-order the guest now has, so a reload
  // or back/forward shows it, never the original hand-off.
  function setPreorder(next) {
    setPreorderState(next);
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: { ...holdState, menuPreorder: next },
    });
  }
  const [changedPreorder, setChangedPreorder] = useState(null);
  const [removedTitles, setRemovedTitles] = useState([]);

  /** @returns {boolean} whether `error` was a pre-order refusal now handled. */
  function handlePreorderError(error) {
    const changed = readChangedPreorder(error);
    if (changed) {
      setChangedPreorder(changed);
      return true;
    }
    const unavailableIds = readUnavailableDishIds(error);
    if (unavailableIds.length === 0 || !preorder) return false;
    const kept = preorder.lines.filter(
      (line) => !unavailableIds.includes(line.menuItemId),
    );
    setRemovedTitles(
      preorder.lines
        .filter((line) => unavailableIds.includes(line.menuItemId))
        .map((line) => line.title),
    );
    setPreorder(
      kept.length > 0
        ? {
            ...preorder,
            lines: kept,
            subtotalAmount: sumDecimalAmounts(
              kept.map((line) => line.lineTotalAmount),
            ),
          }
        : null,
    );
    return true;
  }

  function acceptChangedPreorder() {
    if (!changedPreorder) return;
    setPreorder(changedPreorder);
    setChangedPreorder(null);
  }

  function removePreorder() {
    setPreorder(null);
    setChangedPreorder(null);
  }

  return {
    preorder,
    changedPreorder,
    removedTitles,
    payloadFields: toMenuSelectionsPayload(preorder),
    handlePreorderError,
    acceptChangedPreorder,
    removePreorder,
  };
}

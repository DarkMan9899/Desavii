/**
 * menuPreorder — the guest's restaurant pre-order, as the panel shows it
 * (docs/BOOKING_WIDGET_REBUILD.md §5).
 *
 * Only what the partner currently offers can be chosen: active menus,
 * their active dishes, in the partner's own order. Amounts are summed in
 * minor units (integers), never floats, and the limits mirror the server's
 * (`MAX_PREORDER_LINES`, `MAX_PREORDER_QUANTITY` in the API's
 * `core/domain/restaurantPreorder.js`). The subtotal shown here is only what
 * the guest saw: the server re-prices every dish from the menu itself and
 * refuses the booking (MENU_PRICE_CHANGED) when it no longer matches.
 */

export const MAX_PREORDER_LINES = 30;
export const MAX_PREORDER_QUANTITY = 20;

const MINOR_UNITS = 100;

function toMinor(amount) {
  const [whole, fraction = ''] = String(amount).split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const cents = Number(`${fraction}00`.slice(0, 2));
  return sign * (Math.abs(Number(whole)) * MINOR_UNITS + cents);
}

function toDecimal(minor) {
  const whole = Math.trunc(minor / MINOR_UNITS);
  const cents = String(Math.abs(minor % MINOR_UNITS)).padStart(2, '0');
  return `${whole}.${cents}`;
}

/**
 * The sections a guest can order from: the active menus' sections, each
 * with its active dishes only; empty sections are dropped.
 */
export function resolveOrderableSections(menus = []) {
  return (menus ?? [])
    .filter((menu) => menu.is_active)
    .flatMap((menu) => menu.sections ?? [])
    .map((section) => ({
      id: section.id,
      title: section.title,
      items: (section.items ?? []).filter((item) => item.is_active),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * The chosen dishes as priced lines and their subtotal.
 *
 * @param {Array} sections `resolveOrderableSections` output
 * @param {Record<number, number>} quantities dish id → quantity
 * @returns {{ lines: Array, subtotalAmount: string|null, currency: string|null }}
 */
export function buildPreorderLines(sections, quantities) {
  const lines = [];
  sections.forEach((section) => {
    section.items.forEach((item) => {
      const quantity = quantities[item.id] ?? 0;
      if (quantity <= 0) return;
      const unitMinor = toMinor(item.price_amount);
      lines.push({
        menuItemId: item.id,
        title: item.title,
        sectionTitle: section.title,
        quantity,
        unitPriceAmount: toDecimal(unitMinor),
        lineTotalAmount: toDecimal(unitMinor * quantity),
        currency: item.price_currency_code ?? null,
        minor: unitMinor * quantity,
      });
    });
  });
  const priced = lines.map(({ minor, ...line }) => line);
  const currency = lines[0]?.currency ?? null;
  // One subtotal needs one currency — the server refuses a mix too.
  if (lines.length === 0 || lines.some((line) => line.currency !== currency)) {
    return { lines: priced, subtotalAmount: null, currency: null };
  }
  const subtotalMinor = lines.reduce((sum, line) => sum + line.minor, 0);
  return { lines: priced, subtotalAmount: toDecimal(subtotalMinor), currency };
}

/** A dish's quantity after a change, kept within 0..MAX and the line cap. */
export function clampPreorderQuantity(quantities, menuItemId, nextQuantity) {
  const wanted = Math.max(
    0,
    Math.min(MAX_PREORDER_QUANTITY, Math.trunc(Number(nextQuantity) || 0)),
  );
  const isNewLine = !(quantities[menuItemId] > 0) && wanted > 0;
  const lineCount = Object.values(quantities).filter((q) => q > 0).length;
  if (isNewLine && lineCount >= MAX_PREORDER_LINES) {
    return quantities[menuItemId] ?? 0;
  }
  return wanted;
}

/** The exact sum of two-decimal amounts, as a two-decimal string. */
export function sumDecimalAmounts(amounts) {
  return toDecimal(amounts.reduce((sum, amount) => sum + toMinor(amount), 0));
}

/** The request body's pre-order fields for one booking item. */
export function toMenuSelectionsPayload(preorder) {
  if (!preorder?.subtotalAmount || preorder.lines.length === 0) return {};
  return {
    menuSelections: preorder.lines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
    })),
    expectedMenuSubtotalAmount: preorder.subtotalAmount,
    expectedMenuCurrency: preorder.currency,
  };
}

export default {
  MAX_PREORDER_LINES,
  MAX_PREORDER_QUANTITY,
  resolveOrderableSections,
  buildPreorderLines,
  clampPreorderQuantity,
  sumDecimalAmounts,
  toMenuSelectionsPayload,
};

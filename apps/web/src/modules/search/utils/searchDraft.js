/**
 * Rules for the only Search inputs that are not applied the instant they
 * change (`hooks/useSearchDraft.js` holds their state): text a visitor is
 * still typing (keyword, price) and a date range with only its first day
 * picked. Pure functions, so the rules are testable on their own.
 *
 * Everything else — category, destination, party size, every category
 * filter — applies live, straight to the URL.
 */

import { DATE_MODES } from './categoryFilterCapabilities.js';
import { MAX_PRICE_AMD } from '../schemas/searchParams.js';

const PRICE_INPUT_PATTERN = /^\d+$/;

/** Whole AMD from typed text, or `undefined` for empty/invalid text. */
export function parsePriceInput(text) {
  const trimmed = text.trim();
  if (!PRICE_INPUT_PATTERN.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= MAX_PRICE_AMD ? value : undefined;
}

export function priceToText(amount) {
  return amount === undefined ? '' : String(amount);
}

/** `'invalidRange'` when the typed minimum is above the typed maximum. */
export function getPriceError(minText, maxText) {
  const min = parsePriceInput(minText);
  const max = parsePriceInput(maxText);
  return min !== undefined && max !== undefined && min > max
    ? 'invalidRange'
    : undefined;
}

/**
 * The date patch a picker value applies, or `null` while it cannot apply
 * yet (a range with only its first day). One-day categories apply a single
 * date as `dateFrom === dateTo`; clearing applies "no dates".
 */
export function toDatePatch(value, dateMode) {
  if (dateMode === DATE_MODES.DAY) {
    return value
      ? { dateFrom: value, dateTo: value }
      : { dateFrom: undefined, dateTo: undefined };
  }
  if (!value || (!value.start && !value.end)) {
    return { dateFrom: undefined, dateTo: undefined };
  }
  return value.start && value.end
    ? { dateFrom: value.start, dateTo: value.end }
    : null;
}

/**
 * Client-side quantity checks for the Partner calendar's block and
 * external-reservation forms (create and edit share them).
 *
 * Mirrors `availabilityValidators.js`'s block quantity (integer, 1 to the
 * `INT UNSIGNED` max, REQUIRED) and external-reservation quantity (same
 * range, optional — the server defaults an omitted value to 1). Invalid
 * typed values are rejected, never coerced into `1`.
 */

import { INT_UNSIGNED_MAX } from '../../../availability/index.js';

const INTEGER_STRING_PATTERN = /^-?\d+$/;

function parseQuantityField(rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (trimmed === '') return { value: undefined, malformed: false };
  if (!INTEGER_STRING_PATTERN.test(trimmed)) {
    return { value: undefined, malformed: true };
  }
  const value = Number(trimmed);
  // Past MAX_SAFE_INTEGER the parsed number isn't what was typed, but it's
  // still unambiguously "too large", which is the more useful message.
  if (!Number.isSafeInteger(value) || value > INT_UNSIGNED_MAX) {
    return { value: undefined, malformed: value <= 0, tooLarge: value > 0 };
  }
  return { value, malformed: false };
}

export function validateBlockQuantity(rawValue, t) {
  const { value, malformed, tooLarge } = parseQuantityField(rawValue);
  if (tooLarge) {
    return { value: undefined, error: t('partner.calendar.quantityTooLarge') };
  }
  if (malformed || value === undefined || value < 1) {
    return {
      value: undefined,
      error: t('partner.calendar.blocks.quantityInvalid'),
    };
  }
  return { value, error: undefined };
}

export function validateExternalQuantity(rawValue, t) {
  const { value, malformed, tooLarge } = parseQuantityField(rawValue);
  if (tooLarge) {
    return { value: undefined, error: t('partner.calendar.quantityTooLarge') };
  }
  if (malformed || (value !== undefined && value < 1)) {
    return {
      value: undefined,
      error: t('partner.calendar.external.quantityInvalid'),
    };
  }
  return { value, error: undefined };
}

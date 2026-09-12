/**
 * FX conversion domain helpers — Pass 8 (Multi-Currency / CBA FX Pricing).
 *
 * AMD is the platform's one canonical/base currency (every Partner/Admin
 * price is authored in AMD — brief §3). These helpers convert an AMD
 * `Money` amount into a display currency using a normalized CBA rate,
 * for DISPLAY purposes only — never to recompute an already-snapshotted
 * booking/advertisement amount (see `exchange_rates`' own migration
 * comment, and `bookings.display_total_amount`'s own header).
 *
 * Every division here is BigInt-based (never a plain JS float division),
 * per the brief's explicit "no floating-point arithmetic for
 * transactional totals" rule — this module is exactly the boundary where
 * a booking's immutable display-currency snapshot gets computed
 * (`bookingService.js`'s FX-snapshot step), so it holds to the same
 * decimal-safety standard as `Money` itself, not just the live "convert
 * a card price for display" case that would tolerate float slop.
 */

import { Money } from './money.js';

const DECIMAL_STRING = /^-?\d+(\.\d+)?$/;

function parseDecimalToScaledBigInt(value) {
  const str = String(value).trim();
  if (!DECIMAL_STRING.test(str)) {
    throw new TypeError(`"${value}" is not a valid decimal string.`);
  }
  const negative = str.startsWith('-');
  const [whole, fraction = ''] = str.replace('-', '').split('.');
  const digits = `${whole}${fraction}` || '0';
  return {
    value: BigInt(digits) * (negative ? -1n : 1n),
    scale: fraction.length,
  };
}

/** Round-half-up for a non-negative `numerator/denominator` BigInt ratio — prices/rates are never negative in this domain. */
function divideRoundHalfUp(numerator, denominator) {
  if (denominator === 0n) {
    throw new TypeError('Division by zero.');
  }
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Decimal-safe `dividend / divisor`, returned as a decimal string with
 * exactly `outputScale` fractional digits — the general building block
 * both CBA rate normalization (brief §8) and AMD->display conversion
 * (below) are built on, so there is exactly one division routine in this
 * module, not two independently-reasoned-about ones.
 */
export function divideDecimalStrings(dividend, divisor, outputScale) {
  const a = parseDecimalToScaledBigInt(dividend);
  const b = parseDecimalToScaledBigInt(divisor);
  if (b.value <= 0n) {
    throw new TypeError('divideDecimalStrings requires a positive divisor.');
  }
  const numerator =
    a.value * 10n ** BigInt(b.scale) * 10n ** BigInt(outputScale);
  const denominator = 10n ** BigInt(a.scale) * b.value;
  const scaled = divideRoundHalfUp(numerator, denominator);
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled)
    .toString()
    .padStart(outputScale + 1, '0');
  if (outputScale === 0) return `${negative ? '-' : ''}${digits}`;
  const wholePart = digits.slice(0, digits.length - outputScale);
  const fractionPart = digits.slice(digits.length - outputScale);
  return `${negative ? '-' : ''}${wholePart}.${fractionPart}`;
}

/**
 * CBA rate normalization (brief §8 — critical): the SOAP response's
 * `Rate` is the AMD value of `Amount` units of the foreign currency, not
 * of exactly 1 unit (e.g. JPY quotes per 10, IRR per 100). Returns the
 * normalized "AMD per 1 unit" rate as an 8-decimal-place string, matching
 * `exchange_rates.rate_to_base DECIMAL(18,8)`'s own precision.
 */
export function normalizeAmdPerUnit(rate, amount) {
  return divideDecimalStrings(rate, amount, 8);
}

/**
 * Converts an AMD `Money` amount into a display currency using an
 * already-normalized `amdPerUnit` rate (brief §8's `targetAmount =
 * amdAmount / amdPerUnit`). AMD itself is the identity conversion — never
 * routed through the division path, so a missing/zero AMD "rate" can
 * never be a divide-by-zero surface.
 *
 * @param {import('./money.js').Money} amdMoney
 * @param {string} targetCurrencyCode
 * @param {number} targetDecimalPlaces
 * @param {string} amdPerUnit - decimal string, "amount of AMD equal to 1 unit of targetCurrency"
 * @returns {import('./money.js').Money}
 */
export function convertAmdToDisplayCurrency(
  amdMoney,
  targetCurrencyCode,
  targetDecimalPlaces,
  amdPerUnit,
) {
  if (amdMoney.currency !== 'AMD') {
    throw new TypeError(
      `convertAmdToDisplayCurrency requires an AMD Money amount, got ${amdMoney.currency}.`,
    );
  }
  if (targetCurrencyCode === 'AMD') {
    return amdMoney;
  }
  const converted = divideDecimalStrings(
    amdMoney.toDecimalString(),
    amdPerUnit,
    targetDecimalPlaces,
  );
  return Money.fromDecimalString(
    converted,
    targetCurrencyCode,
    targetDecimalPlaces,
  );
}

export default {
  divideDecimalStrings,
  normalizeAmdPerUnit,
  convertAmdToDisplayCurrency,
};

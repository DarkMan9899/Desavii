/**
 * Pass 8 (Multi-Currency / CBA FX Pricing) — decimal-safe FX math.
 * Brief §32 (mandatory): a currency where Amount != 1 must normalize
 * correctly.
 */

import { describe, test, expect } from '@jest/globals';
import { Money } from '../../../../src/core/domain/money.js';
import {
  divideDecimalStrings,
  normalizeAmdPerUnit,
  convertAmdToDisplayCurrency,
} from '../../../../src/core/domain/fxConversion.js';

describe('divideDecimalStrings', () => {
  test('divides two decimal strings to the requested output scale, rounding half-up', () => {
    expect(divideDecimalStrings('10', '3', 4)).toBe('3.3333');
    expect(divideDecimalStrings('1', '2', 2)).toBe('0.50');
    expect(divideDecimalStrings('100', '4', 0)).toBe('25');
  });

  test('rejects a zero or negative divisor', () => {
    expect(() => divideDecimalStrings('100', '0', 2)).toThrow(TypeError);
    expect(() => divideDecimalStrings('100', '-5', 2)).toThrow(TypeError);
  });
});

describe('normalizeAmdPerUnit (brief §8 — critical)', () => {
  test('Amount = 1: the normalized rate equals the raw CBA rate (e.g. USD)', () => {
    expect(normalizeAmdPerUnit('363.28', '1')).toBe('363.28000000');
  });

  test('Amount != 1: JPY-style quote (10 units) normalizes to a true per-unit rate', () => {
    // CBA quotes JPY per 10 units, e.g. Rate=23.597 for Amount=10 ->
    // 1 JPY = 2.3597 AMD, never the raw 23.597 misread as per-unit.
    expect(normalizeAmdPerUnit('23.597', '10')).toBe('2.35970000');
  });

  test('Amount != 1: IRR-style quote (100 units) normalizes correctly', () => {
    expect(normalizeAmdPerUnit('0.026438', '100')).toBe('0.00026438');
  });
});

describe('convertAmdToDisplayCurrency', () => {
  test('AMD to AMD is the identity conversion, never routed through division', () => {
    const amd = Money.fromDecimalString('50000.00', 'AMD', 2);
    const result = convertAmdToDisplayCurrency(amd, 'AMD', 2, '1.00000000');
    expect(result).toBe(amd);
  });

  test('converts a real AMD amount to USD using a normalized rate', () => {
    const amd = Money.fromDecimalString('50000.00', 'AMD', 2);
    // 1 USD = 363.28 AMD -> 50000 / 363.28 = 137.6267... -> rounds to 137.63
    const result = convertAmdToDisplayCurrency(amd, 'USD', 2, '363.28000000');
    expect(result.toDecimalString()).toBe('137.63');
    expect(result.currency).toBe('USD');
  });

  test('converts using a normalized Amount!=1 rate (JPY-style) without misreading the raw CBA rate', () => {
    const amd = Money.fromDecimalString('1000.00', 'AMD', 2);
    const amdPerUnit = normalizeAmdPerUnit('23.597', '10'); // 2.3597
    const result = convertAmdToDisplayCurrency(amd, 'JPY', 0, amdPerUnit);
    // 1000 / 2.3597 = 423.89... -> rounds to 424
    expect(result.toDecimalString()).toBe('424');
  });

  test('rejects a non-AMD source amount — the canonical rule is AMD-only authoring', () => {
    const usd = Money.fromDecimalString('100.00', 'USD', 2);
    expect(() =>
      convertAmdToDisplayCurrency(usd, 'RUB', 2, '4.30000000'),
    ).toThrow(TypeError);
  });
});

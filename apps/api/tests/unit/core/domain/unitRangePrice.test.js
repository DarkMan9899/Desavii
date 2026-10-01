import { describe, test, expect } from '@jest/globals';
import {
  sumUnitRangePrice,
  UNIT_RANGE_PRICE_ISSUES,
} from '../../../../src/core/domain/unitRangePrice.js';

// Step L6.2H4 — the one per-range price every quote and charge uses.
const DATES = ['2027-05-01', '2027-05-02', '2027-05-03'];

function price(overrides, unitBase, listingBase) {
  return sumUnitRangePrice({
    dates: DATES,
    overrideByDate: new Map(Object.entries(overrides)),
    unitBase,
    listingBase,
  });
}

describe('sumUnitRangePrice', () => {
  test('sums each date: calendar override, else unit base, else listing base', () => {
    const { unitPrice, issue } = price(
      { '2027-05-02': { amount: '150.50', currencyCode: 'AMD' } },
      { amount: '100.25', currencyCode: 'AMD' },
      { amount: 90, currencyCode: 'AMD' },
    );
    expect(issue).toBeNull();
    expect(unitPrice.toDecimalString()).toBe('351.00');
    expect(unitPrice.currency).toBe('AMD');
  });

  test('falls back to the listing price when the unit has none', () => {
    const { unitPrice } = price({}, {}, { amount: 8000, currencyCode: 'AMD' });
    expect(unitPrice.toDecimalString()).toBe('24000.00');
  });

  test('keeps a non-AMD currency', () => {
    const { unitPrice } = price({}, { amount: '30.00', currencyCode: 'EUR' });
    expect(unitPrice.currency).toBe('EUR');
    expect(unitPrice.toDecimalString()).toBe('90.00');
  });

  test('a zero price is a real price, not a missing one', () => {
    const { unitPrice, issue } = price(
      {},
      {},
      { amount: 0, currencyCode: 'AMD' },
    );
    expect(issue).toBeNull();
    expect(unitPrice.toDecimalString()).toBe('0.00');
  });

  test('a date without any price is PRICING_INCOMPLETE', () => {
    const result = price({
      '2027-05-01': { amount: '10.00', currencyCode: 'AMD' },
    });
    expect(result).toEqual({
      unitPrice: null,
      issue: UNIT_RANGE_PRICE_ISSUES.INCOMPLETE,
    });
  });

  test('no charged dates at all is PRICING_INCOMPLETE', () => {
    expect(
      sumUnitRangePrice({
        dates: [],
        overrideByDate: new Map(),
        listingBase: { amount: 10, currencyCode: 'AMD' },
      }).issue,
    ).toBe(UNIT_RANGE_PRICE_ISSUES.INCOMPLETE);
  });

  test('dates priced in two currencies are PRICING_CURRENCY_MISMATCH, never combined', () => {
    const result = price(
      { '2027-05-01': { amount: '50.00', currencyCode: 'AMD' } },
      { amount: '20.00', currencyCode: 'EUR' },
    );
    expect(result).toEqual({
      unitPrice: null,
      issue: UNIT_RANGE_PRICE_ISSUES.CURRENCY_MISMATCH,
    });
  });
});

import { describe, test, expect } from 'vitest';
import {
  parsePriceInput,
  priceToText,
  getPriceError,
  toDatePatch,
} from './searchDraft.js';
import { DATE_MODES } from './categoryFilterCapabilities.js';

describe('searchDraft rules (apps/web/src/modules/search)', () => {
  test.each([
    ['5000', 5000],
    [' 5000 ', 5000],
    ['0', 0],
    ['', undefined],
    ['12.5', undefined],
    ['abc', undefined],
    ['1000000001', undefined],
  ])('price text %j parses to %j', (text, expected) => {
    expect(parsePriceInput(text)).toBe(expected);
  });

  test('an applied price round-trips through its text form', () => {
    expect(priceToText(undefined)).toBe('');
    expect(parsePriceInput(priceToText(20000))).toBe(20000);
  });

  test('a minimum above the maximum is the only price error', () => {
    expect(getPriceError('9000', '1000')).toBe('invalidRange');
    expect(getPriceError('1000', '9000')).toBeUndefined();
    expect(getPriceError('5000', '')).toBeUndefined();
    expect(getPriceError('', '')).toBeUndefined();
  });

  describe('toDatePatch', () => {
    test('a range applies only once both days are picked — never half a range', () => {
      expect(
        toDatePatch({ start: '2026-11-01', end: null }, DATE_MODES.STAY),
      ).toBeNull();
      expect(
        toDatePatch(
          { start: '2026-11-01', end: '2026-11-04' },
          DATE_MODES.STAY,
        ),
      ).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-04' });
      expect(
        toDatePatch(
          { start: '2026-11-01', end: '2026-11-03' },
          DATE_MODES.RENTAL,
        ),
      ).toEqual({ dateFrom: '2026-11-01', dateTo: '2026-11-03' });
    });

    test('a one-day category applies its single date as a same-day pair', () => {
      expect(toDatePatch('2026-11-05', DATE_MODES.DAY)).toEqual({
        dateFrom: '2026-11-05',
        dateTo: '2026-11-05',
      });
    });

    test('clearing the picker applies "no dates" in every mode', () => {
      const none = { dateFrom: undefined, dateTo: undefined };
      expect(toDatePatch(null, DATE_MODES.DAY)).toEqual(none);
      expect(toDatePatch({ start: null, end: null }, DATE_MODES.RANGE)).toEqual(
        none,
      );
    });
  });
});

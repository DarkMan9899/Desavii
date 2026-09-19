import { describe, test, expect } from 'vitest';
import {
  ALLOWED_RANGE_DAYS,
  DEFAULT_RANGE_DAYS,
  LISTINGS_SORT_VALUES,
  DEFAULT_LISTINGS_SORT,
  parseRangeDays,
  parseListingsSort,
} from './ranges.js';

describe('partnerAnalytics ranges (apps/web/src/modules/partnerAnalytics) — brief §10/§26/§59', () => {
  test('mirrors A5 validators exactly: 7/30/90, default 30', () => {
    expect(ALLOWED_RANGE_DAYS).toEqual([7, 30, 90]);
    expect(DEFAULT_RANGE_DAYS).toBe(30);
  });

  test('mirrors A5 validators exactly: bounded listings sort enum, default views', () => {
    expect(LISTINGS_SORT_VALUES).toEqual([
      'views',
      'impressions',
      'booking_requests',
      'promotion_clicks',
    ]);
    expect(DEFAULT_LISTINGS_SORT).toBe('views');
  });

  test.each([
    ['7', 7],
    ['30', 30],
    ['90', 90],
  ])('parseRangeDays(%s) accepts an allowed value', (input, expected) => {
    expect(parseRangeDays(input)).toBe(expected);
  });

  test.each([
    [null, DEFAULT_RANGE_DAYS],
    [undefined, DEFAULT_RANGE_DAYS],
    ['', DEFAULT_RANGE_DAYS],
    ['14', DEFAULT_RANGE_DAYS],
    ['not-a-number', DEFAULT_RANGE_DAYS],
    ['-30', DEFAULT_RANGE_DAYS],
  ])(
    'parseRangeDays(%s) falls back safely to the default (brief §10: invalid URL range -> 30)',
    (input, expected) => {
      expect(parseRangeDays(input)).toBe(expected);
    },
  );

  test('parseListingsSort accepts only the bounded backend enum, falling back to the default', () => {
    expect(parseListingsSort('promotion_clicks')).toBe('promotion_clicks');
    expect(parseListingsSort('search_ctr')).toBe(DEFAULT_LISTINGS_SORT);
    expect(parseListingsSort(null)).toBe(DEFAULT_LISTINGS_SORT);
  });
});

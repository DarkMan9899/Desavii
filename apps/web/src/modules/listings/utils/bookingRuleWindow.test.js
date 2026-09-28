import { describe, test, expect } from 'vitest';
import {
  STAY_RULE_UNIT_BY_LISTING_TYPE,
  computeStayLength,
  evaluateStayRules,
  latestBookableDate,
} from './bookingRuleWindow.js';

// Step L6.2F — same semantics as the backend's `bookingRuleEvaluation.js`.
describe('bookingRuleWindow', () => {
  test('lodging counts nights, a car rental inclusive days; other types have no stay rule', () => {
    expect(STAY_RULE_UNIT_BY_LISTING_TYPE).toEqual({
      HOTEL: 'nights',
      PROPERTY: 'nights',
      CAR_RENTAL: 'days',
    });
    expect(computeStayLength('nights', '2026-10-01', '2026-10-03')).toBe(2);
    expect(computeStayLength('days', '2026-10-01', '2026-10-01')).toBe(1);
    expect(computeStayLength('days', '2026-10-01', '2026-10-03')).toBe(3);
  });

  const rules = { minimum_stay_nights: 2, maximum_stay_nights: 4 };

  test.each([
    [
      'HOTEL',
      '2026-10-11',
      { issue: 'MINIMUM_STAY_NOT_MET', minimum: 2, unit: 'nights' },
    ],
    ['HOTEL', '2026-10-12', null],
    ['PROPERTY', '2026-10-14', null],
    [
      'PROPERTY',
      '2026-10-15',
      { issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 4, unit: 'nights' },
    ],
    [
      'CAR_RENTAL',
      '2026-10-10',
      { issue: 'MINIMUM_STAY_NOT_MET', minimum: 2, unit: 'days' },
    ],
    ['CAR_RENTAL', '2026-10-13', null],
    [
      'CAR_RENTAL',
      '2026-10-14',
      { issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 4, unit: 'days' },
    ],
    ['RESTAURANT', '2026-10-10', null],
    ['TOUR', '2026-10-10', null],
    ['ATTRACTION', '2026-10-10', null],
  ])('%s from 2026-10-10 to %s', (listingType, dateTo, expected) => {
    expect(
      evaluateStayRules({
        listingType,
        dateFrom: '2026-10-10',
        dateTo,
        bookingRules: rules,
      }),
    ).toEqual(expected);
  });

  test('no rules, or an incomplete range, is never a violation', () => {
    expect(
      evaluateStayRules({
        listingType: 'HOTEL',
        dateFrom: '2026-10-10',
        dateTo: '2026-10-11',
        bookingRules: null,
      }),
    ).toBeNull();
    expect(
      evaluateStayRules({
        listingType: 'HOTEL',
        dateFrom: '2026-10-10',
        dateTo: null,
        bookingRules: rules,
      }),
    ).toBeNull();
  });

  test('the advance-maximum horizon is today + N calendar days; 0 is today only; null is none', () => {
    expect(latestBookableDate('2026-12-30', 3)).toBe('2027-01-02');
    expect(latestBookableDate('2026-10-01', 0)).toBe('2026-10-01');
    expect(latestBookableDate('2026-10-01', null)).toBeUndefined();
    expect(latestBookableDate('2026-10-01', undefined)).toBeUndefined();
  });
});

/**
 * Step L6.2F — Partner booking-rule evaluation. `now` is a fixed instant:
 * 2026-10-01 10:00 in Asia/Yerevan (06:00 UTC), so nothing here depends on the
 * wall clock or the machine's timezone.
 */

import { describe, test, expect } from '@jest/globals';
import {
  getStayRuleUnit,
  computeStayLength,
  evaluateBookingRules,
} from '../../../../src/core/domain/bookingRuleEvaluation.js';

const NOW = new Date('2026-10-01T06:00:00.000Z');

function evaluate({
  listingTypeCode = 'HOTEL',
  dateFrom = '2026-10-10',
  dateTo = '2026-10-12',
  time = null,
  rules,
}) {
  return evaluateBookingRules({
    listingTypeCode,
    dateFrom,
    dateTo,
    start: { date: dateFrom, time },
    rules,
    now: NOW,
  });
}

describe('stay length', () => {
  test('lodging counts nights (checkout excluded); a car rental counts inclusive days', () => {
    expect(getStayRuleUnit('HOTEL')).toBe('nights');
    expect(getStayRuleUnit('PROPERTY')).toBe('nights');
    expect(getStayRuleUnit('CAR_RENTAL')).toBe('days');
    expect(getStayRuleUnit('RESTAURANT')).toBeNull();
    expect(computeStayLength('nights', '2026-10-01', '2026-10-02')).toBe(1);
    expect(computeStayLength('nights', '2026-10-01', '2026-10-03')).toBe(2);
    expect(computeStayLength('days', '2026-10-01', '2026-10-01')).toBe(1);
    expect(computeStayLength('days', '2026-10-01', '2026-10-02')).toBe(2);
    expect(computeStayLength('days', '2026-10-01', '2026-10-03')).toBe(3);
  });
});

describe('lodging minimum/maximum nights', () => {
  const rules = { minimumStayNights: 2, maximumStayNights: 4 };
  test.each([
    [
      'below min',
      '2026-10-11',
      [{ issue: 'MINIMUM_STAY_NOT_MET', minimum: 2, unit: 'nights' }],
    ],
    ['exact min', '2026-10-12', []],
    ['between', '2026-10-13', []],
    ['exact max', '2026-10-14', []],
    [
      'above max',
      '2026-10-15',
      [{ issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 4, unit: 'nights' }],
    ],
  ])('%s', (_label, dateTo, expected) => {
    expect(evaluate({ dateFrom: '2026-10-10', dateTo, rules })).toEqual(
      expected,
    );
    expect(
      evaluate({
        listingTypeCode: 'PROPERTY',
        dateFrom: '2026-10-10',
        dateTo,
        rules,
      }),
    ).toEqual(expected);
  });
});

describe('car rental minimum/maximum days', () => {
  const rules = { minimumStayNights: 2, maximumStayNights: 3 };
  test.each([
    [
      'below min (1 day)',
      '2026-10-10',
      [{ issue: 'MINIMUM_STAY_NOT_MET', minimum: 2, unit: 'days' }],
    ],
    ['exact min (2 days)', '2026-10-11', []],
    ['exact max (3 days)', '2026-10-12', []],
    [
      'above max (4 days)',
      '2026-10-13',
      [{ issue: 'MAXIMUM_STAY_EXCEEDED', maximum: 3, unit: 'days' }],
    ],
  ])('%s', (_label, dateTo, expected) => {
    expect(
      evaluate({
        listingTypeCode: 'CAR_RENTAL',
        dateFrom: '2026-10-10',
        dateTo,
        time: '10:00',
        rules,
      }),
    ).toEqual(expected);
  });
});

describe('advance minimum hours', () => {
  const rules = { advanceBookingMinHours: 24 };
  test.each([
    ['timed: too soon', '2026-10-02', '09:59', true],
    ['timed: exact boundary is accepted', '2026-10-02', '10:00', false],
    ['timed: after the boundary', '2026-10-02', '10:01', false],
    ['date-only: tomorrow 00:00 is too soon', '2026-10-02', null, true],
    [
      'date-only: the day after tomorrow 00:00 clears 24h',
      '2026-10-03',
      null,
      false,
    ],
  ])('%s', (_label, dateFrom, time, tooSoon) => {
    const issues = evaluate({
      listingTypeCode: 'RESTAURANT',
      dateFrom,
      dateTo: dateFrom,
      time,
      rules,
    });
    expect(issues).toEqual(
      tooSoon ? [{ issue: 'BOOKING_TOO_SOON', minimumHours: 24 }] : [],
    );
  });

  test('date-only exact boundary: 14h ahead of 10:00 is tomorrow 00:00 exactly', () => {
    expect(
      evaluate({
        listingTypeCode: 'HOTEL',
        dateFrom: '2026-10-02',
        dateTo: '2026-10-03',
        rules: { advanceBookingMinHours: 14 },
      }),
    ).toEqual([]);
    expect(
      evaluate({
        listingTypeCode: 'HOTEL',
        dateFrom: '2026-10-02',
        dateTo: '2026-10-03',
        rules: { advanceBookingMinHours: 15 },
      }),
    ).toEqual([{ issue: 'BOOKING_TOO_SOON', minimumHours: 15 }]);
  });

  test('0 hours is no lead time at all', () => {
    expect(
      evaluate({
        listingTypeCode: 'RESTAURANT',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-01',
        time: '10:00',
        rules: { advanceBookingMinHours: 0 },
      }),
    ).toEqual([]);
  });
});

describe('advance maximum days (calendar days, Asia/Yerevan)', () => {
  test.each([
    ['inside', 5, '2026-10-04', false],
    ['exact maximum date', 5, '2026-10-06', false],
    ['outside', 5, '2026-10-07', true],
    ['0 = today only: today', 0, '2026-10-01', false],
    ['0 = today only: tomorrow', 0, '2026-10-02', true],
    ['1: day after tomorrow', 1, '2026-10-03', true],
  ])('%s', (_label, maximumDays, dateFrom, tooFar) => {
    const issues = evaluate({
      listingTypeCode: 'TOUR',
      dateFrom,
      dateTo: dateFrom,
      time: '23:30',
      rules: { advanceBookingMaxDays: maximumDays },
    });
    expect(issues).toEqual(
      tooFar ? [{ issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays }] : [],
    );
  });

  test('uses the Yerevan date across UTC midnight (01:30 Yerevan is still yesterday in UTC)', () => {
    const issues = evaluateBookingRules({
      listingTypeCode: 'TOUR',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-01',
      start: { date: '2026-10-01', time: null },
      rules: { advanceBookingMaxDays: 0 },
      now: new Date('2026-09-30T21:30:00.000Z'),
    });
    expect(issues).toEqual([]);
  });
});

describe('null rules and non-applicable stay rules', () => {
  test('no rules row, or every rule null, is unrestricted', () => {
    expect(evaluate({ rules: null })).toEqual([]);
    expect(
      evaluate({
        dateTo: '2026-10-11',
        rules: {
          minimumStayNights: null,
          maximumStayNights: null,
          advanceBookingMinHours: null,
          advanceBookingMaxDays: null,
        },
      }),
    ).toEqual([]);
  });

  test.each(['RESTAURANT', 'TOUR', 'ATTRACTION'])(
    '%s ignores legacy stay values but still obeys its advance rules',
    (listingTypeCode) => {
      const legacy = { minimumStayNights: 5, maximumStayNights: 1 };
      expect(
        evaluate({
          listingTypeCode,
          dateFrom: '2026-10-05',
          dateTo: '2026-10-05',
          rules: legacy,
        }),
      ).toEqual([]);
      expect(
        evaluate({
          listingTypeCode,
          dateFrom: '2026-10-05',
          dateTo: '2026-10-05',
          rules: { ...legacy, advanceBookingMaxDays: 1 },
        }),
      ).toEqual([{ issue: 'BOOKING_TOO_FAR_AHEAD', maximumDays: 1 }]);
    },
  );
});

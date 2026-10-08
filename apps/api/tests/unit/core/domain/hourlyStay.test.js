/**
 * Step L6.3B — the hourly hotel stay contract. Every instant is a fixed UTC
 * value, so results never depend on the machine's own timezone.
 */

import { describe, test, expect } from '@jest/globals';
import { Money } from '../../../../src/core/domain/money.js';
import {
  BOOKING_MODES,
  HOURLY_STAY_ISSUES,
  HOURLY_CONFIG_ISSUES,
  parseWholeHour,
  formatHour,
  intervalsOverlap,
  peakOccupiedQuantity,
  validateHourlyConfig,
  validateHourlyStay,
  hasHourlyStayStarted,
  hourlyStayUnitPrice,
} from '../../../../src/core/domain/hourlyStay.js';

const CONFIG = {
  minHours: 2,
  maxHours: 6,
  availableFrom: '10:00',
  availableUntil: '20:00',
};

function stay(startTime, endTime, overrides = {}) {
  return {
    dateFrom: '2026-10-20',
    dateTo: '2026-10-20',
    startTime,
    endTime,
    ...overrides,
  };
}

describe('booking modes', () => {
  test('are exactly NIGHTLY and HOURLY', () => {
    expect(BOOKING_MODES).toEqual({ NIGHTLY: 'NIGHTLY', HOURLY: 'HOURLY' });
  });
});

describe('parseWholeHour / formatHour', () => {
  test.each([
    ['00:00', 0],
    ['14:00', 14],
    ['14:00:00', 14],
    ['23:00', 23],
    ['24:00', 24],
  ])('"%s" is hour %i', (time, hour) => {
    expect(parseWholeHour(time)).toBe(hour);
  });

  test.each(['14:30', '14:15', '14:00:30', '25:00', '9:00', '', null, 14])(
    '%p is not a whole-hour boundary',
    (time) => {
      expect(parseWholeHour(time)).toBeNull();
    },
  );

  test('formats an hour as HH:MM', () => {
    expect(formatHour(9)).toBe('09:00');
    expect(formatHour(24)).toBe('24:00');
  });
});

describe('intervalsOverlap — half-open [start, end)', () => {
  test('back-to-back intervals do not overlap', () => {
    expect(intervalsOverlap(14, 16, 16, 18)).toBe(false);
    expect(intervalsOverlap(16, 18, 14, 16)).toBe(false);
  });

  test('a shared hour overlaps', () => {
    expect(intervalsOverlap(14, 16, 15, 17)).toBe(true);
    expect(intervalsOverlap(14, 18, 15, 16)).toBe(true);
    expect(intervalsOverlap(14, 16, 14, 16)).toBe(true);
  });
});

describe('peakOccupiedQuantity', () => {
  const reservations = [
    { startHour: 14, endHour: 16, quantity: 1 },
    { startHour: 15, endHour: 17, quantity: 2 },
    { startHour: 18, endHour: 20, quantity: 1 },
  ];

  test('is the busiest single hour the request covers', () => {
    expect(peakOccupiedQuantity(reservations, 14, 17)).toBe(3);
    expect(peakOccupiedQuantity(reservations, 16, 18)).toBe(2);
  });

  test('a free span has no occupancy, back-to-back included', () => {
    expect(peakOccupiedQuantity(reservations, 10, 14)).toBe(0);
    expect(peakOccupiedQuantity(reservations, 17, 18)).toBe(0);
  });

  test('the whole day peak counts every overlap', () => {
    expect(peakOccupiedQuantity(reservations, 0, 24)).toBe(3);
  });
});

describe('validateHourlyStay', () => {
  test('a whole-hour stay inside the window and duration is valid', () => {
    expect(validateHourlyStay(stay('14:00', '18:00'), CONFIG)).toEqual({
      valid: true,
      startHour: 14,
      endHour: 18,
      hours: 4,
    });
  });

  test('the window edges are inclusive of whole stays inside them', () => {
    expect(validateHourlyStay(stay('10:00', '12:00'), CONFIG).valid).toBe(true);
    expect(validateHourlyStay(stay('18:00', '20:00'), CONFIG).valid).toBe(true);
  });

  test.each([
    ['09:00', '12:00'],
    ['19:00', '21:00'],
  ])('%s–%s is outside the window', (start, end) => {
    expect(validateHourlyStay(stay(start, end), CONFIG)).toEqual({
      valid: false,
      issue: HOURLY_STAY_ISSUES.OUTSIDE_WINDOW,
    });
  });

  test.each([
    ['14:00', '15:00', 'below the minimum'],
    ['10:00', '17:00', 'above the maximum'],
  ])('%s–%s is %s', (start, end) => {
    expect(validateHourlyStay(stay(start, end), CONFIG)).toEqual({
      valid: false,
      issue: HOURLY_STAY_ISSUES.DURATION_OUT_OF_RANGE,
    });
  });

  test('the minimum and maximum durations themselves are accepted', () => {
    expect(validateHourlyStay(stay('12:00', '14:00'), CONFIG).hours).toBe(2);
    expect(validateHourlyStay(stay('12:00', '18:00'), CONFIG).hours).toBe(6);
  });

  test.each([
    ['14:30', '16:00'],
    ['14:00', '16:30'],
    [undefined, '16:00'],
    ['14:00', undefined],
    ['16:00', '14:00'],
    ['14:00', '14:00'],
    ['24:00', '24:00'],
  ])('%p–%p is not a valid whole-hour interval', (start, end) => {
    expect(validateHourlyStay(stay(start, end), CONFIG)).toEqual({
      valid: false,
      issue: HOURLY_STAY_ISSUES.TIME_INVALID,
    });
  });

  test('a stay ending on a later date is a cross-midnight stay', () => {
    expect(
      validateHourlyStay(
        stay('22:00', '02:00', { dateTo: '2026-10-21' }),
        CONFIG,
      ),
    ).toEqual({ valid: false, issue: HOURLY_STAY_ISSUES.CROSS_MIDNIGHT });
  });

  test('24:00 ends a stay at the end of the day when the window allows it', () => {
    expect(
      validateHourlyStay(stay('20:00', '24:00'), {
        ...CONFIG,
        availableUntil: '24:00',
      }),
    ).toEqual({ valid: true, startHour: 20, endHour: 24, hours: 4 });
  });
});

describe('validateHourlyConfig', () => {
  const complete = {
    enabled: true,
    priceAmount: '8000.00',
    priceCurrency: 'AMD',
    minHours: 2,
    maxHours: 6,
    availableFrom: '10:00',
    availableUntil: '20:00',
  };

  test('a disabled room needs no hourly configuration', () => {
    expect(validateHourlyConfig({ enabled: false })).toEqual([]);
  });

  test('a complete, coherent configuration is valid', () => {
    expect(validateHourlyConfig(complete)).toEqual([]);
  });

  test('an enabled room must carry every field', () => {
    expect(
      validateHourlyConfig({ ...complete, priceAmount: null, minHours: null }),
    ).toEqual([
      { field: 'hourlyPriceAmount', issue: HOURLY_CONFIG_ISSUES.INCOMPLETE },
      {
        field: 'hourlyMinDurationHours',
        issue: HOURLY_CONFIG_ISSUES.INCOMPLETE,
      },
    ]);
  });

  test('the maximum may not be below the minimum', () => {
    expect(validateHourlyConfig({ ...complete, maxHours: 1 })).toEqual([
      {
        field: 'hourlyMaxDurationHours',
        issue: HOURLY_CONFIG_ISSUES.DURATION_RANGE_INVALID,
      },
    ]);
  });

  test.each([
    ['20:00', '10:00'],
    ['10:00', '10:00'],
    ['10:00', '11:00'],
    ['10:30', '20:00'],
  ])(
    'window %s–%s is invalid (reversed, empty, shorter than the minimum or not whole hours)',
    (from, until) => {
      expect(
        validateHourlyConfig({
          ...complete,
          availableFrom: from,
          availableUntil: until,
        }),
      ).toEqual([
        {
          field: 'hourlyAvailableUntil',
          issue: HOURLY_CONFIG_ISSUES.WINDOW_INVALID,
        },
      ]);
    },
  );
});

describe('hasHourlyStayStarted — Asia/Yerevan business time', () => {
  // 2026-10-20 13:30 in Yerevan (UTC+4).
  const NOW = new Date('2026-10-20T09:30:00.000Z');

  test('a later hour today has not started', () => {
    expect(
      hasHourlyStayStarted({ date: '2026-10-20', startHour: 14 }, NOW),
    ).toBe(false);
  });

  test('an earlier hour today and any hour yesterday have started', () => {
    expect(
      hasHourlyStayStarted({ date: '2026-10-20', startHour: 13 }, NOW),
    ).toBe(true);
    expect(
      hasHourlyStayStarted({ date: '2026-10-19', startHour: 23 }, NOW),
    ).toBe(true);
  });

  test('a stay starting exactly now counts as started', () => {
    expect(
      hasHourlyStayStarted(
        { date: '2026-10-20', startHour: 14 },
        new Date('2026-10-20T10:00:00.000Z'),
      ),
    ).toBe(true);
  });

  test('uses the Yerevan date across UTC midnight, not the UTC date', () => {
    // 2026-10-20 01:30 in Yerevan is still 2026-10-19 in UTC.
    const earlyMorning = new Date('2026-10-19T21:30:00.000Z');
    expect(
      hasHourlyStayStarted({ date: '2026-10-20', startHour: 1 }, earlyMorning),
    ).toBe(true);
    expect(
      hasHourlyStayStarted({ date: '2026-10-20', startHour: 2 }, earlyMorning),
    ).toBe(false);
  });
});

describe('hourlyStayUnitPrice', () => {
  test('is the hourly rate times the hours, in the rate currency', () => {
    const price = hourlyStayUnitPrice(
      Money.fromDecimalString('8000.00', 'AMD'),
      4,
    );
    expect(price.toDecimalString()).toBe('32000.00');
    expect(price.currency).toBe('AMD');
  });

  test('keeps a non-AMD currency and exact cents', () => {
    const price = hourlyStayUnitPrice(
      Money.fromDecimalString('12.35', 'USD'),
      3,
    );
    expect(price.toDecimalString()).toBe('37.05');
    expect(price.currency).toBe('USD');
  });
});

import { describe, test, expect } from 'vitest';
import {
  computeOpenNowStatus,
  findTodaysHours,
  getWeekdayName,
  buildWeeklyScheduleRows,
} from './openingHoursStatus.js';

// Opening hours are Yerevan business hours, so every instant below is an
// explicit Yerevan wall-clock time (UTC+04:00, no DST) — the same result
// whatever timezone the test machine or the viewer is in.
function yerevanAt(date, hhmm) {
  return new Date(`${date}T${hhmm}:00+04:00`);
}

// Wednesday 2026-08-05 (real calendar Wednesday) at the given HH:MM.
function wednesdayAt(hhmm) {
  return yerevanAt('2026-08-05', hhmm);
}

// Friday 2026-08-07 at the given HH:MM — used for the overnight-window case.
function fridayAt(hhmm) {
  return yerevanAt('2026-08-07', hhmm);
}

// Saturday 2026-08-08 at the given HH:MM — the day after Friday, used to
// prove an overnight window is checked from the day it spills INTO as well.
function saturdayAt(hhmm) {
  return yerevanAt('2026-08-08', hhmm);
}

describe('computeOpenNowStatus (apps/web/src/modules/listings)', () => {
  test('returns UNKNOWN when no hours have been authored at all — never a fabricated CLOSED', () => {
    expect(computeOpenNowStatus([], wednesdayAt('12:00'))).toBe('UNKNOWN');
    expect(computeOpenNowStatus(undefined, wednesdayAt('12:00'))).toBe(
      'UNKNOWN',
    );
  });

  test('OPEN inside a same-day window, CLOSED just before and just after it', () => {
    const hours = [
      {
        day_of_week: 3,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: false,
      },
    ];
    expect(computeOpenNowStatus(hours, wednesdayAt('10:59'))).toBe('CLOSED');
    expect(computeOpenNowStatus(hours, wednesdayAt('11:00'))).toBe('OPEN');
    expect(computeOpenNowStatus(hours, wednesdayAt('22:59'))).toBe('OPEN');
    expect(computeOpenNowStatus(hours, wednesdayAt('23:00'))).toBe('CLOSED');
  });

  test('a day explicitly marked closed is CLOSED even with stale opens_at/closes_at data', () => {
    const hours = [
      {
        day_of_week: 3,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: true,
      },
    ];
    expect(computeOpenNowStatus(hours, wednesdayAt('12:00'))).toBe('CLOSED');
  });

  test('an unauthored day (no row at all) is CLOSED-for-now, distinct from UNKNOWN (some days ARE published)', () => {
    const hours = [
      {
        day_of_week: 1,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: false,
      },
    ];
    expect(computeOpenNowStatus(hours, wednesdayAt('12:00'))).toBe('CLOSED');
  });

  test('an overnight window (closes_at earlier than opens_at) stays OPEN past midnight, on the day it spills into', () => {
    const hours = [
      {
        day_of_week: 5,
        opens_at: '18:00',
        closes_at: '02:00',
        is_closed: false,
      },
    ];
    expect(computeOpenNowStatus(hours, fridayAt('23:00'))).toBe('OPEN');
    expect(computeOpenNowStatus(hours, saturdayAt('01:00'))).toBe('OPEN');
    expect(computeOpenNowStatus(hours, saturdayAt('02:00'))).toBe('CLOSED');
    expect(computeOpenNowStatus(hours, saturdayAt('10:00'))).toBe('CLOSED');
  });
});

describe('getWeekdayName (apps/web/src/modules/listings)', () => {
  test('resolves a real, locale-aware weekday name for every day index, never a hardcoded table', () => {
    expect(getWeekdayName(0, 'en')).toBe('Sunday');
    expect(getWeekdayName(1, 'en')).toBe('Monday');
    expect(getWeekdayName(6, 'en')).toBe('Saturday');
  });

  test('supports a short style for compact display', () => {
    expect(getWeekdayName(1, 'en', 'short')).toMatch(/Mon/);
  });
});

describe('buildWeeklyScheduleRows (apps/web/src/modules/listings)', () => {
  test('orders Monday-first and marks an unauthored day as not published, never fabricating a value for it', () => {
    const rows = buildWeeklyScheduleRows(
      [
        {
          day_of_week: 1,
          opens_at: '11:00',
          closes_at: '23:00',
          is_closed: false,
        },
      ],
      'en',
    );
    expect(rows.map((row) => row.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]).toMatchObject({
      dayOfWeek: 1,
      isPublished: true,
      opensAt: '11:00',
      closesAt: '23:00',
    });
    expect(rows[1]).toMatchObject({ dayOfWeek: 2, isPublished: false });
  });

  test('an empty weekly hours list marks every day as not published', () => {
    const rows = buildWeeklyScheduleRows([], 'en');
    expect(rows.every((row) => !row.isPublished)).toBe(true);
  });
});

describe('findTodaysHours', () => {
  const hours = [
    { day_of_week: 3, opens_at: '11:00', closes_at: '23:00', is_closed: false },
    { day_of_week: 4, opens_at: null, closes_at: null, is_closed: true },
  ];

  test("returns today's authored hours, or that today is closed", () => {
    expect(findTodaysHours(hours, wednesdayAt('09:00'))).toEqual({
      isClosed: false,
      opensAt: '11:00',
      closesAt: '23:00',
    });
    expect(findTodaysHours(hours, yerevanAt('2026-08-06', '09:00'))).toEqual({
      isClosed: true,
      opensAt: null,
      closesAt: null,
    });
  });

  test('returns null when today has no published hours — never a guess', () => {
    expect(findTodaysHours(hours, fridayAt('12:00'))).toBeNull();
    expect(findTodaysHours(undefined, fridayAt('12:00'))).toBeNull();
  });

  test('"today" is the Yerevan day: 21:30 UTC on Wednesday is already Thursday there', () => {
    expect(
      findTodaysHours(hours, new Date('2026-08-05T21:30:00Z')).isClosed,
    ).toBe(true);
  });
});

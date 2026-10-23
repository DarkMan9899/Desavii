import { describe, test, expect } from 'vitest';
import {
  BUSINESS_TIMEZONE,
  addBusinessDays,
  getBusinessToday,
  getBusinessWallClock,
} from './businessDate.js';

// Fixed UTC instants — the result never depends on the machine's timezone.
describe('getBusinessToday (Step L6.2E)', () => {
  test('the business timezone is Asia/Yerevan', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Yerevan');
  });

  test('01:30 in Yerevan on Oct 1 is Oct 1, although UTC is still Sep 30', () => {
    const instant = new Date('2026-09-30T21:30:00.000Z');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(getBusinessToday(instant)).toBe('2026-10-01');
  });

  test('just before Yerevan midnight it is still the same day', () => {
    expect(getBusinessToday(new Date('2026-09-30T19:59:59.000Z'))).toBe(
      '2026-09-30',
    );
  });

  test('exactly Yerevan midnight starts the next day', () => {
    expect(getBusinessToday(new Date('2026-09-30T20:00:00.000Z'))).toBe(
      '2026-10-01',
    );
  });
});

// Calendar Excellence — the 00:00–04:00 window where the UTC date is still
// yesterday in Yerevan (the Listing Detail "today" defect).
describe('getBusinessToday at the Yerevan midnight boundary', () => {
  test.each([
    // [label, UTC instant, Asia/Yerevan date]
    ['23:59 is still the same day', '2026-10-22T19:59:00.000Z', '2026-10-22'],
    ['00:00 starts the next day', '2026-10-22T20:00:00.000Z', '2026-10-23'],
    ['00:01 is the next day', '2026-10-22T20:01:00.000Z', '2026-10-23'],
    [
      '03:59 is the next day, though UTC is still the day before',
      '2026-10-22T23:59:00.000Z',
      '2026-10-23',
    ],
    [
      '04:00 is the next day, as UTC now is too',
      '2026-10-23T00:00:00.000Z',
      '2026-10-23',
    ],
    // Armenia keeps UTC+4 all year: the days Europe changes its clocks
    // change nothing here.
    [
      'no DST: the spring change date keeps UTC+4',
      '2026-03-29T20:00:00.000Z',
      '2026-03-30',
    ],
    [
      'no DST: the autumn change date keeps UTC+4',
      '2026-10-25T19:59:00.000Z',
      '2026-10-25',
    ],
  ])('%s', (_label, instant, expected) => {
    expect(getBusinessToday(new Date(instant))).toBe(expected);
  });
});

describe('addBusinessDays', () => {
  test('adds whole calendar days to a date-only value', () => {
    expect(addBusinessDays('2026-10-23', 29)).toBe('2026-11-21');
  });

  test('crosses month and year ends without shifting', () => {
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addBusinessDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('can step backwards', () => {
    expect(addBusinessDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

// Listing Detail rebuild: "open now" and today's hours are Yerevan
// business hours, whatever timezone the viewer is in.
describe('getBusinessWallClock', () => {
  test.each([
    ['Wednesday noon in Yerevan', '2026-08-05T12:00:00+04:00', 3, 720],
    ['Yerevan midnight is the next day already', '2026-08-05T20:00:00Z', 4, 0],
    [
      'late evening UTC is past midnight in Yerevan',
      '2026-08-08T21:30:00Z',
      0,
      90,
    ],
    ['one minute before Yerevan midnight', '2026-08-05T19:59:00Z', 3, 1439],
  ])('%s', (_label, instant, dayOfWeek, minutesSinceMidnight) => {
    expect(getBusinessWallClock(new Date(instant))).toEqual({
      dayOfWeek,
      minutesSinceMidnight,
    });
  });
});

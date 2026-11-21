import { describe, test, expect } from 'vitest';
import {
  buildReservationTimes,
  closingAfterMidnight,
} from './restaurantTimeSlots.js';

const day = (dayOfWeek, opensAt, closesAt, isClosed = false) => ({
  day_of_week: dayOfWeek,
  opens_at: opensAt,
  closes_at: closesAt,
  is_closed: isClosed,
});

// 2027-08-06 is a Friday (5), 2027-08-07 a Saturday (6), 2027-08-08 a Sunday (0).
const FRIDAY = '2027-08-06';
const SATURDAY = '2027-08-07';
const SUNDAY = '2027-08-08';
const EARLIER = new Date('2027-07-01T08:00:00Z');

describe('buildReservationTimes', () => {
  test('normal same-day hours: from opening, every half hour, closing minute excluded', () => {
    expect(
      buildReservationTimes([day(5, '12:00', '14:00')], FRIDAY, EARLIER),
    ).toEqual(['12:00', '12:30', '13:00', '13:30']);
  });

  test('a window ending exactly at midnight offers nothing after it', () => {
    const hours = [day(5, '22:00', '00:00')];
    expect(buildReservationTimes(hours, FRIDAY, EARLIER)).toEqual([
      '22:00',
      '22:30',
      '23:00',
      '23:30',
    ]);
    expect(buildReservationTimes(hours, SATURDAY, EARLIER)).toEqual([]);
  });

  test.each([
    ['00:30', ['00:00']],
    ['01:00', ['00:00', '00:30']],
    ['02:00', ['00:00', '00:30', '01:00', '01:30']],
  ])(
    'a Friday 22:00 window closing at %s: its after-midnight tail is on Saturday',
    (closesAt, saturdayTail) => {
      const hours = [day(5, '22:00', closesAt)];
      expect(buildReservationTimes(hours, FRIDAY, EARLIER)).toEqual([
        '22:00',
        '22:30',
        '23:00',
        '23:30',
      ]);
      expect(buildReservationTimes(hours, SATURDAY, EARLIER)).toEqual(
        saturdayTail,
      );
    },
  );

  test('the gap between the tail and the next opening is never offered', () => {
    const hours = [day(5, '22:00', '01:00'), day(6, '12:00', '13:00')];
    expect(buildReservationTimes(hours, SATURDAY, EARLIER)).toEqual([
      '00:00',
      '00:30',
      '12:00',
      '12:30',
    ]);
  });

  test('a next day that is closed still receives the previous night’s tail, and nothing else', () => {
    const hours = [day(6, '23:00', '01:00'), day(0, null, null, true)];
    expect(buildReservationTimes(hours, SUNDAY, EARLIER)).toEqual([
      '00:00',
      '00:30',
    ]);
  });

  test('a day without published hours, after a day that ends before midnight, has none', () => {
    expect(
      buildReservationTimes([day(5, '12:00', '22:00')], SATURDAY, EARLIER),
    ).toEqual([]);
  });

  test('an opening off the half hour steps from the opening itself', () => {
    expect(
      buildReservationTimes([day(5, '18:15', '19:30')], FRIDAY, EARLIER),
    ).toEqual(['18:15', '18:45', '19:15']);
  });

  test('today (Asia/Yerevan) leaves out times already past, the tail included', () => {
    // Saturday 2027-08-07 00:40 in Yerevan (UTC+4).
    const justAfterMidnight = new Date('2027-08-06T20:40:00Z');
    const hours = [day(5, '22:00', '02:00'), day(6, '12:00', '13:00')];
    expect(buildReservationTimes(hours, SATURDAY, justAfterMidnight)).toEqual([
      '01:00',
      '01:30',
      '12:00',
      '12:30',
    ]);
  });

  test('the local date is Asia/Yerevan’s, not the browser’s UTC date', () => {
    // 2027-08-06 21:20 UTC is already Saturday 01:20 in Yerevan.
    const lateUtc = new Date('2027-08-06T21:20:00Z');
    const hours = [day(5, '22:00', '02:00')];
    expect(buildReservationTimes(hours, SATURDAY, lateUtc)).toEqual(['01:30']);
  });

  test('no published hours at all is `null` (a free time field instead)', () => {
    expect(buildReservationTimes([], FRIDAY)).toBeNull();
    expect(buildReservationTimes(null, FRIDAY)).toBeNull();
  });

  test('no date chosen yet is no times', () => {
    expect(buildReservationTimes([day(5, '12:00', '14:00')], null)).toEqual([]);
  });
});

describe('closingAfterMidnight', () => {
  test('names the closing time of a window that runs past midnight', () => {
    expect(closingAfterMidnight([day(5, '18:00', '02:00')], FRIDAY)).toBe(
      '02:00',
    );
  });

  test('is null for same-day hours, a window ending at midnight, or no hours', () => {
    expect(closingAfterMidnight([day(5, '12:00', '22:00')], FRIDAY)).toBeNull();
    expect(closingAfterMidnight([day(5, '18:00', '00:00')], FRIDAY)).toBeNull();
    expect(closingAfterMidnight([], FRIDAY)).toBeNull();
    expect(closingAfterMidnight([day(5, '18:00', '02:00')], null)).toBeNull();
  });
});

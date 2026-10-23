/**
 * Step L6.2E — the booking timebase. Every instant here is a fixed UTC
 * value, so the results never depend on the machine's own timezone or
 * clock (the helpers convert to Asia/Yerevan through `Intl` themselves).
 */

import { describe, test, expect } from '@jest/globals';
import {
  BUSINESS_TIMEZONE,
  toBusinessDateTime,
  resolveBookingStart,
  isBookingStartInPast,
} from '../../../../src/core/domain/bookingTimebase.js';

// 2026-10-01 01:30 in Yerevan (UTC+4) is still 2026-09-30 in UTC.
const YEREVAN_0130_OCT_1 = new Date('2026-09-30T21:30:00.000Z');

// Calendar Excellence — the 00:00–04:00 window where the UTC date is still
// yesterday in Yerevan.
describe('toBusinessDateTime at the Yerevan midnight boundary', () => {
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
    expect(toBusinessDateTime(new Date(instant)).date).toBe(expected);
  });
});

describe('toBusinessDateTime', () => {
  test('the business timezone is Asia/Yerevan', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Yerevan');
  });

  test('uses the Yerevan calendar date, not the UTC one, across UTC midnight', () => {
    expect(toBusinessDateTime(YEREVAN_0130_OCT_1)).toEqual({
      date: '2026-10-01',
      time: '01:30:00',
    });
  });

  test('midnight is 00, never 24', () => {
    expect(toBusinessDateTime(new Date('2026-09-30T20:00:00.000Z'))).toEqual({
      date: '2026-10-01',
      time: '00:00:00',
    });
  });

  test('rejects an invalid instant', () => {
    expect(() => toBusinessDateTime(new Date('nope'))).toThrow(TypeError);
  });
});

describe('resolveBookingStart', () => {
  test('a vehicle or restaurant starts at the requested time', () => {
    expect(
      resolveBookingStart({
        unitTypeCode: 'VEHICLE',
        dateFrom: '2026-10-05',
        usesRequestedTime: true,
        requestedStartTime: '10:00',
      }),
    ).toEqual({ date: '2026-10-05', time: '10:00' });
  });

  test('a timed departure starts at its unit time slot; an untimed one is date-only', () => {
    expect(
      resolveBookingStart({
        unitTypeCode: 'TOUR_DEPARTURE',
        dateFrom: '2026-10-05',
        usesRequestedTime: false,
        unitTimeSlotStart: '09:00',
      }),
    ).toEqual({ date: '2026-10-05', time: '09:00' });
    expect(
      resolveBookingStart({
        unitTypeCode: 'TOUR_DEPARTURE',
        dateFrom: '2026-10-05',
        usesRequestedTime: false,
      }),
    ).toEqual({ date: '2026-10-05', time: null });
  });

  test('lodging is date-only — no check-in time is invented', () => {
    expect(
      resolveBookingStart({
        unitTypeCode: 'HOTEL_ROOM',
        dateFrom: '2026-10-05',
        usesRequestedTime: false,
        unitTimeSlotStart: '14:00',
      }),
    ).toEqual({ date: '2026-10-05', time: null });
  });
});

describe('isBookingStartInPast', () => {
  test.each([
    ['date-only yesterday (Yerevan) is past', '2026-09-30', null, true],
    [
      'date-only today (Yerevan) is not past, even though UTC is still yesterday',
      '2026-10-01',
      null,
      false,
    ],
    ['date-only tomorrow is not past', '2026-10-02', null, false],
    ['a timed start earlier today is past', '2026-10-01', '01:29', true],
    [
      'a timed start at this very minute is not past yet',
      '2026-10-01',
      '01:30',
      false,
    ],
    ['a timed start later today is not past', '2026-10-01', '09:00', false],
    [
      'a timed start yesterday late evening is past',
      '2026-09-30',
      '23:59',
      true,
    ],
  ])('%s', (_label, date, time, expected) => {
    expect(isBookingStartInPast({ date, time }, YEREVAN_0130_OCT_1)).toBe(
      expected,
    );
  });
});

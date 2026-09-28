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

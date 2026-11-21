import { describe, test, expect } from '@jest/globals';
import { isWithinOpeningHours } from '../../../../src/core/domain/openingHours.js';

const day = (dayOfWeek, opensAt, closesAt, isClosed = false) => ({
  dayOfWeek,
  opensAt,
  closesAt,
  isClosed,
});

// 2027-08-06 is a Friday (5); 2027-08-07 a Saturday (6); 2027-08-08 a Sunday (0).
const FRIDAY = '2027-08-06';
const SATURDAY = '2027-08-07';
const SUNDAY = '2027-08-08';

describe('isWithinOpeningHours', () => {
  test('normal same-day hours are half-open: opening minute in, closing minute out', () => {
    const hours = [day(5, '12:00', '22:00')];
    expect(isWithinOpeningHours(hours, FRIDAY, '12:00')).toBe(true);
    expect(isWithinOpeningHours(hours, FRIDAY, '21:59')).toBe(true);
    expect(isWithinOpeningHours(hours, FRIDAY, '22:00')).toBe(false);
    expect(isWithinOpeningHours(hours, FRIDAY, '11:59')).toBe(false);
  });

  test('a window ending exactly at midnight covers the evening and nothing after', () => {
    const hours = [day(5, '18:00', '00:00')];
    expect(isWithinOpeningHours(hours, FRIDAY, '23:30')).toBe(true);
    expect(isWithinOpeningHours(hours, SATURDAY, '00:00')).toBe(false);
  });

  test.each([
    ['00:30', '00:00', '00:30'],
    ['01:00', '00:30', '01:00'],
    ['02:00', '01:30', '02:00'],
  ])(
    'a Friday window closing at %s reaches into Saturday (last inside %s, first outside %s)',
    (closesAt, lastInside, firstOutside) => {
      const hours = [day(5, '18:00', closesAt)];
      expect(isWithinOpeningHours(hours, FRIDAY, '18:00')).toBe(true);
      expect(isWithinOpeningHours(hours, FRIDAY, '23:59')).toBe(true);
      expect(isWithinOpeningHours(hours, SATURDAY, lastInside)).toBe(true);
      expect(isWithinOpeningHours(hours, SATURDAY, firstOutside)).toBe(false);
      // The tail belongs to the next calendar date, never to Friday morning.
      expect(isWithinOpeningHours(hours, FRIDAY, lastInside)).toBe(false);
    },
  );

  test('the gap between the overnight tail and the next opening is closed', () => {
    const hours = [day(5, '18:00', '02:00'), day(6, '12:00', '23:00')];
    expect(isWithinOpeningHours(hours, SATURDAY, '01:30')).toBe(true);
    expect(isWithinOpeningHours(hours, SATURDAY, '02:00')).toBe(false);
    expect(isWithinOpeningHours(hours, SATURDAY, '11:30')).toBe(false);
    expect(isWithinOpeningHours(hours, SATURDAY, '12:00')).toBe(true);
  });

  test('the next day opens on its own schedule; a closed or unpublished day has no window', () => {
    const hours = [day(5, '18:00', '02:00'), day(6, '00:00', '00:00', true)];
    expect(isWithinOpeningHours(hours, SATURDAY, '01:00')).toBe(true);
    expect(isWithinOpeningHours(hours, SATURDAY, '19:00')).toBe(false);
    expect(isWithinOpeningHours(hours, SUNDAY, '19:00')).toBe(false);
  });

  test('Saturday into Sunday wraps the week (6 → 0)', () => {
    const hours = [day(6, '20:00', '03:00')];
    expect(isWithinOpeningHours(hours, SUNDAY, '02:59')).toBe(true);
    expect(isWithinOpeningHours(hours, SUNDAY, '03:00')).toBe(false);
  });

  test('equal opening and closing times is a 24-hour window', () => {
    const hours = [day(5, '00:00', '00:00')];
    expect(isWithinOpeningHours(hours, FRIDAY, '00:00')).toBe(true);
    expect(isWithinOpeningHours(hours, FRIDAY, '23:59')).toBe(true);
  });

  test('seconds on the reservation time are ignored', () => {
    expect(
      isWithinOpeningHours([day(5, '12:00', '22:00')], FRIDAY, '21:59:59'),
    ).toBe(true);
  });
});

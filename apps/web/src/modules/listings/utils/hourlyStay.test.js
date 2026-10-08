import { describe, test, expect } from 'vitest';
import {
  parseWholeHour,
  formatHour,
  isHourlyRoom,
  toHourlyRules,
  startHourOptions,
  endHourOptions,
  remainingForInterval,
} from './hourlyStay.js';

const RULES = { fromHour: 10, untilHour: 20, minHours: 2, maxHours: 6 };

function slot(hour, status = 'AVAILABLE', remaining = null) {
  return {
    start_time: formatHour(hour),
    end_time: formatHour(hour + 1),
    status,
    remaining_count: remaining,
  };
}

describe('Step L6.3B — client hourly stay helpers', () => {
  test('parses only whole hours, 24:00 included', () => {
    expect(parseWholeHour('14:00')).toBe(14);
    expect(parseWholeHour('24:00')).toBe(24);
    expect(parseWholeHour('14:30')).toBeNull();
    expect(parseWholeHour(undefined)).toBeNull();
    expect(formatHour(9)).toBe('09:00');
  });

  test('only an enabled HOTEL_ROOM is an hourly room', () => {
    expect(
      isHourlyRoom({ bookable_unit_type: 'HOTEL_ROOM', hourly_enabled: true }),
    ).toBe(true);
    expect(
      isHourlyRoom({ bookable_unit_type: 'HOTEL_ROOM', hourly_enabled: false }),
    ).toBe(false);
    expect(
      isHourlyRoom({
        bookable_unit_type: 'PROPERTY_UNIT',
        hourly_enabled: true,
      }),
    ).toBe(false);
    expect(isHourlyRoom(null)).toBe(false);
  });

  test('reads a room’s rules from its public fields', () => {
    expect(
      toHourlyRules({
        hourly_min_duration_hours: 2,
        hourly_max_duration_hours: 6,
        hourly_available_from: '10:00',
        hourly_available_until: '20:00',
      }),
    ).toEqual(RULES);
  });

  test('start hours leave room for the minimum stay inside the window', () => {
    expect(startHourOptions(RULES)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  test('end hours run from the minimum to the maximum, never past the window', () => {
    expect(endHourOptions(10, RULES)).toEqual([12, 13, 14, 15, 16]);
    expect(endHourOptions(16, RULES)).toEqual([18, 19, 20]);
  });

  test('the free rooms for an interval are its tightest hour', () => {
    const slots = [slot(10), slot(11, 'LOW', 2), slot(12, 'LOW', 1), slot(13)];
    expect(remainingForInterval(slots, 10, 12)).toBe(2);
    expect(remainingForInterval(slots, 10, 13)).toBe(1);
    expect(remainingForInterval([slot(10), slot(11)], 10, 12)).toBeNull();
  });

  test('a sold-out, started or missing hour leaves nothing free', () => {
    expect(remainingForInterval([slot(10), slot(11, 'SOLD_OUT')], 10, 12)).toBe(
      0,
    );
    expect(remainingForInterval([slot(10, 'PAST'), slot(11)], 10, 12)).toBe(0);
    expect(remainingForInterval([slot(10)], 10, 12)).toBe(0);
  });
});

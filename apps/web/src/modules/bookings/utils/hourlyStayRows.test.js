import { describe, test, expect } from 'vitest';
import { isHourlyItem, hourlyStayRows } from './hourlyStayRows.js';

const t = (key, values) => (values ? `${key}:${JSON.stringify(values)}` : key);

const ITEM = {
  booking_mode: 'HOURLY',
  date_from: '2027-08-01',
  date_to: '2027-08-01',
  start_time: '14:00',
  end_time: '18:00',
  quantity: 2,
  guest_count: 3,
};

describe('Step L6.3B — hourly stay rows', () => {
  test('only an HOURLY item is an hourly stay', () => {
    expect(isHourlyItem(ITEM)).toBe(true);
    expect(isHourlyItem({ booking_mode: 'NIGHTLY' })).toBe(false);
    expect(isHourlyItem({ booking_mode: null })).toBe(false);
  });

  test('reads as type, date, start, end, duration, rooms and guests — never nights', () => {
    const rows = hourlyStayRows(t, ITEM, { formatDate: (date) => `[${date}]` });
    expect(rows.map((row) => [row.key, row.value])).toEqual([
      ['type', 'bookings.hourly.hourlyStay'],
      ['date', '[2027-08-01]'],
      ['start', '14:00'],
      ['end', '18:00'],
      ['duration', 'bookings.hourly.hoursCount:{"count":4}'],
      ['rooms', '2'],
      ['guests', '3'],
    ]);
  });

  test('rooms and guests can be left to the page’s own rows', () => {
    const keys = hourlyStayRows(t, ITEM, { includeRoomsAndGuests: false }).map(
      (row) => row.key,
    );
    expect(keys).toEqual(['type', 'date', 'start', 'end', 'duration']);
  });

  test('an item without a recorded guest count has no guests row', () => {
    const keys = hourlyStayRows(t, { ...ITEM, guest_count: null }).map(
      (row) => row.key,
    );
    expect(keys).not.toContain('guests');
  });
});

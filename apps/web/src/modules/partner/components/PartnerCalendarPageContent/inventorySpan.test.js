import { describe, test, expect } from 'vitest';
import {
  describeInventorySpan,
  exceedsMaxDateSpan,
  MAX_DATE_SPAN_DAYS,
} from './inventorySpan.js';

describe('describeInventorySpan (apps/web/src/modules/partner)', () => {
  test.each([
    ['HOTEL_ROOM', '2026-10-24', '2026-10-25', { unit: 'nights', count: 1 }],
    ['PROPERTY_UNIT', '2026-10-24', '2026-10-31', { unit: 'nights', count: 7 }],
    // A same-day accommodation block is one whole day, never zero nights.
    ['HOTEL_ROOM', '2026-10-24', '2026-10-24', { unit: 'days', count: 1 }],
    ['TOUR_DEPARTURE', '2026-10-24', '2026-10-25', { unit: 'days', count: 2 }],
    ['VEHICLE', '2026-10-31', '2026-11-02', { unit: 'days', count: 3 }],
    [
      'RESTAURANT_TABLE',
      '2026-10-24',
      '2026-10-24',
      { unit: 'days', count: 1 },
    ],
  ])('%s %s – %s takes %o', (unitType, from, to, expected) => {
    expect(describeInventorySpan(unitType, from, to)).toEqual(expected);
  });
});

describe('exceedsMaxDateSpan', () => {
  test('a range ending exactly a year (366 days) later is allowed, one more day is not', () => {
    expect(MAX_DATE_SPAN_DAYS).toBe(366);
    expect(exceedsMaxDateSpan('2026-01-01', '2027-01-02')).toBe(false);
    expect(exceedsMaxDateSpan('2026-01-01', '2027-01-03')).toBe(true);
  });
});

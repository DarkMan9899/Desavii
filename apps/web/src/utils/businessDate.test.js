import { describe, test, expect } from 'vitest';
import { BUSINESS_TIMEZONE, getBusinessToday } from './businessDate.js';

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

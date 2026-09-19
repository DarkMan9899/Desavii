import { describe, test, expect } from 'vitest';
import { formatCount, formatPercent, formatDay } from './formatters.js';

describe('partnerAnalytics formatters (apps/web/src/modules/partnerAnalytics) — brief §17/§18', () => {
  test('formatCount renders a locale-formatted integer', () => {
    expect(formatCount(1234, 'en')).toBe('1,234');
  });

  test('formatCount renders an em dash for a missing value, never NaN/undefined text', () => {
    expect(formatCount(null, 'en')).toBe('—');
    expect(formatCount(undefined, 'en')).toBe('—');
  });

  test('formatPercent converts a 0..1 ratio to a percentage string, at most 2 decimals', () => {
    expect(formatPercent(0.2134, 'en')).toBe('21.34%');
    expect(formatPercent(0.15, 'en')).toBe('15%');
  });

  test('formatPercent never renders a meaningless 0.0000% — capped at 2 decimals', () => {
    expect(formatPercent(0.213456789, 'en')).toBe('21.35%');
  });

  test('formatPercent renders an em dash for a missing value', () => {
    expect(formatPercent(null, 'en')).toBe('—');
  });

  test('formatDay parses a bare YYYY-MM-DD as a calendar date, immune to viewer UTC-offset shift', () => {
    // Regression precedent: dateFormat.js's own documented mysql2 gotcha —
    // `new Date('2026-08-24')` would render as 2026-08-23 in a
    // negative-UTC-offset timezone. This must not reproduce that.
    expect(formatDay('2026-08-24', 'en')).toBe('Aug 24');
  });
});

import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { formatDurationLabel } from './formatDuration.js';

const t = i18n.getFixedT('en');

describe('formatDurationLabel', () => {
  test('whole hours read as hours', () => {
    expect(formatDurationLabel(60, t)).toBe(
      t('search.card.durationHours', { count: 1 }),
    );
    expect(formatDurationLabel(180, t)).toBe(
      t('search.card.durationHours', { count: 3 }),
    );
  });

  test('anything else reads as minutes', () => {
    expect(formatDurationLabel(45, t)).toBe(
      t('search.card.durationMinutes', { count: 45 }),
    );
    expect(formatDurationLabel(90, t)).toBe(
      t('search.card.durationMinutes', { count: 90 }),
    );
  });

  test('the English copy is short and specific', () => {
    expect(formatDurationLabel(120, t)).toBe('2h');
    expect(formatDurationLabel(90, t)).toBe('90 min');
  });
});

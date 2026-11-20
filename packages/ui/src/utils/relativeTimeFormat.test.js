import { describe, test, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from './relativeTimeFormat.js';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const HOUR_MS = 3600000;
const DAY_MS = 86400000;

/** Simulates a browser whose ICU data has no Armenian (desktop Google Chrome). */
function withoutIntlLocales(missing) {
  const original = Intl.RelativeTimeFormat.supportedLocalesOf;
  vi.spyOn(Intl.RelativeTimeFormat, 'supportedLocalesOf').mockImplementation(
    (locales, ...rest) =>
      original(locales, ...rest).filter(
        (locale) => !missing.includes(locale.split('-')[0]),
      ),
  );
}

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('Armenian stays Armenian when Intl lacks it — never English', () => {
    withoutIntlLocales(['hy']);
    const twoHoursAgo = new Date(NOW.getTime() - 2 * HOUR_MS);
    expect(formatRelativeTime(twoHoursAgo, 'hy', NOW)).toBe('2 ժամ առաջ');
    expect(
      formatRelativeTime(new Date(NOW.getTime() - 3 * DAY_MS), 'hy', NOW),
    ).toBe('3 օր առաջ');
    expect(
      formatRelativeTime(new Date(NOW.getTime() + 2 * DAY_MS), 'hy', NOW),
    ).toBe('2 օր հետո');
    expect(formatRelativeTime(twoHoursAgo, 'hy', NOW)).not.toMatch(/ago/);
  });

  test('a just-now moment falls back to seconds in Armenian too', () => {
    withoutIntlLocales(['hy']);
    expect(formatRelativeTime(new Date(NOW.getTime() - 30000), 'hy', NOW)).toBe(
      '30 վայրկյան առաջ',
    );
  });

  test('locales Intl supports keep their exact Intl output', () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60000);
    const yesterday = new Date(NOW.getTime() - DAY_MS);
    expect(formatRelativeTime(fiveMinutesAgo, 'en', NOW)).toBe('5 minutes ago');
    expect(formatRelativeTime(yesterday, 'en', NOW)).toBe('yesterday');
    expect(formatRelativeTime(yesterday, 'ru', NOW)).toBe('вчера');
  });

  test('accepts an ISO string and defaults "now" to the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(formatRelativeTime('2026-11-18T12:00:00.000Z', 'en')).toBe(
      '2 days ago',
    );
  });
});

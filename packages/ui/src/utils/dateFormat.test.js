import { describe, test, expect, vi, afterEach } from 'vitest';
import { createDateFormatter } from './dateFormat.js';

const NOV_20 = new Date(2026, 10, 20);

/** Simulates a browser whose ICU data has no Armenian (e.g. some Chromium builds). */
function withoutIntlLocales(missing) {
  const original = Intl.DateTimeFormat.supportedLocalesOf;
  vi.spyOn(Intl.DateTimeFormat, 'supportedLocalesOf').mockImplementation(
    (locales, ...rest) =>
      original(locales, ...rest).filter(
        (locale) => !missing.includes(locale.split('-')[0]),
      ),
  );
}

describe('createDateFormatter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Armenian stays Armenian when Intl lacks it — never English', () => {
    withoutIntlLocales(['hy']);
    const short = createDateFormatter('hy', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(short.format(NOV_20)).toBe('20 նոյ, 2026');
    expect(short.format(NOV_20)).not.toMatch(/Nov/);
    expect(
      createDateFormatter('hy', { month: 'long', year: 'numeric' }).format(
        NOV_20,
      ),
    ).toBe('նոյեմբեր 2026');
    expect(
      createDateFormatter('hy', { weekday: 'short' }).format(
        new Date(1970, 0, 4),
      ),
    ).toBe('կիր');
  });

  test('a UTC calendar day keeps its day in the fallback, and ranges join with a dash', () => {
    withoutIntlLocales(['hy']);
    const formatter = createDateFormatter('hy', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    expect(
      formatter.formatRange(
        new Date('2026-11-20T00:00:00Z'),
        new Date('2026-11-23T00:00:00Z'),
      ),
    ).toBe('20 նոյ – 23 նոյ');
  });

  test('the Partner calendar week and day headings stay Armenian on the same UTC day', () => {
    withoutIntlLocales(['hy']);
    const friday = new Date('2026-11-20T00:00:00Z');
    const weekday = createDateFormatter('hy', {
      weekday: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(friday);
    const heading = createDateFormatter('hy', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(friday);
    expect(weekday).toMatch(/20$/);
    expect(weekday).not.toMatch(/Fri/);
    expect(heading).toMatch(/ուրբաթ/);
    expect(heading).toMatch(/20/);
    expect(heading).toMatch(/2026/);
  });

  test('locales Intl supports keep their exact Intl output', () => {
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    ['en', 'ru'].forEach((locale) => {
      expect(createDateFormatter(locale, options).format(NOV_20)).toBe(
        new Intl.DateTimeFormat(locale, options).format(NOV_20),
      );
    });
  });

  test('an option set with no fallback pattern keeps plain Intl', () => {
    withoutIntlLocales(['hy']);
    const options = { hour: 'numeric', minute: '2-digit' };
    expect(createDateFormatter('hy', options).format(NOV_20)).toBe(
      new Intl.DateTimeFormat('hy', options).format(NOV_20),
    );
  });
});

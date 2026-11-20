import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  createDateFormatter,
  NUMERIC_DATE,
  NUMERIC_DATE_TIME,
} from './dateFormat.js';

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

  test('booking, review and admin-table option sets stay Armenian when Intl lacks it', () => {
    withoutIntlLocales(['hy']);
    const evening = new Date(2026, 10, 25, 17, 27, 9);
    const cases = [
      [{ dateStyle: 'medium' }, '25 նոյ, 2026'],
      [{ dateStyle: 'medium', timeStyle: 'short' }, '25 նոյ, 2026, 17:27'],
      [NUMERIC_DATE, '25.11.2026'],
      [NUMERIC_DATE_TIME, '25.11.2026, 17:27:09'],
      [{ year: 'numeric' }, '2026'],
    ];
    cases.forEach(([options, expected]) => {
      expect(createDateFormatter('hy', options).format(evening)).toBe(expected);
    });
    expect(
      createDateFormatter('hy', { weekday: 'long', timeZone: 'UTC' }).format(
        new Date('1970-01-05T00:00:00Z'),
      ),
    ).toBe('երկուշաբթի');
  });

  test('the numeric presets reproduce toLocaleDateString / toLocaleString exactly', () => {
    const evening = new Date(2026, 10, 25, 17, 27, 9);
    ['en', 'ru', 'hy'].forEach((locale) => {
      expect(createDateFormatter(locale, NUMERIC_DATE).format(evening)).toBe(
        evening.toLocaleDateString(locale),
      );
      expect(
        createDateFormatter(locale, NUMERIC_DATE_TIME).format(evening),
      ).toBe(evening.toLocaleString(locale));
    });
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

import { describe, test, expect, vi, afterEach } from 'vitest';
import { createNumberFormatter } from './numberFormat.js';

const NBSP = ' ';

/** Simulates a browser whose ICU data has no Armenian (e.g. desktop Chrome). */
function withoutIntlLocales(missing) {
  const original = Intl.NumberFormat.supportedLocalesOf;
  vi.spyOn(Intl.NumberFormat, 'supportedLocalesOf').mockImplementation(
    (locales, ...rest) =>
      original(locales, ...rest).filter(
        (locale) => !missing.includes(locale.split('-')[0]),
      ),
  );
}

/** Every option set the web app and `PriceTag` format numbers with. */
const APP_OPTION_SETS = [
  {},
  { maximumFractionDigits: 1 },
  { maximumFractionDigits: 2 },
  { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 },
  {
    style: 'currency',
    currency: 'AMD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  },
  {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  },
  { style: 'currency', currency: 'RUB', currencyDisplay: 'narrowSymbol' },
];

describe('createNumberFormatter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('Armenian keeps Armenian separators when Intl lacks it — never en-US', () => {
    withoutIntlLocales(['hy']);
    const formatter = createNumberFormatter('hy');
    expect(formatter.format(12345.6)).toBe(`12${NBSP}345,6`);
    expect(formatter.format(1234567)).toBe(`1${NBSP}234${NBSP}567`);
    expect(formatter.format(-12345.6)).toBe(`-12${NBSP}345,6`);
    expect(formatter.format(0)).toBe('0');
  });

  test('Armenian money places the symbol after the amount', () => {
    withoutIntlLocales(['hy']);
    const amd = createNumberFormatter('hy', {
      style: 'currency',
      currency: 'AMD',
      currencyDisplay: 'narrowSymbol',
    });
    expect(amd.format(37000)).toBe(`37${NBSP}000,00${NBSP}֏`);
    expect(amd.format('37000.00')).toBe(`37${NBSP}000,00${NBSP}֏`);
    expect(amd.format(-37000)).toBe(`-37${NBSP}000,00${NBSP}֏`);
    expect(
      createNumberFormatter('hy', {
        style: 'currency',
        currency: 'RUB',
        currencyDisplay: 'narrowSymbol',
      }).format(12500.5),
    ).toBe(`12${NBSP}500,50${NBSP}₽`);
  });

  test('currency display follows CLDR inheritance: narrow → symbol → code', () => {
    withoutIntlLocales(['hy']);
    const rub = (currencyDisplay) =>
      createNumberFormatter('hy', {
        style: 'currency',
        currency: 'RUB',
        currencyDisplay,
      }).format(10000);
    expect(rub('narrowSymbol')).toBe(`10${NBSP}000,00${NBSP}₽`);
    expect(rub('symbol')).toBe(`10${NBSP}000,00${NBSP}RUB`);
    expect(rub('code')).toBe(`10${NBSP}000,00${NBSP}RUB`);
  });

  test('percent, fraction-digit and grouping options are honored', () => {
    withoutIntlLocales(['hy']);
    expect(
      createNumberFormatter('hy', {
        style: 'percent',
        maximumFractionDigits: 2,
      }).format(0.2134),
    ).toBe('21,34%');
    expect(
      createNumberFormatter('hy', { maximumFractionDigits: 1 }).format(4.5),
    ).toBe('4,5');
    expect(
      createNumberFormatter('hy', { useGrouping: false }).format(12345.6),
    ).toBe('12345,6');
  });

  test('grouping starts at the CLDR minimum grouping digits', () => {
    withoutIntlLocales(['hy']);
    // CLDR 49's Armenian `minimumGroupingDigits` is 2: a four-digit
    // integer stays ungrouped, five digits and up are grouped.
    const formatter = createNumberFormatter('hy');
    expect(formatter.format(1234)).toBe('1234');
    expect(formatter.format(12345)).toBe(`12${NBSP}345`);
  });

  test('matches full-ICU Armenian output for every option set the app uses', () => {
    const samples = [12345.678, 37000, -98765.4, 0.4567, 250000];
    const expected = APP_OPTION_SETS.map((options) =>
      samples.map((value) =>
        new Intl.NumberFormat('hy', options).format(value),
      ),
    );
    withoutIntlLocales(['hy']);
    const actual = APP_OPTION_SETS.map((options) =>
      samples.map((value) =>
        createNumberFormatter('hy', options).format(value),
      ),
    );
    expect(actual).toEqual(expected);
  });

  test.each(['en', 'ru', 'hy'])(
    'a locale Intl supports (%s) goes straight through Intl',
    (locale) => {
      const options = { style: 'currency', currency: 'AMD' };
      expect(createNumberFormatter(locale, options).format(37000)).toBe(
        new Intl.NumberFormat(locale, options).format(37000),
      );
    },
  );

  test('an option set without a CLDR rebuild keeps plain Intl', () => {
    withoutIntlLocales(['hy']);
    const options = { notation: 'compact' };
    expect(createNumberFormatter('hy', options).format(37000)).toBe(
      new Intl.NumberFormat('hy', options).format(37000),
    );
  });

  test('a missing locale without bundled CLDR data keeps plain Intl', () => {
    withoutIntlLocales(['ka']);
    expect(createNumberFormatter('ka').format(12345.6)).toBe(
      new Intl.NumberFormat('ka').format(12345.6),
    );
  });
});

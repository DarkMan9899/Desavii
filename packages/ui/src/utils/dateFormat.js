/**
 * createDateFormatter — locale-correct date text everywhere a date is
 * shown, including Armenian on browsers whose ICU data lacks it.
 *
 * `Intl.DateTimeFormat` is the first choice. Desktop Google Chrome (checked
 * on 157) ships ICU without Armenian, and `Intl` then falls back to the
 * visitor's browser language without an error: an Armenian page read
 * "Nov 20, 2026", "20 нояб. 2026 г." or "2026 M11 20" depending on that
 * language. When the requested locale is missing from `Intl` but
 * `date-fns` carries it, the same option set is rendered through
 * `date-fns`'s maintained locale data instead — no month or weekday name
 * is ever written here. Locales `Intl` does support are untouched.
 *
 * Only the option sets this design system actually uses have a `date-fns`
 * equivalent; any other set keeps plain `Intl`. Call sites that used
 * `Date#toLocaleDateString` / `Date#toLocaleString` pass the
 * `NUMERIC_DATE` / `NUMERIC_DATE_TIME` presets, which `Intl` renders
 * exactly as those methods do.
 */

import { format as formatWithDateFns } from 'date-fns';
import { enUS, hy, ru } from 'date-fns/locale';

const DATE_FNS_LOCALES = { en: enUS, hy, ru };

/** `Date#toLocaleDateString`'s implicit option set, made explicit. */
export const NUMERIC_DATE = Object.freeze({
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

/** `Date#toLocaleString`'s implicit option set, made explicit. */
export const NUMERIC_DATE_TIME = Object.freeze({
  ...NUMERIC_DATE,
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** `Intl` option sets (minus `timeZone`) → the equivalent `date-fns` pattern. */
const PATTERNS = {
  'weekday:short': 'EEE',
  'weekday:long': 'EEEE',
  'year:numeric': 'yyyy',
  'month:long|year:numeric': 'LLLL yyyy',
  'day:numeric|month:short|year:numeric': 'PP',
  'day:numeric|month:short': 'd MMM',
  'day:numeric|month:long|year:numeric': 'PPP',
  'day:numeric|weekday:short': 'EEE d',
  'day:numeric|month:long|weekday:long|year:numeric': 'PPPP',
  'dateStyle:medium': 'PP',
  'dateStyle:medium|timeStyle:short': 'PPp',
  'day:numeric|month:numeric|year:numeric': 'P',
  'day:numeric|hour:numeric|minute:numeric|month:numeric|second:numeric|year:numeric':
    'Ppp',
};

const RANGE_SEPARATOR = ' – ';

function patternKey(options) {
  return Object.keys(options)
    .filter((key) => key !== 'timeZone')
    .sort()
    .map((key) => `${key}:${options[key]}`)
    .join('|');
}

function isSupportedByIntl(locale) {
  return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
}

/**
 * @param {string} locale - a BCP 47 tag such as `hy`, `ru`, `en`
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {{ format: (date: Date) => string, formatRange: (start: Date, end: Date) => string }}
 */
export function createDateFormatter(locale, options = {}) {
  const language = String(locale).split('-')[0];
  const dateFnsLocale = DATE_FNS_LOCALES[language];
  const pattern = PATTERNS[patternKey(options)];

  if (isSupportedByIntl(locale) || !dateFnsLocale || !pattern) {
    const formatter = new Intl.DateTimeFormat(locale, options);
    return {
      format: (date) => formatter.format(date),
      formatRange: (start, end) => formatter.formatRange(start, end),
    };
  }

  // `date-fns` formats in local time; a UTC-pinned date (a `YYYY-MM-DD`
  // calendar day) keeps its own day by reading its UTC parts.
  const toLocalDay = (date) =>
    options.timeZone === 'UTC'
      ? new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      : date;
  const format = (date) =>
    formatWithDateFns(toLocalDay(date), pattern, { locale: dateFnsLocale });
  return {
    format,
    formatRange: (start, end) =>
      `${format(start)}${RANGE_SEPARATOR}${format(end)}`,
  };
}

export default createDateFormatter;

/**
 * createDateFormatter — locale-correct date text everywhere a date is
 * shown, including Armenian on browsers whose ICU data lacks it.
 *
 * `Intl.DateTimeFormat` is the first choice. Some browsers (Chromium
 * builds among them) ship ICU without Armenian, and `Intl` then falls back
 * to English without an error: an Armenian visitor read "Nov 20, 2026".
 * When the requested locale is missing from `Intl` but `date-fns` carries
 * it, the same option set is rendered through `date-fns`'s maintained
 * locale data instead — no month or weekday name is ever written here.
 * Locales `Intl` does support are untouched.
 *
 * Only the option sets this design system actually uses have a `date-fns`
 * equivalent; any other set keeps plain `Intl`.
 */

import { format as formatWithDateFns } from 'date-fns';
import { enUS, hy, ru } from 'date-fns/locale';

const DATE_FNS_LOCALES = { en: enUS, hy, ru };

/** `Intl` option sets (minus `timeZone`) → the equivalent `date-fns` pattern. */
const PATTERNS = {
  'weekday:short': 'EEE',
  'month:long|year:numeric': 'LLLL yyyy',
  'day:numeric|month:short|year:numeric': 'PP',
  'day:numeric|month:short': 'd MMM',
  'day:numeric|month:long|year:numeric': 'PPP',
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

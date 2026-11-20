/**
 * createNumberFormatter — locale-correct numbers, percentages and money
 * everywhere a number is shown, including Armenian on browsers whose ICU
 * data lacks it. The number counterpart of `createDateFormatter`.
 *
 * `Intl.NumberFormat` is the first choice. Some browsers (desktop Chrome
 * among them) ship ICU without Armenian, and `Intl` then falls back to
 * English without an error: an Armenian visitor read "֏37,000.00" instead
 * of "37 000,00 ֏". When the requested locale is missing from `Intl` but
 * Unicode CLDR data for it is bundled here, the number is still rounded by
 * `Intl` (in a reference locale every engine carries, without grouping)
 * and then rebuilt with the requested locale's own CLDR symbols, grouping
 * rule and pattern — no separator, symbol or pattern is ever written here.
 * Locales `Intl` does support are untouched.
 *
 * Only the option set this design system actually uses has a CLDR
 * rebuild (`decimal`/`percent`/`currency` styles, fraction and integer
 * digits, on/off grouping); any other option set keeps plain `Intl`.
 */

import hyNumbers from 'cldr-numbers-full/main/hy/numbers.json';
import hyCurrencies from 'cldr-numbers-full/main/hy/currencies.json';

/** Languages some shipped browsers omit from `Intl`, with their CLDR data. */
const CLDR_LOCALES = {
  hy: {
    numbers: hyNumbers.main.hy.numbers,
    currencies: hyCurrencies.main.hy.numbers.currencies,
  },
};

/** A locale every `Intl` implementation carries; only its rounding is used. */
const REFERENCE_LOCALE = 'en';

const NUMBERING_SYSTEM = 'latn';

const SUPPORTED_OPTIONS = new Set([
  'style',
  'currency',
  'currencyDisplay',
  'minimumIntegerDigits',
  'minimumFractionDigits',
  'maximumFractionDigits',
  'useGrouping',
]);

const SUPPORTED_STYLES = new Set(['decimal', 'percent', 'currency']);

const SUPPORTED_CURRENCY_DISPLAYS = new Set(['symbol', 'narrowSymbol', 'code']);

/** `prefix`, digit pattern, `suffix` of a CLDR pattern such as `#,##0.00 ¤`. */
const PATTERN_PARTS = /^([^#0,.]*)([#0,.]+)([^#0,.]*)$/;

const CURRENCY_PLACEHOLDER = '¤';
const PERCENT_PLACEHOLDER = '%';

function isSupportedByIntl(locale) {
  return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
}

function hasCldrRebuild(options) {
  return (
    Object.keys(options).every((key) => SUPPORTED_OPTIONS.has(key)) &&
    SUPPORTED_STYLES.has(options.style ?? 'decimal') &&
    SUPPORTED_CURRENCY_DISPLAYS.has(options.currencyDisplay ?? 'symbol') &&
    [undefined, true, false].includes(options.useGrouping)
  );
}

/**
 * Splits a CLDR pattern into its affixes and grouping sizes. Returns
 * `null` for a pattern this rebuild does not cover (an explicit negative
 * sub-pattern or quoted literal text), which then keeps plain `Intl`.
 */
function parsePattern(pattern) {
  const match = PATTERN_PARTS.exec(pattern);
  if (!match || pattern.includes(';') || pattern.includes("'")) return null;
  const [, prefix, digits, suffix] = match;
  const integerGroups = digits.split('.')[0].split(',');
  const primary = integerGroups[integerGroups.length - 1].length;
  const secondary =
    integerGroups.length > 2
      ? integerGroups[integerGroups.length - 2].length
      : primary;
  return { prefix, suffix, primary, secondary };
}

function groupDigits(digits, { primary, secondary, minimum }, separator) {
  if (digits.length < primary + minimum) return digits;
  const groups = [digits.slice(-primary)];
  let rest = digits.slice(0, -primary);
  while (rest.length > secondary) {
    groups.unshift(rest.slice(-secondary));
    rest = rest.slice(0, -secondary);
  }
  groups.unshift(rest);
  return groups.join(separator);
}

/** CLDR inheritance: a missing narrow symbol uses the symbol, then the code. */
function currencySymbol(currencies, code, display) {
  const entry = currencies[code] ?? {};
  if (display === 'code') return code;
  if (display === 'narrowSymbol') {
    return entry['symbol-alt-narrow'] ?? entry.symbol ?? code;
  }
  return entry.symbol ?? code;
}

function cldrPattern(numbers, style) {
  const key = {
    decimal: 'decimalFormats',
    percent: 'percentFormats',
    currency: 'currencyFormats',
  }[style];
  return numbers[`${key}-numberSystem-${NUMBERING_SYSTEM}`].standard;
}

function createCldrFormatter(cldr, options) {
  const style = options.style ?? 'decimal';
  const pattern = parsePattern(cldrPattern(cldr.numbers, style));
  if (!pattern) return null;

  const symbols = cldr.numbers[`symbols-numberSystem-${NUMBERING_SYSTEM}`];
  const grouping = {
    primary: pattern.primary,
    secondary: pattern.secondary,
    minimum: Number(cldr.numbers.minimumGroupingDigits),
  };
  const currency =
    style === 'currency'
      ? currencySymbol(
          cldr.currencies,
          String(options.currency).toUpperCase(),
          options.currencyDisplay ?? 'symbol',
        )
      : '';
  const localizeAffix = (affix) =>
    affix
      .replace(CURRENCY_PLACEHOLDER, currency)
      .replace(PERCENT_PLACEHOLDER, symbols.percentSign);
  const prefix = localizeAffix(pattern.prefix);
  const suffix = localizeAffix(pattern.suffix);

  const reference = new Intl.NumberFormat(REFERENCE_LOCALE, {
    ...options,
    useGrouping: false,
  });

  const localizePart = ({ type, value }) => {
    switch (type) {
      case 'integer':
        return options.useGrouping === false
          ? value
          : groupDigits(value, grouping, symbols.group);
      case 'decimal':
        return symbols.decimal;
      case 'fraction':
        return value;
      case 'nan':
        return symbols.nan;
      case 'infinity':
        return symbols.infinity;
      default:
        return '';
    }
  };

  return {
    format(value) {
      const parts = reference.formatToParts(value);
      const sign = parts
        .map(({ type }) => {
          if (type === 'minusSign') return symbols.minusSign;
          if (type === 'plusSign') return symbols.plusSign;
          return '';
        })
        .join('');
      const number = parts.map(localizePart).join('');
      return `${sign}${prefix}${number}${suffix}`;
    },
  };
}

/**
 * @param {string} locale - a BCP 47 tag such as `hy`, `ru`, `en`
 * @param {Intl.NumberFormatOptions} [options]
 * @returns {{ format: (value: number|string) => string }}
 */
export function createNumberFormatter(locale, options = {}) {
  const cldr = CLDR_LOCALES[String(locale).split('-')[0]];
  const fallback =
    !isSupportedByIntl(locale) && cldr && hasCldrRebuild(options)
      ? createCldrFormatter(cldr, options)
      : null;
  if (fallback) return fallback;

  const formatter = new Intl.NumberFormat(locale, options);
  return { format: (value) => formatter.format(value) };
}

export default createNumberFormatter;

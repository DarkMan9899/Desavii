/**
 * formatRelativeTime — locale-correct "2 hours ago" text, including
 * Armenian on browsers whose ICU data lacks it.
 *
 * `Intl.RelativeTimeFormat` is the first choice. Desktop Google Chrome
 * (checked on 157) ships ICU without Armenian, and `Intl` then answers in
 * the visitor's browser language ("2 hours ago", "2 часа назад") without
 * an error. When the requested locale is missing from `Intl` but
 * `date-fns` carries it, the same unit and value are rendered through
 * `date-fns`'s maintained locale data instead ("2 ժամ առաջ") — no unit
 * name is ever written here. Locales `Intl` does support are untouched.
 */

import { formatDistanceStrict } from 'date-fns';
import { enUS, hy, ru } from 'date-fns/locale';

const DATE_FNS_LOCALES = { en: enUS, hy, ru };

const MS_PER_SECOND = 1000;

/** Largest unit first: the first one the elapsed time reaches is used. */
const UNITS = [
  { unit: 'year', seconds: 31536000 },
  { unit: 'month', seconds: 2592000 },
  { unit: 'day', seconds: 86400 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
];

function isSupportedByIntl(locale) {
  return Intl.RelativeTimeFormat.supportedLocalesOf([locale]).length > 0;
}

/**
 * @param {string|number|Date} date - the moment to describe
 * @param {string} locale - a BCP 47 tag such as `hy`, `ru`, `en`
 * @param {Date|number} [now=Date.now()] - the moment it is relative to
 * @returns {string}
 */
export function formatRelativeTime(date, locale, now = Date.now()) {
  const target = new Date(date);
  const reference = new Date(now);
  const elapsedSeconds =
    (target.getTime() - reference.getTime()) / MS_PER_SECOND;
  const match = UNITS.find(
    ({ seconds }) => Math.abs(elapsedSeconds) >= seconds,
  );
  const unit = match ? match.unit : 'second';

  const dateFnsLocale = DATE_FNS_LOCALES[String(locale).split('-')[0]];
  if (isSupportedByIntl(locale) || !dateFnsLocale) {
    const value = Math.round(elapsedSeconds / (match ? match.seconds : 1));
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      value,
      unit,
    );
  }

  return formatDistanceStrict(target, reference, {
    addSuffix: true,
    unit,
    roundingMethod: 'round',
    locale: dateFnsLocale,
  });
}

export default formatRelativeTime;

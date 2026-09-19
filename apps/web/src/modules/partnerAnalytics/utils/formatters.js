/**
 * Number/percentage formatting for the Partner Analytics dashboard —
 * every KPI card, table cell, and chart tooltip in this module goes
 * through these two functions rather than hand-formatting, matching
 * this codebase's established `Intl`-based convention
 * (`ManagerDashboardContent.jsx`'s `formatAmount`,
 * `ManagerAnalyticsPageContent.jsx`'s inline `Intl.NumberFormat` calls) —
 * centralized here only because this module's dashboard reuses both
 * formats far more densely than either Manager page did.
 */

/**
 * @param {number|null|undefined} value
 * @param {string} locale - `i18n.language`.
 * @returns {string} a locale-formatted integer, or an em dash for a
 *   missing value (never `NaN`/`undefined` rendered directly).
 */
export function formatCount(value, locale) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * @param {number|null|undefined} ratio - a 0..1 ratio, e.g. A5's
 *   `search_ctr`/`promotion_ctr`/`view_to_request_conversion`.
 * @param {string} locale
 * @returns {string} e.g. `0.2134` -> `"21.34%"`. Never more than 2
 *   decimal places (brief §18: no meaningless `0.0000%`).
 */
export function formatPercent(ratio, locale) {
  if (ratio === null || ratio === undefined) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(ratio);
}

/**
 * @param {string} isoDay - an A5 `day`/`from_day`/`to_day` value
 *   (`YYYY-MM-DD`).
 * @param {string} locale
 * @param {object} [options] - forwarded to `Intl.DateTimeFormat`.
 * @returns {string} a localized date, parsed as a calendar date (never
 *   through `new Date(isoDay)` directly, which would shift by the
 *   viewer's UTC offset for a bare `YYYY-MM-DD` string).
 */
export function formatDay(isoDay, locale, options = undefined) {
  const [year, month, day] = isoDay.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(date);
}

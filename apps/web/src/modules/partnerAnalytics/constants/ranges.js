/**
 * Step A6 (Partner Analytics Dashboard UI) — mirrors
 * `apps/api/src/modules/engagementAnalytics/validators/partnerAnalyticsValidators.js`
 * exactly: the closed 7/30/90 range enum and the bounded listings sort
 * enum. Kept as named constants, never inline magic numbers/strings, so
 * the range selector and sort dropdown can never offer a value the
 * backend would reject.
 */

export const ALLOWED_RANGE_DAYS = Object.freeze([7, 30, 90]);
export const DEFAULT_RANGE_DAYS = 30;

export const LISTINGS_SORT_VALUES = Object.freeze([
  'views',
  'impressions',
  'booking_requests',
  'promotion_clicks',
]);
export const DEFAULT_LISTINGS_SORT = 'views';

/**
 * @param {string|number|null} value - a raw URL query value.
 * @returns {number} a valid range from `ALLOWED_RANGE_DAYS`, or the
 *   default when `value` is missing/unparseable/not one of the three.
 */
export function parseRangeDays(value) {
  const parsed = Number(value);
  return ALLOWED_RANGE_DAYS.includes(parsed) ? parsed : DEFAULT_RANGE_DAYS;
}

/**
 * @param {string|null} value - a raw URL query value.
 * @returns {string} a valid sort from `LISTINGS_SORT_VALUES`, or the
 *   default when `value` is missing/not one of the four.
 */
export function parseListingsSort(value) {
  return LISTINGS_SORT_VALUES.includes(value) ? value : DEFAULT_LISTINGS_SORT;
}

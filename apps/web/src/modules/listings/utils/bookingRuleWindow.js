/**
 * Step L6.2F — client-side view of a listing's Partner booking rules, for
 * the reservation widget's own UX only. The backend
 * (`apps/api/src/core/domain/bookingRuleEvaluation.js`) is the authority and
 * uses the exact same semantics:
 *
 * - minimum/maximum stay are lodging NIGHTS for HOTEL/PROPERTY
 *   (`dateTo - dateFrom`, checkout excluded) and inclusive rental DAYS for
 *   CAR_RENTAL; every other listing type ignores them;
 * - the advance maximum is a calendar-day horizon in Asia/Yerevan: the last
 *   bookable start date is today + N (0 = today only).
 *
 * Violations use the backend's issue shape so the same translated message
 * (`getIssueMessage`) explains both a client-side block and a server reject.
 */

const MS_PER_DAY = 86_400_000;

export const STAY_RULE_UNIT_BY_LISTING_TYPE = Object.freeze({
  HOTEL: 'nights',
  PROPERTY: 'nights',
  CAR_RENTAL: 'days',
});

function addCalendarDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function computeStayLength(unit, dateFrom, dateTo) {
  const span = Math.round(
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) /
      MS_PER_DAY,
  );
  return unit === 'days' ? span + 1 : span;
}

/**
 * @param {{listingType: string, dateFrom: string, dateTo: string, bookingRules: object|null}} input
 *   `bookingRules` in the public listing DTO shape (`minimum_stay_nights`, …)
 * @returns {object|null} the first stay-rule violation, in the backend's
 *   issue shape, or `null`
 */
export function evaluateStayRules({
  listingType,
  dateFrom,
  dateTo,
  bookingRules,
}) {
  const unit = STAY_RULE_UNIT_BY_LISTING_TYPE[listingType];
  if (!unit || !bookingRules || !dateFrom || !dateTo) return null;
  const length = computeStayLength(unit, dateFrom, dateTo);
  const minimum = bookingRules.minimum_stay_nights;
  const maximum = bookingRules.maximum_stay_nights;
  if (minimum != null && length < minimum) {
    return { issue: 'MINIMUM_STAY_NOT_MET', minimum, unit };
  }
  if (maximum != null && length > maximum) {
    return { issue: 'MAXIMUM_STAY_EXCEEDED', maximum, unit };
  }
  return null;
}

/** The last selectable start date, or `undefined` when there is no horizon. */
export function latestBookableDate(today, maximumDays) {
  if (maximumDays == null) return undefined;
  return addCalendarDays(today, maximumDays);
}

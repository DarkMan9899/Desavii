/**
 * Search filters computed from real listing data rather than declared in
 * `filter_definitions` (Search & Discovery remediation). Each one reads a
 * fact partners already author, so a filter only appears where at least
 * one publicly visible listing in scope carries it:
 *
 * - POLICY — every `category_policies` definition of a filterable type
 *   (ENUM → its `policy_options`; BOOLEAN → "allowed" toggles), e.g.
 *   cancellation policy, pets/children/smoking allowed.
 *   Param: `policy_{code}=<option codes>` or `policy_{code}=true`.
 * - ROOM — bookable-unit facts: a room's meal plan (`MEAL_PLANS`) and
 *   whether it can be booked by the hour.
 *   Params: `room_meal_plan=<codes>`, `room_hourly_stays=true`.
 * - REVIEW — the approved-review average, as "N or better".
 *   Param: `ratingMin=<threshold>`.
 *
 * Param names live here so the validator, the service and the metadata
 * the frontend renders from can never disagree on them.
 */

export const POLICY_PARAM_PREFIX = 'policy_';
export const ROOM_PARAM_PREFIX = 'room_';

export const FILTERABLE_POLICY_DATA_TYPES = Object.freeze(['ENUM', 'BOOLEAN']);

/** The only value a BOOLEAN policy or room toggle filters on. */
export const TOGGLE_ON_VALUE = 'true';

export const ROOM_FILTERS = Object.freeze({
  MEAL_PLAN: 'meal_plan',
  HOURLY_STAYS: 'hourly_stays',
});

export const RATING_PARAM = 'ratingMin';
export const GUEST_RATING_FILTER_CODE = 'guest_rating';

/** "N or better" steps offered for the approved-review average (1–5). */
export const RATING_THRESHOLDS = Object.freeze([3, 4, 4.5]);
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export default {
  POLICY_PARAM_PREFIX,
  ROOM_PARAM_PREFIX,
  FILTERABLE_POLICY_DATA_TYPES,
  TOGGLE_ON_VALUE,
  ROOM_FILTERS,
  RATING_PARAM,
  GUEST_RATING_FILTER_CODE,
  RATING_THRESHOLDS,
  RATING_MIN,
  RATING_MAX,
};

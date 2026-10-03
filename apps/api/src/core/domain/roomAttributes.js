/**
 * Room-attribute vocabularies for `bookable_units.bathroom_type`/
 * `view_type`/`smoking_policy` (Sprint C-1). Small, code-owned closed
 * sets — mirrors `bedTypes.js`'s own precedent (migration 0025/0034's
 * "small closed vocabularies don't need a lookup table" judgment) rather
 * than a new admin-managed reference table: these three rarely change
 * and carry no per-row metadata of their own.
 */

export const BATHROOM_TYPES = Object.freeze(['PRIVATE', 'SHARED', 'ENSUITE']);

export const VIEW_TYPES = Object.freeze([
  'CITY',
  'MOUNTAIN',
  'GARDEN',
  'COURTYARD',
  'POOL',
  'LANDMARK',
  'NONE',
]);

export const SMOKING_POLICIES = Object.freeze([
  'NON_SMOKING',
  'SMOKING_ALLOWED',
]);

// Step L6.3A — a room's meal / board basis (migration 0053). Display
// information only: it never changes the booking charge, which stays the
// room's nightly price.
export const MEAL_PLANS = Object.freeze([
  'NO_MEALS',
  'BREAKFAST_INCLUDED',
  'BREAKFAST_AVAILABLE_EXTRA',
  'HALF_BOARD',
  'FULL_BOARD',
  'ALL_INCLUSIVE',
]);

export default { BATHROOM_TYPES, VIEW_TYPES, SMOKING_POLICIES, MEAL_PLANS };

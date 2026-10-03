/**
 * Room-attribute vocabularies — mirrors
 * `apps/api/src/core/domain/roomAttributes.js` (Sprint C-1), the same way
 * `bedTypes.js` mirrors the backend's own fixed enum.
 */

export const BATHROOM_TYPES = ['PRIVATE', 'SHARED', 'ENSUITE'];

export const VIEW_TYPES = [
  'CITY',
  'MOUNTAIN',
  'GARDEN',
  'COURTYARD',
  'POOL',
  'LANDMARK',
  'NONE',
];

export const SMOKING_POLICIES = ['NON_SMOKING', 'SMOKING_ALLOWED'];

// Step L6.3A — a room's meal / board basis (display only, never priced).
export const MEAL_PLANS = [
  'NO_MEALS',
  'BREAKFAST_INCLUDED',
  'BREAKFAST_AVAILABLE_EXTRA',
  'HALF_BOARD',
  'FULL_BOARD',
  'ALL_INCLUSIVE',
];

export default { BATHROOM_TYPES, VIEW_TYPES, SMOKING_POLICIES, MEAL_PLANS };

/**
 * Bed-type vocabulary for `bookable_units.bed_configuration` (P2.2A).
 * A small, code-owned closed set — mirrors `bookableUnitTypes.js`'s own
 * precedent (a fixed backend enum, reused by the Zod validator rather
 * than re-declared) and migration 0025's "small closed vocabularies don't
 * need a lookup table" judgment, applied here inside a JSON array's
 * `type` field instead of a literal VARCHAR column.
 */

export const BED_TYPES = Object.freeze([
  'SINGLE',
  'DOUBLE',
  'QUEEN',
  'KING',
  'TWIN',
  'SOFA_BED',
  'BUNK',
  // Step L6.3A — the physical sleeping options beyond the room's own beds,
  // kept as three distinct things: an extra (adult) bed, a child-size bed,
  // and a baby crib/cot. Age rules and charges are hotel policy, never
  // implied by these.
  'EXTRA_BED',
  'CHILD_BED',
  'CRIB',
]);

// Step L6.3A — a sanity ceiling for one bed type's quantity in one room
// (a real room has a handful of beds), not a product rule.
export const BED_COUNT_MAX = 20;

export default { BED_TYPES, BED_COUNT_MAX };

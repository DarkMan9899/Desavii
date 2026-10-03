/**
 * `bed_configuration` type vocabulary — mirrors
 * `apps/api/src/core/domain/bedTypes.js` (P2.2A), the same way
 * `bookableUnitTypes.js` mirrors the backend's own fixed enum.
 */

export const BED_TYPES = [
  'SINGLE',
  'DOUBLE',
  'QUEEN',
  'KING',
  'TWIN',
  'SOFA_BED',
  'BUNK',
  // Step L6.3A — extra bed, child bed and baby crib/cot: separate options.
  'EXTRA_BED',
  'CHILD_BED',
  'CRIB',
];

// Step L6.3A — mirrors `BED_COUNT_MAX` (one bed type's quantity per room).
export const BED_COUNT_MAX = 20;

export default BED_TYPES;

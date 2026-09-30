/**
 * Unsigned MySQL integer column ceilings — mirrors
 * `apps/api/src/validation/sqlIntegerBounds.js`. `INT_UNSIGNED_MAX` caps unit
 * capacity and calendar block/external-reservation quantities;
 * `SMALLINT_UNSIGNED_MAX` caps a restaurant party size (storage overflow
 * protection only — there is no product maximum).
 */

export const SMALLINT_UNSIGNED_MAX = 65535;
export const INT_UNSIGNED_MAX = 4294967295;

export default INT_UNSIGNED_MAX;

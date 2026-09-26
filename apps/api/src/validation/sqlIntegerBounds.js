/**
 * Upper bounds of the unsigned MySQL integer column types Partner-facing
 * numeric fields are stored in. Validators cap a field at its column's
 * real ceiling (no invented product number) so an out-of-range value is
 * rejected with a field-level 422 before the write, instead of relying on
 * the strict-mode `ER_WARN_DATA_OUT_OF_RANGE` error the DB would raise.
 */

export const SMALLINT_UNSIGNED_MAX = 65535;
export const INT_UNSIGNED_MAX = 4294967295;

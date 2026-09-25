/**
 * Shared "money amount" Zod schema factory — Step L4 (brief §8, §13,
 * §17). Every money-amount column this schema is used against is a real
 * `DECIMAL(12,2)` (listing pricing, restaurant menu item price — see
 * their own migrations); the upper bound mirrors that column's real
 * ceiling instead of an invented product number (brief §5/§17 prefer a
 * DB-derived bound), and `hasAtMostTwoDecimals` mirrors the column's own
 * 2-decimal-place precision.
 *
 * An epsilon comparison (not `value * 100 === Math.round(value * 100)`)
 * absorbs ordinary binary-float representation noise (e.g. `19.99` not
 * being exactly representable) without accepting a genuinely-3-decimal
 * value like `19.999` — brief §13's "avoid binary-float assumptions" is
 * about not trusting float equality/precision blindly, not about
 * picking a fragile string-parsing scheme where a numeric check already
 * suffices.
 *
 * Nonnegative (zero allowed), never `.positive()` here — whether a
 * specific caller's zero-price case is actually a legitimate product
 * state is that caller's own decision to make explicitly (see
 * `listingValidators.js`'s own header comment on `pricingSchema`), not
 * something this shared structural schema should presume either way.
 */

import { z } from 'zod';

export const DECIMAL_12_2_MAX = 9999999999.99;

function hasAtMostTwoDecimals(value) {
  return Math.abs(Math.round(value * 100) - value * 100) < 1e-6;
}

export const decimalMoneyAmountSchema = z.coerce
  .number()
  .nonnegative()
  .max(DECIMAL_12_2_MAX)
  .refine(hasAtMostTwoDecimals, {
    message: 'amount must have at most 2 decimal places.',
  });

export default decimalMoneyAmountSchema;

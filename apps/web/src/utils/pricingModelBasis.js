/**
 * Step L6.2H1 — the one mapping from a listing's pricing model to the price
 * basis it is actually charged in (`perNight` / `perDay` / `perPerson`), shared
 * by listing cards and unit price labels. Lives in dependency-free top-level
 * `utils/` so both `modules/listings` and the shared card helpers can reach it.
 *
 * `null` for any model booking can't charge as its name promises (legacy
 * PER_HOUR) or doesn't know — a caller then shows no basis at all rather than
 * a misleading one.
 */

const BASIS_BY_PRICING_MODEL = Object.freeze({
  PER_NIGHT: 'perNight',
  PER_DAY: 'perDay',
  PER_PERSON: 'perPerson',
});

export function resolvePricingModelBasis(pricingModel) {
  return BASIS_BY_PRICING_MODEL[pricingModel] ?? null;
}

export default resolvePricingModelBasis;

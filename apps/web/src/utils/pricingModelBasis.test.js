import { describe, test, expect } from 'vitest';
import { resolvePricingModelBasis } from './pricingModelBasis.js';

// Step L6.2H1 — the charged basis per pricing model; a legacy PER_HOUR (not
// bookable) or unknown model has none.
describe('resolvePricingModelBasis', () => {
  test.each([
    ['PER_NIGHT', 'perNight'],
    ['PER_DAY', 'perDay'],
    ['PER_PERSON', 'perPerson'],
    ['PER_HOUR', null],
    ['SOMETHING_NEW', null],
    [null, null],
    [undefined, null],
  ])('%s -> %s', (pricingModel, basis) => {
    expect(resolvePricingModelBasis(pricingModel)).toBe(basis);
  });
});

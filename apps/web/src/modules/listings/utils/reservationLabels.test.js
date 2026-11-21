import { describe, test, expect } from 'vitest';
import { resolvePricingModelLabel } from './reservationLabels.js';

function makeT(map) {
  return (key, options) => map[key] ?? options?.defaultValue ?? key;
}

describe('reservationLabels', () => {
  describe('resolvePricingModelLabel', () => {
    test('returns undefined when pricing is null', () => {
      expect(resolvePricingModelLabel(makeT({}), null)).toBeUndefined();
    });

    test('resolves the translated pricing-model label', () => {
      const t = makeT({
        'partner.listingWizard.pricingModels.PER_NIGHT': 'per night',
      });
      expect(resolvePricingModelLabel(t, { pricing_model: 'PER_NIGHT' })).toBe(
        'per night',
      );
    });
  });
});

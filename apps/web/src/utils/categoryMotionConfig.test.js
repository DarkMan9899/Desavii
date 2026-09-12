import { describe, test, expect } from 'vitest';
import { resolveDetailEmphasisSectionId } from './categoryMotionConfig.js';

describe('categoryMotionConfig', () => {
  test('brief §5/§6: each named category resolves to its own "product comes first" section', () => {
    expect(resolveDetailEmphasisSectionId('hotels')).toBe('rooms');
    expect(resolveDetailEmphasisSectionId('restaurants')).toBe('menu');
    expect(resolveDetailEmphasisSectionId('tours')).toBe('itinerary');
    expect(resolveDetailEmphasisSectionId('car-rentals')).toBe('attributes');
    expect(resolveDetailEmphasisSectionId('attractions')).toBe('attributes');
    expect(resolveDetailEmphasisSectionId('entertainment-venues')).toBe(
      'availability',
    );
  });

  test('Apartments/Villas/Guest Houses have no detail-page emphasis — their motion character is already card-level (never doubled up)', () => {
    expect(resolveDetailEmphasisSectionId('apartments')).toBeNull();
    expect(resolveDetailEmphasisSectionId('villas')).toBeNull();
    expect(resolveDetailEmphasisSectionId('guest-houses')).toBeNull();
  });

  test('an unrecognized category key resolves to no emphasis', () => {
    expect(resolveDetailEmphasisSectionId('not-a-real-category')).toBeNull();
    expect(resolveDetailEmphasisSectionId(undefined)).toBeNull();
  });
});

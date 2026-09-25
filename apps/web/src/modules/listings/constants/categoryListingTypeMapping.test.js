import { describe, test, expect } from 'vitest';
import { deriveListingTypeFromCategorySlug } from './categoryListingTypeMapping.js';

describe('deriveListingTypeFromCategorySlug — Step L1 closed category->type mapping', () => {
  test('hotels -> HOTEL', () => {
    expect(deriveListingTypeFromCategorySlug('hotels')).toBe('HOTEL');
  });

  test('apartments -> PROPERTY', () => {
    expect(deriveListingTypeFromCategorySlug('apartments')).toBe('PROPERTY');
  });

  test('villas -> PROPERTY', () => {
    expect(deriveListingTypeFromCategorySlug('villas')).toBe('PROPERTY');
  });

  test('guest-houses -> PROPERTY', () => {
    expect(deriveListingTypeFromCategorySlug('guest-houses')).toBe('PROPERTY');
  });

  test('restaurants -> RESTAURANT', () => {
    expect(deriveListingTypeFromCategorySlug('restaurants')).toBe('RESTAURANT');
  });

  test('tours -> TOUR', () => {
    expect(deriveListingTypeFromCategorySlug('tours')).toBe('TOUR');
  });

  test('car-rentals -> CAR_RENTAL', () => {
    expect(deriveListingTypeFromCategorySlug('car-rentals')).toBe('CAR_RENTAL');
  });

  test('attractions -> ATTRACTION', () => {
    expect(deriveListingTypeFromCategorySlug('attractions')).toBe('ATTRACTION');
  });

  test('entertainment-venues -> ATTRACTION (not a separate ENTERTAINMENT type)', () => {
    expect(deriveListingTypeFromCategorySlug('entertainment-venues')).toBe(
      'ATTRACTION',
    );
  });

  test('an unmapped/unknown slug returns null, never a guess', () => {
    expect(deriveListingTypeFromCategorySlug('some-future-category')).toBe(
      null,
    );
  });

  test('null/undefined/non-string input returns null', () => {
    expect(deriveListingTypeFromCategorySlug(null)).toBe(null);
    expect(deriveListingTypeFromCategorySlug(undefined)).toBe(null);
    expect(deriveListingTypeFromCategorySlug(42)).toBe(null);
  });
});

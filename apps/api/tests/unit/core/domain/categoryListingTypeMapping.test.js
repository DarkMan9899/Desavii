import { describe, test, expect } from '@jest/globals';
import { deriveListingTypeCodeFromCategorySlug } from '../../../../src/core/domain/categoryListingTypeMapping.js';

describe('deriveListingTypeCodeFromCategorySlug — Step L1 closed category->type mapping', () => {
  test('hotels -> HOTEL', () => {
    expect(deriveListingTypeCodeFromCategorySlug('hotels')).toBe('HOTEL');
  });

  test('apartments -> PROPERTY', () => {
    expect(deriveListingTypeCodeFromCategorySlug('apartments')).toBe(
      'PROPERTY',
    );
  });

  test('villas -> PROPERTY', () => {
    expect(deriveListingTypeCodeFromCategorySlug('villas')).toBe('PROPERTY');
  });

  test('guest-houses -> PROPERTY', () => {
    expect(deriveListingTypeCodeFromCategorySlug('guest-houses')).toBe(
      'PROPERTY',
    );
  });

  test('restaurants -> RESTAURANT', () => {
    expect(deriveListingTypeCodeFromCategorySlug('restaurants')).toBe(
      'RESTAURANT',
    );
  });

  test('tours -> TOUR', () => {
    expect(deriveListingTypeCodeFromCategorySlug('tours')).toBe('TOUR');
  });

  test('car-rentals -> CAR_RENTAL', () => {
    expect(deriveListingTypeCodeFromCategorySlug('car-rentals')).toBe(
      'CAR_RENTAL',
    );
  });

  test('attractions -> ATTRACTION', () => {
    expect(deriveListingTypeCodeFromCategorySlug('attractions')).toBe(
      'ATTRACTION',
    );
  });

  test('entertainment-venues -> ATTRACTION (not a separate ENTERTAINMENT type)', () => {
    expect(deriveListingTypeCodeFromCategorySlug('entertainment-venues')).toBe(
      'ATTRACTION',
    );
  });

  test('an unmapped/unknown slug returns null, never a guess', () => {
    expect(deriveListingTypeCodeFromCategorySlug('some-future-category')).toBe(
      null,
    );
  });

  test('null/undefined/non-string input returns null', () => {
    expect(deriveListingTypeCodeFromCategorySlug(null)).toBe(null);
    expect(deriveListingTypeCodeFromCategorySlug(undefined)).toBe(null);
    expect(deriveListingTypeCodeFromCategorySlug(42)).toBe(null);
  });
});

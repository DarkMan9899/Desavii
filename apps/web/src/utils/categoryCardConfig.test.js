import { describe, test, expect } from 'vitest';
import { IMAGE_ASPECT, resolveCardConfig } from './categoryCardConfig.js';

describe('categoryCardConfig', () => {
  test('Entertainment uses the standard card aspect, same outer scale as every other category (emergency visual-regression recovery: the previous TALL/3:4 crop made ordinary Entertainment cards balloon into oversized posters)', () => {
    expect(resolveCardConfig('entertainment-venues')).toEqual({
      imageAspect: IMAGE_ASPECT.STANDARD,
      priceUnitKey: 'perPerson',
    });
  });

  test('DESAVII category-closure pass: every real category shares the same canonical standard card aspect (owner-directed global geometry lock — no category-specific outer shape)', () => {
    [
      'hotels',
      'apartments',
      'villas',
      'guest-houses',
      'restaurants',
      'tours',
      'car-rentals',
      'attractions',
      'entertainment-venues',
    ].forEach((slug) => {
      expect(resolveCardConfig(slug).imageAspect).toBe(IMAGE_ASPECT.STANDARD);
    });
  });

  test('every real category has a non-null priceUnitKey mirroring the seeded pricing model', () => {
    expect(resolveCardConfig('hotels').priceUnitKey).toBe('perNight');
    expect(resolveCardConfig('car-rentals').priceUnitKey).toBe('perDay');
    expect(resolveCardConfig('restaurants').priceUnitKey).toBe('perPerson');
  });

  test('DESAVII category-closure pass: no category defines a promotedImageAspect override anymore — a TOP/promoted card must use the exact same geometry as an ordinary card (the earlier Car Rentals wide-promoted exception is removed)', () => {
    [
      'hotels',
      'apartments',
      'villas',
      'guest-houses',
      'restaurants',
      'tours',
      'car-rentals',
      'attractions',
      'entertainment-venues',
    ].forEach((slug) => {
      expect(resolveCardConfig(slug).promotedImageAspect).toBeUndefined();
    });
  });

  test('falls back to a standard aspect and no price-unit suffix for an unrecognized key (never fabricated)', () => {
    expect(resolveCardConfig('not-a-real-category')).toEqual({
      imageAspect: IMAGE_ASPECT.STANDARD,
      priceUnitKey: null,
    });
    expect(resolveCardConfig(undefined).priceUnitKey).toBeNull();
  });
});

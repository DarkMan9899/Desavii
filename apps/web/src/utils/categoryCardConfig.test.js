import { describe, test, expect } from 'vitest';
import { IMAGE_ASPECT, resolveCardConfig } from './categoryCardConfig.js';

describe('categoryCardConfig', () => {
  test('Entertainment uses the standard card aspect, same outer scale as every other category (emergency visual-regression recovery: the previous TALL/3:4 crop made ordinary Entertainment cards balloon into oversized posters)', () => {
    expect(resolveCardConfig('entertainment-venues')).toEqual({
      imageAspect: IMAGE_ASPECT.STANDARD,
      priceUnitKey: 'perPerson',
    });
  });

  test('Villas and Tours get a wide crop, distinct from the standard Hotel/Apartment ratio', () => {
    expect(resolveCardConfig('villas').imageAspect).toBe(IMAGE_ASPECT.WIDE);
    expect(resolveCardConfig('tours').imageAspect).toBe(IMAGE_ASPECT.WIDE);
    expect(resolveCardConfig('hotels').imageAspect).toBe(IMAGE_ASPECT.STANDARD);
    expect(resolveCardConfig('apartments').imageAspect).toBe(
      IMAGE_ASPECT.STANDARD,
    );
  });

  test('every real category has a non-null priceUnitKey mirroring the seeded pricing model', () => {
    expect(resolveCardConfig('hotels').priceUnitKey).toBe('perNight');
    expect(resolveCardConfig('car-rentals').priceUnitKey).toBe('perDay');
    expect(resolveCardConfig('restaurants').priceUnitKey).toBe('perPerson');
  });

  test('Step 2.1 correction: Car Rentals gets a wide promotedImageAspect override, only for its promoted card (the real, live-measured TOP-height fix) — its ordinary grid card stays standard', () => {
    const config = resolveCardConfig('car-rentals');
    expect(config.imageAspect).toBe(IMAGE_ASPECT.STANDARD);
    expect(config.promotedImageAspect).toBe(IMAGE_ASPECT.WIDE);
  });

  test('no other category defines a promotedImageAspect override (Car Rentals stays the one scoped exception)', () => {
    [
      'hotels',
      'apartments',
      'villas',
      'guest-houses',
      'restaurants',
      'tours',
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

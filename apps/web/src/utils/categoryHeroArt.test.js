import { describe, test, expect } from 'vitest';
import { resolveCategoryHeroSeed } from './categoryHeroArt.js';
import { seedToIndex } from '../components/DestinationArt/DestinationArt.jsx';

const KNOWN_SLUGS = [
  'hotels',
  'apartments',
  'villas',
  'guest-houses',
  'restaurants',
  'tours',
  'car-rentals',
  'attractions',
  'entertainment-venues',
];

describe('categoryHeroArt', () => {
  test('every known category resolves to a defined seed, never the fallback', () => {
    KNOWN_SLUGS.forEach((slug) => {
      expect(resolveCategoryHeroSeed(slug, 'FALLBACK')).not.toBe('FALLBACK');
    });
  });

  test('the two owner-flagged confusable groups each get 9/5 art combos with zero internal collision', () => {
    const accommodationSubTypes = ['apartments', 'villas', 'guest-houses'];
    const attractionSubTypes = ['attractions', 'entertainment-venues'];

    const accommodationCombos = accommodationSubTypes.map(
      (slug) => seedToIndex(resolveCategoryHeroSeed(slug)) % 5,
    );
    expect(new Set(accommodationCombos).size).toBe(
      accommodationSubTypes.length,
    );

    const attractionCombos = attractionSubTypes.map(
      (slug) => seedToIndex(resolveCategoryHeroSeed(slug)) % 5,
    );
    expect(new Set(attractionCombos).size).toBe(attractionSubTypes.length);
  });

  test('falls back to the given seed for an unrecognized category slug', () => {
    expect(resolveCategoryHeroSeed('not-a-real-category', 42)).toBe(42);
  });
});

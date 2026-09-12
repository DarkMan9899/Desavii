import { describe, test, expect } from 'vitest';
import { resolveCategoryHeroArt } from './categoryHeroArt.js';

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
  test('every known category resolves to a defined motif, not the fallback', () => {
    KNOWN_SLUGS.forEach((slug) => {
      const art = resolveCategoryHeroArt(slug, 'FALLBACK_SEED');
      expect(art.motif).toBeDefined();
      expect(art.meshVariant).toBeDefined();
      expect(art.seed).toBe('FALLBACK_SEED');
    });
  });

  test('brief §2/§3: all 9 categories get a genuinely unique motif — none shared', () => {
    const motifs = KNOWN_SLUGS.map(
      (slug) => resolveCategoryHeroArt(slug).motif,
    );
    expect(new Set(motifs).size).toBe(KNOWN_SLUGS.length);
  });

  test('the two owner-flagged confusable groups are internally distinct', () => {
    const accommodation = ['apartments', 'villas', 'guest-houses'].map(
      (slug) => resolveCategoryHeroArt(slug).motif,
    );
    expect(new Set(accommodation).size).toBe(3);

    const attractionGroup = ['attractions', 'entertainment-venues'].map(
      (slug) => resolveCategoryHeroArt(slug).motif,
    );
    expect(new Set(attractionGroup).size).toBe(2);
  });

  test('falls back to a bare seed (no motif/meshVariant override) for an unrecognized category slug', () => {
    expect(resolveCategoryHeroArt('not-a-real-category', 42)).toEqual({
      seed: 42,
    });
  });
});

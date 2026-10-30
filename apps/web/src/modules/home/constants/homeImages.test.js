import { describe, test, expect } from 'vitest';
import {
  getHomeImage,
  HOME_IMAGE_CREDITS,
  categoryImageKey,
  destinationImageKey,
} from './homeImages.js';

const CATEGORY_SLUGS = [
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

describe('Home photography manifest', () => {
  test('every category the marketplace offers has its own photo', () => {
    CATEGORY_SLUGS.forEach((slug) => {
      expect(getHomeImage(categoryImageKey(slug))).not.toBeNull();
    });
  });

  test('a photo offers AVIF and WebP at several widths, smallest first', () => {
    const image = getHomeImage('hero-ararat');
    expect(image.avifSrcSet).toMatch(/^\S+-768\.avif 768w, .+ 2560w$/);
    expect(image.webpSrcSet.split(', ')).toHaveLength(4);
    expect(image.src).toMatch(/hero-ararat-768\.webp$/);
    expect(image.ratio).toBeGreaterThan(1);
  });

  test('a key without files is simply absent, never another place’s photo', () => {
    expect(getHomeImage(destinationImageKey('yeghegnadzor'))).toBeNull();
  });

  test('every credited photo exists and carries author, licence and source', () => {
    HOME_IMAGE_CREDITS.forEach((credit) => {
      expect(getHomeImage(credit.key)).not.toBeNull();
      expect(credit.author).toBeTruthy();
      expect(credit.licence.url).toMatch(/^https:\/\/creativecommons\.org\//);
      expect(credit.source).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
    });
  });
});

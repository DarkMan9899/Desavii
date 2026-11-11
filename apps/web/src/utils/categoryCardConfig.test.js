import { describe, test, expect } from 'vitest';
import { resolveCardConfig } from './categoryCardConfig.js';

describe('resolveCardConfig — the category default price basis', () => {
  test.each([
    ['hotels', 'perNight'],
    ['apartments', 'perNight'],
    ['villas', 'perNight'],
    ['guest-houses', 'perNight'],
    ['restaurants', 'perPerson'],
    ['tours', 'perPerson'],
    ['car-rentals', 'perDay'],
    ['attractions', 'perPerson'],
    ['entertainment-venues', 'perPerson'],
  ])('%s defaults to %s', (slug, unit) => {
    expect(resolveCardConfig(slug).priceUnitKey).toBe(unit);
  });

  test('an unknown category gets no basis rather than an invented one', () => {
    expect(resolveCardConfig('not-a-real-category').priceUnitKey).toBeNull();
    expect(resolveCardConfig(undefined).priceUnitKey).toBeNull();
  });
});

describe('resolveCardConfig — the facts each category decides on', () => {
  const STAYS = ['hotels', 'apartments', 'villas', 'guest-houses'];

  test('every category has its own fact priorities', () => {
    [
      ...STAYS,
      'restaurants',
      'tours',
      'car-rentals',
      'attractions',
      'entertainment-venues',
    ].forEach((slug) => {
      expect(resolveCardConfig(slug).factKeys.length).toBeGreaterThan(0);
    });
  });

  test('a car rental never carries guest or night semantics', () => {
    const keys = resolveCardConfig('car-rentals').factKeys;
    [
      'max_guests',
      'bedrooms',
      'star_rating',
      'amenity:BREAKFAST_INCLUDED',
    ].forEach((key) => expect(keys).not.toContain(key));
  });

  test('a stay never carries vehicle facts', () => {
    STAYS.forEach((slug) => {
      const keys = resolveCardConfig(slug).factKeys;
      expect(keys).not.toContain('transmission');
      expect(keys).not.toContain('seats');
    });
  });

  test('an unknown category gets no facts', () => {
    expect(resolveCardConfig('not-a-real-category').factKeys).toEqual([]);
  });
});

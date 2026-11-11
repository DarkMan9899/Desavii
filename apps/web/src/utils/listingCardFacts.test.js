import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import i18n from 'i18next';
import { CARD_FACT_LIMIT, resolveCardFacts } from './listingCardFacts.js';
import { AMENITY_ICONS, ATTRIBUTE_ICONS } from './listingFactIcons.js';

const t = (...args) => i18n.t(...args);
const labels = (dto, category) =>
  resolveCardFacts(dto, category, t).map((fact) => fact.label);

beforeEach(() => i18n.changeLanguage('en'));
afterEach(() => i18n.changeLanguage('hy'));

describe('resolveCardFacts — each category shows its own decisive facts', () => {
  test.each([
    [
      'hotels',
      { star_rating: '4', amenities: ['PARKING', 'BREAKFAST_INCLUDED'] },
      ['4 stars', 'Breakfast included', 'Parking'],
    ],
    [
      'apartments',
      { max_guests: 4, bedrooms: 2, amenities: ['KITCHEN', 'POOL'] },
      ['Up to 4 guests', '2 bedrooms', 'Kitchen'],
    ],
    [
      'villas',
      { bedrooms: 3, amenities: ['FIREPLACE', 'POOL', 'PARKING'] },
      ['3 bedrooms', 'Pool', 'Fireplace'],
    ],
    [
      'guest-houses',
      { amenities: ['GARDEN', 'BREAKFAST_INCLUDED'] },
      ['Breakfast included', 'Garden'],
    ],
    [
      'restaurants',
      {
        cuisine: ['ARMENIAN', 'GEORGIAN', 'ITALIAN'],
        reservable: true,
        amenities: ['OUTDOOR_SEATING'],
      },
      ['Armenian, Georgian', 'Free table booking', 'Outdoor seating'],
    ],
    [
      'tours',
      {
        duration_minutes: 480,
        tour_format: 'PRIVATE',
        languages_offered: ['EN', 'RU'],
      },
      ['8h', 'Private', 'English, Russian'],
    ],
    [
      'car-rentals',
      { transmission: 'AUTOMATIC', seats: 5, body_type: 'SUV' },
      ['Automatic', '5 seats', 'SUV'],
    ],
    [
      'attractions',
      {
        attraction_type: 'MUSEUM',
        duration_minutes: 90,
        visit_format: 'GUIDED',
      },
      ['Museum', '90 min', 'Guided'],
    ],
    [
      'entertainment-venues',
      { venue_type: 'ESCAPE_ROOM', duration_minutes: 60, min_age: 12 },
      ['Escape room', '1h', 'Ages 12+'],
    ],
  ])('%s', (category, dto, expected) => {
    expect(labels(dto, category)).toEqual(expected);
  });
});

describe('resolveCardFacts — truthfulness', () => {
  test(`never more than ${CARD_FACT_LIMIT} facts, most decisive first`, () => {
    const facts = resolveCardFacts(
      {
        star_rating: '5',
        amenities: ['POOL', 'SPA', 'PARKING', 'BREAKFAST_INCLUDED'],
      },
      'hotels',
      t,
    );
    expect(facts.map((fact) => fact.key)).toEqual([
      'star_rating',
      'amenity:BREAKFAST_INCLUDED',
      'amenity:POOL',
    ]);
  });

  test('a listing with nothing stored shows no facts, never defaults', () => {
    expect(labels({}, 'hotels')).toEqual([]);
    expect(
      labels(
        { star_rating: null, amenities: [], reservable: false },
        'restaurants',
      ),
    ).toEqual([]);
  });

  test('zero, negative and non-numeric values are not facts', () => {
    expect(
      labels({ max_guests: 0, bedrooms: -1, seats: 'x' }, 'apartments'),
    ).toEqual([]);
  });

  test('a car rental never shows guest or breakfast facts, even if sent', () => {
    expect(
      labels(
        {
          max_guests: 4,
          bedrooms: 2,
          amenities: ['BREAKFAST_INCLUDED', 'CHILD_SEAT'],
        },
        'car-rentals',
      ),
    ).toEqual(['Child seat']);
  });

  test('an amenity the card does not feature is ignored', () => {
    expect(labels({ amenities: ['WIFI', 'TV'] }, 'hotels')).toEqual([]);
  });

  test('a code without a translation is skipped, never shown raw', () => {
    expect(
      labels({ tour_format: 'NOT_A_REAL_FORMAT', amenities: [] }, 'tours'),
    ).toEqual([]);
  });

  test('many languages read as a count', () => {
    expect(
      labels({ languages_offered: ['EN', 'RU', 'HY', 'FR'] }, 'tours'),
    ).toEqual(['4 languages']);
  });

  test('a tour group size reads as an upper bound', () => {
    expect(labels({ max_group_size: 8 }, 'tours')).toEqual(['Up to 8 people']);
  });

  test('an unknown category has no facts', () => {
    expect(labels({ star_rating: '4' }, 'not-a-category')).toEqual([]);
  });

  test('facts carry the same icons as the Listing Detail page', () => {
    const [stars, pool] = resolveCardFacts(
      { star_rating: '4', amenities: ['POOL'] },
      'hotels',
      t,
    );
    expect(stars.icon).toBe(ATTRIBUTE_ICONS.star_rating);
    expect(pool.icon).toBe(AMENITY_ICONS.POOL);
  });
});

describe('resolveCardFacts — localized', () => {
  test('Russian plurals', async () => {
    await i18n.changeLanguage('ru');
    expect(labels({ max_guests: 2, bedrooms: 1 }, 'apartments')).toEqual([
      'До 2 гостей',
      '1 спальня',
    ]);
    expect(labels({ seats: 5 }, 'car-rentals')).toEqual(['5 мест']);
  });

  test('Armenian', async () => {
    await i18n.changeLanguage('hy');
    expect(labels({ amenities: ['POOL'] }, 'villas')).toEqual(['Լողավազան']);
  });
});

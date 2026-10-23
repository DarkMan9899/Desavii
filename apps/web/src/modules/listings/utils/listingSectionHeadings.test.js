import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { resolveSectionHeadingKey } from './listingSectionHeadings.js';

const CATEGORY_KEYS = [
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
const SECTIONS = ['attributes', 'amenities', 'location', 'policies'];

describe('resolveSectionHeadingKey', () => {
  test('a car names its sections as a rental does', () => {
    expect(resolveSectionHeadingKey('car-rentals', 'attributes')).toBe(
      'pages.listingDetail.attributes.headingVehicle',
    );
    expect(resolveSectionHeadingKey('car-rentals', 'location')).toBe(
      'pages.listingDetail.location.headingPickup',
    );
    expect(resolveSectionHeadingKey('car-rentals', 'policies')).toBe(
      'pages.listingDetail.policies.headingRental',
    );
  });

  test('every stay reads its policies as house rules', () => {
    ['hotels', 'apartments', 'villas', 'guest-houses'].forEach((key) => {
      expect(resolveSectionHeadingKey(key, 'policies')).toBe(
        'pages.listingDetail.policies.headingHouseRules',
      );
    });
  });

  test('a section a category does not name, or an unknown category, keeps the generic heading', () => {
    expect(resolveSectionHeadingKey('tours', 'amenities')).toBe(
      'pages.listingDetail.amenities.heading',
    );
    expect(resolveSectionHeadingKey('unknown', 'location')).toBe(
      'pages.listingDetail.location.heading',
    );
  });

  test.each(['en', 'hy', 'ru'])(
    'every heading key resolves to real copy in %s',
    (language) => {
      const t = i18n.getFixedT(language);
      CATEGORY_KEYS.forEach((categoryKey) => {
        SECTIONS.forEach((section) => {
          const key = resolveSectionHeadingKey(categoryKey, section);
          expect(i18n.exists(key, { lng: language })).toBe(true);
          expect(t(key)).not.toBe(key);
        });
      });
    },
  );
});

import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { buildCategoryCardMeta } from './buildCategoryCardMeta.js';

// Step L6.2H1 — a card labels its price by the listing's own pricing model
// (the same basis its detail page shows), not by its category.
describe('buildCategoryCardMeta — price basis', () => {
  const suffixFor = (result) =>
    buildCategoryCardMeta(result, i18n.t.bind(i18n)).priceSuffix;

  test.each([
    ['tours', 'PER_PERSON', '/ անձի համար'],
    ['entertainment-venues', 'PER_PERSON', '/ անձի համար'],
    ['hotels', 'PER_NIGHT', '/ գիշեր'],
    ['car-rentals', 'PER_DAY', '/ օր'],
    ['restaurants', 'PER_PERSON', '/ անձի համար'],
  ])(
    '%s priced %s is labelled by its model',
    (categorySlug, pricingModel, suffix) => {
      expect(
        suffixFor({ category_slug: categorySlug, pricing_model: pricingModel }),
      ).toBe(suffix);
    },
  );

  // Step L6.2H2B: a restaurant's price is average spend, not a booking price.
  test.each([
    ['hy', 'միջինը / անձ'],
    ['en', 'avg. / person'],
    ['ru', 'ср. чек / чел.'],
  ])('a restaurant price reads as average spend (%s)', async (lng, suffix) => {
    await i18n.changeLanguage(lng);
    try {
      expect(
        suffixFor({
          category_slug: 'restaurants',
          listing_type: 'RESTAURANT',
          pricing_model: 'PER_PERSON',
        }),
      ).toBe(suffix);
    } finally {
      await i18n.changeLanguage('hy');
    }
  });

  test('a tour priced per person keeps "/ person", never average spend', () => {
    expect(
      suffixFor({
        category_slug: 'tours',
        listing_type: 'TOUR',
        pricing_model: 'PER_PERSON',
      }),
    ).toBe('/ անձի համար');
  });

  test('a legacy PER_HOUR listing shows its price with no basis, never "/ person"', () => {
    expect(
      suffixFor({ category_slug: 'tours', pricing_model: 'PER_HOUR' }),
    ).toBeNull();
  });

  test('without a listing-level pricing model the category default still applies', () => {
    expect(suffixFor({ category_slug: 'tours', pricing_model: null })).toBe(
      '/ անձի համար',
    );
    expect(suffixFor({ category_slug: 'hotels' })).toBe('/ գիշեր');
  });

  test.each([
    ['en', '/ person'],
    ['ru', '/ с человека'],
    ['hy', '/ անձի համար'],
  ])('the label is translated in %s', async (lng, suffix) => {
    await i18n.changeLanguage(lng);
    try {
      expect(
        suffixFor({ category_slug: 'tours', pricing_model: 'PER_PERSON' }),
      ).toBe(suffix);
    } finally {
      await i18n.changeLanguage('hy');
    }
  });
});

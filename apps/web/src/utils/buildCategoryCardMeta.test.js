import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { buildCategoryCardMeta } from './buildCategoryCardMeta.js';

const meta = (result) => buildCategoryCardMeta(result, i18n.t.bind(i18n));

// Step L6.2H1 — a card's price basis is the listing's own pricing model
// (the same basis its detail page shows), not its category.
describe('buildCategoryCardMeta — price basis', () => {
  test.each([
    ['tours', 'PER_PERSON', 'perPerson'],
    ['entertainment-venues', 'PER_PERSON', 'perPerson'],
    ['hotels', 'PER_NIGHT', 'perNight'],
    ['car-rentals', 'PER_DAY', 'perDay'],
    ['restaurants', 'PER_PERSON', 'perPerson'],
  ])('%s priced %s is based %s', (categorySlug, pricingModel, unit) => {
    expect(
      meta({ category_slug: categorySlug, pricing_model: pricingModel })
        .priceUnitKey,
    ).toBe(unit);
  });

  test('a legacy PER_HOUR listing has no basis, never "/ person"', () => {
    expect(
      meta({ category_slug: 'tours', pricing_model: 'PER_HOUR' }).priceUnitKey,
    ).toBeNull();
  });

  test('without a listing-level pricing model the category default applies', () => {
    expect(
      meta({ category_slug: 'tours', pricing_model: null }).priceUnitKey,
    ).toBe('perPerson');
    expect(meta({ category_slug: 'hotels' }).priceUnitKey).toBe('perNight');
    expect(meta({ category_slug: 'unknown' }).priceUnitKey).toBeNull();
  });
});

describe('buildCategoryCardMeta — category facts', () => {
  test('only real values become facts, per category', () => {
    expect(
      meta({ category_slug: 'hotels', star_rating: '4' }).facts,
    ).toHaveLength(1);
    expect(meta({ category_slug: 'hotels', star_rating: null }).facts).toEqual(
      [],
    );
    // A hotel never shows a car's transmission, even if the row had one.
    expect(
      meta({ category_slug: 'hotels', transmission: 'AUTOMATIC' }).facts,
    ).toEqual([]);
    expect(
      meta({ category_slug: 'car-rentals', transmission: 'AUTOMATIC' }).facts,
    ).toHaveLength(1);
  });

  test('a restaurant names its cuisines as one fact', () => {
    const { facts } = meta({
      category_slug: 'restaurants',
      cuisine: ['ARMENIAN', 'GEORGIAN'],
      price_tier: 'MODERATE',
    });
    expect(facts.map((fact) => fact.key)).toEqual(['cuisine']);
  });
});

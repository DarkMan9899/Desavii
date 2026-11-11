import { describe, test, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import { CARD_FACT_LIMIT } from './listingCardFacts.js';
import {
  TOP_RATING_MIN,
  TOP_RATING_MIN_REVIEWS,
  buildListingCardModel,
  isTopRated,
  resolveCardRating,
  safeMediaUrl,
} from './listingCardModel.js';

const t = (...args) => i18n.t(...args);
const model = (dto) =>
  buildListingCardModel(dto, t, { href: '/hy/listings/x' });

const DTO = {
  id: 9,
  slug: 'x',
  title: 'Ararat View',
  listing_type: 'HOTEL',
  category_slug: 'hotels',
  city_name: 'Yerevan',
  cover_image_url: '/uploads/listings/9/cover.webp',
  media_count: 5,
  price_amount: '42000.00',
  price_currency_code: 'AMD',
  pricing_model: 'PER_NIGHT',
  rating_average: 4.666,
  review_count: 7,
  star_rating: '4',
};

afterEach(() => i18n.changeLanguage('hy'));

describe('listingCardModel — price wording', () => {
  test.each([
    ['hotels', 'HOTEL', 'PER_NIGHT', 'from', 'perNight'],
    ['apartments', 'PROPERTY', 'PER_NIGHT', 'from', 'perNight'],
    ['villas', 'PROPERTY', 'PER_NIGHT', 'from', 'perNight'],
    ['guest-houses', 'PROPERTY', 'PER_NIGHT', 'from', 'perNight'],
    ['tours', 'TOUR', 'PER_PERSON', 'from', 'perPerson'],
    ['car-rentals', 'CAR_RENTAL', 'PER_DAY', 'from', 'perDay'],
    ['attractions', 'ATTRACTION', 'PER_PERSON', 'from', 'perPerson'],
    ['entertainment-venues', 'ATTRACTION', 'PER_PERSON', 'from', 'perPerson'],
  ])('%s: "%s" with its own basis', async (slug, type, model_, lead, unit) => {
    await i18n.changeLanguage('en');
    const { price } = model({
      ...DTO,
      category_slug: slug,
      listing_type: type,
      pricing_model: model_,
    });
    expect(price.lead).toBe(lead);
    expect(price.basisLabel).toBe(i18n.t(`search.card.priceUnit.${unit}`));
  });

  test('a restaurant shows its average spend per person — never "from"', async () => {
    await i18n.changeLanguage('en');
    const { price } = model({
      ...DTO,
      category_slug: 'restaurants',
      listing_type: 'RESTAURANT',
      pricing_model: 'PER_PERSON',
    });
    expect(price).toMatchObject({ lead: 'average', basisLabel: '/ person' });
  });

  test('a legacy PER_HOUR listing shows its price with no basis', () => {
    const { price } = model({
      ...DTO,
      category_slug: 'tours',
      pricing_model: 'PER_HOUR',
    });
    expect(price.basisLabel).toBeNull();
  });

  test.each([
    ['no amount', { price_amount: null }],
    ['an empty amount', { price_amount: '' }],
    ['a non-numeric amount', { price_amount: 'free!' }],
    ['a negative amount', { price_amount: '-5' }],
    ['an amount without its currency', { price_currency_code: null }],
  ])('%s is "not listed", never an invented figure', (_name, change) => {
    expect(model({ ...DTO, ...change }).price).toBeNull();
  });
});

describe('listingCardModel — rating and the "Top guest rating" rule', () => {
  test('a rating needs at least one approved review and a real average', () => {
    expect(resolveCardRating(DTO)).toEqual({ average: '4.7', count: 7 });
    expect(
      resolveCardRating({ review_count: 0, rating_average: null }),
    ).toBeNull();
    expect(
      resolveCardRating({ review_count: 3, rating_average: null }),
    ).toBeNull();
    expect(
      resolveCardRating({ review_count: 0, rating_average: 5 }),
    ).toBeNull();
  });

  test('top rated only from enough reviews at the top step', () => {
    expect(TOP_RATING_MIN).toBe(4.5);
    expect(TOP_RATING_MIN_REVIEWS).toBe(3);
    expect(isTopRated({ rating_average: 4.5, review_count: 3 })).toBe(true);
    expect(isTopRated({ rating_average: 5, review_count: 2 })).toBe(false);
    expect(isTopRated({ rating_average: 4.4, review_count: 50 })).toBe(false);
    expect(isTopRated({ rating_average: null, review_count: 9 })).toBe(false);
  });
});

describe('listingCardModel — what the card says', () => {
  test('names the precise category, not the shared listing type', async () => {
    await i18n.changeLanguage('en');
    expect(
      model({ ...DTO, category_slug: 'villas', listing_type: 'PROPERTY' })
        .typeLabel,
    ).toBe('Villa');
    expect(
      model({
        ...DTO,
        category_slug: 'entertainment-venues',
        listing_type: 'ATTRACTION',
      }).typeLabel,
    ).toBe('Entertainment');
    // A row without a slug falls back to its listing type.
    expect(
      model({ ...DTO, category_slug: null, listing_type: 'TOUR' }).typeLabel,
    ).toBe('Tour');
  });

  test(`keeps at most ${CARD_FACT_LIMIT} category facts`, () => {
    const { facts } = model({
      ...DTO,
      category_slug: 'restaurants',
      listing_type: 'RESTAURANT',
      cuisine: ['ARMENIAN', 'GEORGIAN', 'ITALIAN'],
      reservable: true,
      amenities: ['OUTDOOR_SEATING', 'LIVE_MUSIC', 'PARKING'],
    });
    expect(facts).toHaveLength(CARD_FACT_LIMIT);
  });

  test('a missing or blank title is named honestly, never left empty', async () => {
    await i18n.changeLanguage('en');
    expect(model({ ...DTO, title: '   ' }).title).toBe('Untitled listing');
    expect(model({ ...DTO, title: null }).title).toBe('Untitled listing');
  });

  test('script-shaped text stays plain text for the card to render', () => {
    const title = '<img src=x onerror=alert(1)>';
    expect(model({ ...DTO, title }).title).toBe(title);
  });

  test('reads only whitelisted fields', () => {
    const card = model({
      ...DTO,
      partner_id: 3,
      status: 'DRAFT',
      latitude: 40.1,
    });
    expect(JSON.stringify(card)).not.toMatch(/DRAFT|40\.1|partner/);
  });
});

describe('safeMediaUrl', () => {
  test.each([
    ['/uploads/a.webp', '/uploads/a.webp'],
    ['https://cdn.example/a.jpg', 'https://cdn.example/a.jpg'],
    ['http://localhost:4000/a.jpg', 'http://localhost:4000/a.jpg'],
  ])('keeps %s', (url, expected) => {
    expect(safeMediaUrl(url)).toBe(expected);
  });

  test.each([
    /* eslint-disable no-script-url -- the hostile inputs under test */
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    /* eslint-enable no-script-url */
    'data:image/svg+xml;base64,PHN2Zz4=',
    '//evil.example/a.jpg',
    'not a url',
    '',
    '   ',
    null,
    undefined,
    42,
  ])('drops %s', (url) => {
    expect(safeMediaUrl(url)).toBeNull();
  });
});

/**
 * Phase 10 (redesign): unit coverage for the two new public Partner DTO
 * mappings — pure functions, no database needed, mirroring
 * `tests/unit/modules/listings/listingDto.test.js`'s convention.
 */

import { describe, test, expect } from '@jest/globals';
import {
  toPartnerSummaryResponse,
  toPartnerDetailResponse,
  toPartnerListingResponse,
} from '../../../../src/modules/partners/dto/partnerDto.js';

const SUMMARY_DOMAIN = {
  id: 1,
  slug: 'yerevan-boutique-hospitality',
  displayName: 'Yerevan Boutique Hospitality',
  description: 'A boutique hospitality partner.',
  logoUrl: 'https://cdn.example/logo.png',
  coverUrl: null,
  listingCount: 4,
  isVerified: true,
};

describe('toPartnerSummaryResponse', () => {
  test('maps the domain shape to the public response shape', () => {
    expect(toPartnerSummaryResponse(SUMMARY_DOMAIN)).toEqual({
      id: 1,
      slug: 'yerevan-boutique-hospitality',
      display_name: 'Yerevan Boutique Hospitality',
      description: 'A boutique hospitality partner.',
      logo_url: 'https://cdn.example/logo.png',
      cover_url: null,
      listing_count: 4,
      is_verified: true,
    });
  });
});

describe('toPartnerDetailResponse', () => {
  test('extends the summary shape with contact fields', () => {
    const response = toPartnerDetailResponse({
      ...SUMMARY_DOMAIN,
      email: 'hello@example.com',
      phone: '+37411000000',
      website: 'https://example.com',
      socialLinks: { instagram: 'https://instagram.com/example' },
    });

    expect(response).toEqual({
      id: 1,
      slug: 'yerevan-boutique-hospitality',
      display_name: 'Yerevan Boutique Hospitality',
      description: 'A boutique hospitality partner.',
      logo_url: 'https://cdn.example/logo.png',
      cover_url: null,
      listing_count: 4,
      is_verified: true,
      email: 'hello@example.com',
      phone: '+37411000000',
      website: 'https://example.com',
      social_links: { instagram: 'https://instagram.com/example' },
      translations: [],
    });
  });

  // P1.3 (Master Roadmap): the real, locale-aware source of truth for
  // `description` — the flat `description` field above stays only as
  // the "any available" directory-card fallback (see
  // `mysqlPartnerRepository.js`'s own comment on that subquery).
  test('P1.3: maps translations to the public response shape', () => {
    const response = toPartnerDetailResponse({
      ...SUMMARY_DOMAIN,
      email: 'hello@example.com',
      phone: '+37411000000',
      website: 'https://example.com',
      socialLinks: {},
      translations: [
        { languageId: 1, languageCode: 'en', description: 'In English.' },
        { languageId: 2, languageCode: 'hy', description: 'Հայերենով.' },
      ],
    });

    expect(response.translations).toEqual([
      { language_id: 1, language_code: 'en', description: 'In English.' },
      { language_id: 2, language_code: 'hy', description: 'Հայերենով.' },
    ]);
  });
});

// Company Public Profile (Step A1) — pure DTO coverage, no database
// needed, mirroring `favoriteDto.test.js`'s equivalent convention.
describe('toPartnerListingResponse', () => {
  const BASE_ITEM = {
    id: 5,
    slug: 'sunset-hotel',
    listingTypeCode: 'HOTEL',
    title: 'Sunset Hotel',
    cityName: 'Yerevan',
    coverImageUrl: null,
    priceAmount: '99.00',
    priceCurrencyCode: 'USD',
    ratingAverage: 4.5,
    reviewCount: 3,
  };

  test("maps the same category-metadata fields searchDto.js's toSearchResultResponse does", () => {
    const response = toPartnerListingResponse({
      ...BASE_ITEM,
      categorySlug: 'hotels',
      cuisineCodes: null,
      priceTierCode: null,
      starRatingCode: '4',
      transmissionCode: null,
      bedroomsValue: null,
      durationMinutesValue: null,
    });
    expect(response.category_slug).toBe('hotels');
    expect(response.star_rating).toBe('4');
    expect(response.cuisine).toBeNull();
    expect(response.price_tier).toBeNull();
    expect(response.transmission).toBeNull();
    expect(response.bedrooms).toBeNull();
    expect(response.duration_minutes).toBeNull();
  });

  test('never fabricates a category_slug or metadata value when the domain item has none (real value or null only)', () => {
    const response = toPartnerListingResponse({
      ...BASE_ITEM,
      categorySlug: null,
      cuisineCodes: null,
      priceTierCode: null,
      starRatingCode: null,
      transmissionCode: null,
      bedroomsValue: null,
      durationMinutesValue: null,
    });
    expect(response.category_slug).toBeNull();
    expect(response.cuisine).toBeNull();
    expect(response.price_tier).toBeNull();
    expect(response.star_rating).toBeNull();
    expect(response.transmission).toBeNull();
    expect(response.bedrooms).toBeNull();
    expect(response.duration_minutes).toBeNull();
  });

  test("maps a Restaurant listing's real multi-value cuisine array through", () => {
    const response = toPartnerListingResponse({
      ...BASE_ITEM,
      listingTypeCode: 'RESTAURANT',
      categorySlug: 'restaurants',
      cuisineCodes: ['ARMENIAN', 'GEORGIAN'],
      priceTierCode: '$$',
    });
    expect(response.cuisine).toEqual(['ARMENIAN', 'GEORGIAN']);
    expect(response.price_tier).toBe('$$');
  });

  test('never exposes partner/internal fields — only the fixed public card shape', () => {
    const response = toPartnerListingResponse({
      ...BASE_ITEM,
      categorySlug: 'hotels',
    });
    expect(response).not.toHaveProperty('partnerId');
    expect(response).not.toHaveProperty('partner_id');
    expect(response).not.toHaveProperty('ownerUserId');
    expect(Object.keys(response).sort()).toEqual(
      [
        'bedrooms',
        'category_slug',
        'cover_image_url',
        'cuisine',
        'duration_minutes',
        'id',
        'listing_type',
        'price_amount',
        'price_currency_code',
        'price_tier',
        'rating_average',
        'review_count',
        'slug',
        'star_rating',
        'title',
        'transmission',
        'city_name',
      ].sort(),
    );
  });

  test('still maps the base fields unchanged', () => {
    const response = toPartnerListingResponse({
      ...BASE_ITEM,
      categorySlug: 'hotels',
    });
    expect(response).toMatchObject({
      id: 5,
      slug: 'sunset-hotel',
      listing_type: 'HOTEL',
      title: 'Sunset Hotel',
      city_name: 'Yerevan',
      cover_image_url: null,
      price_amount: '99.00',
      price_currency_code: 'USD',
      rating_average: 4.5,
      review_count: 3,
    });
  });
});

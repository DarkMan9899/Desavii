import { describe, test, expect } from '@jest/globals';
import { toFavoritedListingResponse } from '../../../../src/modules/favorites/dto/favoriteDto.js';

const BASE_ITEM = {
  favoriteId: 1,
  favoritedAt: '2026-07-01T00:00:00.000Z',
  id: 5,
  listingTypeCode: 'HOTEL',
  statusCode: 'PUBLISHED',
  slug: 'sunset-villa',
  title: 'Sunset Villa',
  cityName: 'Yerevan',
  coverImageUrl: null,
  priceAmount: '150.00',
  priceCurrencyCode: 'USD',
  ratingAverage: 4.5,
  reviewCount: 3,
};

describe('toFavoritedListingResponse (card-composition-closure fix)', () => {
  test("maps the same category-metadata fields searchDto.js's toSearchResultResponse does", () => {
    const response = toFavoritedListingResponse({
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
    const response = toFavoritedListingResponse({
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

  test("maps a Car Rental favorite's real transmission value through", () => {
    const response = toFavoritedListingResponse({
      ...BASE_ITEM,
      listingTypeCode: 'CAR_RENTAL',
      categorySlug: 'car-rentals',
      transmissionCode: 'AUTOMATIC',
    });
    expect(response.category_slug).toBe('car-rentals');
    expect(response.transmission).toBe('AUTOMATIC');
  });

  test("maps a Restaurant favorite's real multi-value cuisine array through", () => {
    const response = toFavoritedListingResponse({
      ...BASE_ITEM,
      listingTypeCode: 'RESTAURANT',
      categorySlug: 'restaurants',
      cuisineCodes: ['ARMENIAN', 'GEORGIAN'],
      priceTierCode: '$$',
    });
    expect(response.cuisine).toEqual(['ARMENIAN', 'GEORGIAN']);
    expect(response.price_tier).toBe('$$');
  });

  test('still maps the pre-existing fields unchanged (no regression to the original DTO shape)', () => {
    const response = toFavoritedListingResponse(BASE_ITEM);
    expect(response).toMatchObject({
      favorite_id: 1,
      favorited_at: '2026-07-01T00:00:00.000Z',
      listing_id: 5,
      listing_type: 'HOTEL',
      status: 'PUBLISHED',
      slug: 'sunset-villa',
      title: 'Sunset Villa',
      city_name: 'Yerevan',
      cover_image_url: null,
      price_amount: '150.00',
      price_currency_code: 'USD',
      rating_average: 4.5,
      review_count: 3,
    });
  });
});

import { describe, test, expect } from '@jest/globals';
import {
  toSearchResultResponse,
  toOwnerSearchResultResponse,
} from '../../../../src/modules/search/dto/searchDto.js';

// A domain row carrying every field the repository can load, including the
// ones the public card must never send.
const ROW = {
  id: 7,
  partnerId: 3,
  listingTypeCode: 'HOTEL',
  slug: 'ararat-view',
  statusCode: 'PUBLISHED',
  title: 'Ararat View',
  summary: 'A quiet hotel',
  cityId: 11,
  cityName: 'Yerevan',
  countryId: 1,
  coverImageUrl: '/uploads/listings/7/cover.webp',
  priceAmount: '42000.00',
  priceCurrencyCode: 'AMD',
  mediaCount: 5,
  ratingAverage: '4.70',
  reviewCount: 7,
  createdAt: '2026-01-02T03:04:05.000Z',
  categorySlug: 'hotels',
  cuisineCodes: null,
  priceTierCode: null,
  starRatingCode: 'FOUR',
  transmissionCode: null,
  bedroomsValue: null,
  durationMinutesValue: null,
  pricingModelCode: 'PER_NIGHT',
  maxGuestsValue: 2,
  amenityCodes: ['POOL', 'PARKING'],
  isReservable: false,
  publicationPeriodDays: 30,
  expiresAt: '2026-02-01T00:00:00.000Z',
  frozenAt: null,
  purgeAfter: null,
  renewedAt: null,
};

// The exact public card contract (docs/LISTING_CARDS.md, API_SPECIFICATION
// §14.1). A new key here must be a deliberate, reviewed decision.
const PUBLIC_FIELDS = [
  'amenities',
  'attraction_type',
  'bedrooms',
  'body_type',
  'category_slug',
  'city_name',
  'cover_image_url',
  'created_at',
  'cuisine',
  'duration_minutes',
  'fuel_type',
  'id',
  'languages_offered',
  'listing_type',
  'max_group_size',
  'max_guests',
  'media_count',
  'min_age',
  'price_amount',
  'price_currency_code',
  'price_tier',
  'pricing_model',
  'rating_average',
  'reservable',
  'review_count',
  'seats',
  'slug',
  'star_rating',
  'title',
  'tour_format',
  'transmission',
  'venue_type',
  'visit_format',
];

const OWNER_ONLY_FIELDS = [
  'expires_at',
  'frozen_at',
  'publication_period_days',
  'purge_after',
  'renewed_at',
  'status',
];

describe('toSearchResultResponse — the public listing card', () => {
  test('sends exactly the public card fields', () => {
    expect(Object.keys(toSearchResultResponse(ROW)).sort()).toEqual(
      PUBLIC_FIELDS,
    );
  });

  test.each(['partner_id', 'status', 'summary', 'city_id', 'country_id'])(
    'never sends %s, even when the row has it',
    (field) => {
      expect(toSearchResultResponse(ROW)).not.toHaveProperty(field);
    },
  );

  test('never sends an owner lifecycle field', () => {
    const response = toSearchResultResponse(ROW);
    OWNER_ONLY_FIELDS.forEach((field) => {
      expect(response).not.toHaveProperty(field);
    });
  });

  test('carries the shared card facts', () => {
    const response = toSearchResultResponse(ROW);
    expect(response.max_guests).toBe(2);
    expect(response.amenities).toEqual(['POOL', 'PARKING']);
    expect(response.reservable).toBe(false);
    expect(response.seats).toBeNull();
  });

  test('keeps created_at — the sitemap lastmod', () => {
    expect(toSearchResultResponse(ROW).created_at).toBe(ROW.createdAt);
  });

  test('adds promotion_id only to a paid placement', () => {
    expect(toSearchResultResponse(ROW)).not.toHaveProperty('promotion_id');
    expect(
      Object.keys(toSearchResultResponse({ ...ROW, promotionId: 9 })).sort(),
    ).toEqual([...PUBLIC_FIELDS, 'promotion_id'].sort());
  });
});

describe('toOwnerSearchResultResponse — the owner/moderator view', () => {
  test('is the public card plus status and the lifecycle fields', () => {
    const response = toOwnerSearchResultResponse(ROW);
    expect(Object.keys(response).sort()).toEqual(
      [...PUBLIC_FIELDS, ...OWNER_ONLY_FIELDS].sort(),
    );
    expect(response.status).toBe('PUBLISHED');
    expect(response.expires_at).toBe(ROW.expiresAt);
  });

  test('still never sends the partner id, summary or location ids', () => {
    const response = toOwnerSearchResultResponse(ROW);
    ['partner_id', 'summary', 'city_id', 'country_id'].forEach((field) => {
      expect(response).not.toHaveProperty(field);
    });
  });
});

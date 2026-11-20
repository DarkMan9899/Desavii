import { describe, test, expect } from '@jest/globals';
import {
  toPublicListingResponse,
  toListingResponse,
} from '../../../../src/modules/listings/dto/listingDto.js';

function listing(overrides = {}) {
  return {
    id: 1,
    partnerId: 5,
    listingTypeCode: 'HOTEL',
    slug: 'ararat-view',
    statusCode: 'PUBLISHED',
    moderationStatusCode: 'APPROVED',
    moderationNotes: 'internal note',
    isContactVisible: true,
    isFeatured: true,
    publishedAt: '2026-01-01T00:00:00.000Z',
    unpublishedAt: null,
    archivedAt: null,
    canonicalUrl: null,
    ogImageMediaId: 9,
    isIndexable: true,
    isSitemapIncluded: true,
    translations: [],
    location: {
      addressId: 3,
      addressLine: '5 Abovyan St',
      cityId: 1,
      cityName: 'Yerevan',
      countryName: 'Armenia',
      latitude: 40.18123,
      longitude: 44.51456,
    },
    categoryIds: [1],
    amenityIds: [2],
    media: [
      {
        id: 7,
        mediaTypeCode: 'IMAGE',
        url: '/uploads/listings/1/a.webp',
        thumbnailUrl: '/uploads/listings/1/a-thumb.webp',
        position: 0,
        isCover: true,
        moderationStatusCode: 'APPROVED',
        mimeType: 'image/webp',
        fileSizeBytes: 123456,
        createdAt: '2026-01-01T00:00:00.000Z',
        altText: 'Lobby',
        caption: null,
      },
    ],
    attributeValues: [],
    policyValues: [],
    pricing: null,
    bookingRules: null,
    ratingAverage: 4.5,
    reviewCount: 3,
    company: {
      slug: 'ararat-stays',
      displayName: 'Ararat Stays',
      logoUrl: null,
      isVerified: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

// The exact public Listing Detail contract (docs/LISTING_DETAIL_REDESIGN.md).
// A new key here must be a deliberate, reviewed decision.
const PUBLIC_FIELDS = [
  'amenity_ids',
  'attribute_values',
  'booking_rules',
  'category_ids',
  'company',
  'faqs',
  'guest_notes',
  'highlights',
  'id',
  'included_items',
  'is_indexable',
  'itinerary_steps',
  'listing_type',
  'location',
  'media',
  'policy_values',
  'pricing',
  'published_at',
  'rating_average',
  'review_count',
  'slug',
  'status',
  'translations',
];

describe('toPublicListingResponse — the public Listing Detail', () => {
  test('sends exactly the public fields', () => {
    expect(Object.keys(toPublicListingResponse(listing())).sort()).toEqual(
      PUBLIC_FIELDS,
    );
  });

  test.each([
    'partner_id',
    'moderation_status',
    'moderation_notes',
    'is_contact_visible',
    'is_featured',
    'unpublished_at',
    'archived_at',
    'og_image_media_id',
    'is_sitemap_included',
    'canonical_url',
    'created_at',
    'updated_at',
  ])('never sends %s', (field) => {
    expect(toPublicListingResponse(listing())).not.toHaveProperty(field);
  });

  test('media carry what a page shows, never upload or moderation internals', () => {
    expect(
      Object.keys(toPublicListingResponse(listing()).media[0]).sort(),
    ).toEqual([
      'alt_text',
      'caption',
      'id',
      'is_cover',
      'media_type',
      'position',
      'thumbnail_url',
      'url',
    ]);
  });

  test('a private stay: approximate point, no street address, no address id', () => {
    const { location } = toPublicListingResponse(
      listing({ listingTypeCode: 'PROPERTY' }),
    );
    expect(location.location_precision).toBe('approximate');
    expect(location.address_line).toBeNull();
    expect(location).not.toHaveProperty('address_id');
    expect(location.latitude).not.toBe(40.18123);
    expect(location.longitude).not.toBe(44.51456);
  });

  test('a public venue keeps its public address and point, never the address id', () => {
    const { location } = toPublicListingResponse(listing());
    expect(location).toMatchObject({
      address_line: '5 Abovyan St',
      latitude: 40.18123,
      location_precision: 'exact',
    });
    expect(location).not.toHaveProperty('address_id');
  });

  test('the company block is its public identity only', () => {
    expect(toPublicListingResponse(listing()).company).toEqual({
      slug: 'ararat-stays',
      display_name: 'Ararat Stays',
      logo_url: null,
      is_verified: true,
    });
  });

  test('the management shape still carries what partners and admins need', () => {
    const managed = toListingResponse(listing(), {
      includeModerationNotes: true,
      includePrivateAddress: true,
    });
    expect(managed).toMatchObject({
      partner_id: 5,
      moderation_status: 'APPROVED',
      moderation_notes: 'internal note',
    });
  });
});

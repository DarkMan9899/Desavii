/**
 * Phase 6 (Listing Details): unit coverage for the two additive DTO
 * mappings — `toTranslationResponse`'s `language_code` passthrough and
 * `toLocationResponse`'s `city_name`/`country_name` passthrough. Pure
 * mapping functions, no database needed, mirroring
 * `tests/unit/modules/search/mysqlSearchRepository.buildQuery.test.js`'s
 * "unit-test the mapping/query-building logic, not the DB" convention.
 */

import { describe, test, expect } from '@jest/globals';
import {
  toTranslationResponse,
  toLocationResponse,
  toListingResponse,
  toListingOwnerResponse,
  toListingAdminDetailResponse,
  toCompanyAttributionResponse,
  toGuestNoteResponse,
} from '../../../../src/modules/listings/dto/listingDto.js';

describe('toTranslationResponse', () => {
  test('passes through language_code alongside the existing fields', () => {
    const response = toTranslationResponse({
      languageId: 2,
      languageCode: 'hy',
      title: 'Հրաշալի վիլլա',
      summary: 'Ամփոփում',
      description: 'Նկարագրություն',
      seoTitle: null,
      seoDescription: null,
    });

    expect(response).toEqual({
      language_id: 2,
      language_code: 'hy',
      title: 'Հրաշալի վիլլա',
      summary: 'Ամփոփում',
      description: 'Նկարագրություն',
      seo_title: null,
      seo_description: null,
    });
  });
});

describe('toLocationResponse', () => {
  test('returns null when the listing has no location', () => {
    expect(toLocationResponse(null)).toBeNull();
  });

  test('passes through city_name/country_name alongside the existing fields', () => {
    const response = toLocationResponse({
      addressId: null,
      cityId: 1,
      cityName: 'Yerevan',
      countryName: 'Armenia',
      latitude: 40.1772,
      longitude: 44.5035,
    });

    expect(response).toEqual({
      address_id: null,
      address_line: null,
      city_id: 1,
      city_name: 'Yerevan',
      country_name: 'Armenia',
      latitude: 40.1772,
      longitude: 44.5035,
      location_precision: 'exact',
    });
  });

  test('city_name/country_name are undefined when the location has no resolvable city', () => {
    const response = toLocationResponse({
      addressId: null,
      cityId: null,
      cityName: undefined,
      countryName: undefined,
      latitude: null,
      longitude: null,
    });

    expect(response.city_name).toBeUndefined();
    expect(response.country_name).toBeUndefined();
  });

  test('the precise place is public unless withheld, then address and point are hidden', () => {
    const location = {
      addressId: 3,
      addressLine: '5 Abovyan St',
      cityId: 1,
      latitude: 40.1772,
      longitude: 44.5035,
    };
    expect(toLocationResponse(location)).toMatchObject({
      address_id: 3,
      address_line: '5 Abovyan St',
      latitude: 40.1772,
      longitude: 44.5035,
      location_precision: 'exact',
    });
    // The Search Map's grid-cell centre, never the stored point.
    expect(
      toLocationResponse(location, { isPublicPrecise: false }),
    ).toMatchObject({
      address_id: null,
      address_line: null,
      city_id: 1,
      latitude: 40.175,
      longitude: 44.505,
      location_precision: 'approximate',
    });
  });
});

describe('toListingResponse (Phase 9: Partner Dashboard)', () => {
  function baseListing(overrides = {}) {
    return {
      id: 1,
      partnerId: 5,
      listingTypeCode: 'HOTEL',
      slug: 'test-hotel',
      statusCode: 'ARCHIVED',
      moderationStatusCode: 'APPROVED',
      isContactVisible: true,
      isFeatured: false,
      publishedAt: '2026-01-01T00:00:00.000Z',
      unpublishedAt: '2026-01-05T00:00:00.000Z',
      archivedAt: '2026-01-10T00:00:00.000Z',
      canonicalUrl: null,
      ogImageMediaId: null,
      isIndexable: true,
      isSitemapIncluded: true,
      translations: [],
      location: null,
      categoryIds: [],
      amenityIds: [],
      media: [],
      attributeValues: [],
      policyValues: [],
      pricing: null,
      bookingRules: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
      ...overrides,
    };
  }

  test('includes archived_at alongside published_at/unpublished_at', () => {
    const response = toListingResponse(baseListing());
    expect(response.archived_at).toBe('2026-01-10T00:00:00.000Z');
    expect(response.published_at).toBe('2026-01-01T00:00:00.000Z');
    expect(response.unpublished_at).toBe('2026-01-05T00:00:00.000Z');
  });

  test("a private stay's street address is shown only to those who manage it", () => {
    const location = {
      addressId: 3,
      addressLine: '5 Abovyan St',
      cityId: 1,
      latitude: 40.18,
      longitude: 44.51,
    };
    const property = baseListing({ listingTypeCode: 'PROPERTY', location });
    const hotel = baseListing({ listingTypeCode: 'HOTEL', location });

    // Withheld by default: a caller must opt in to disclose a home address.
    expect(toListingResponse(property).location.address_line).toBeNull();
    expect(
      toListingResponse(property, { includePrivateAddress: false }).location
        .address_line,
    ).toBeNull();
    expect(
      toListingResponse(property, { includePrivateAddress: true }).location
        .address_line,
    ).toBe('5 Abovyan St');
    // Every other listing type's address is public.
    expect(toListingResponse(hotel).location.address_line).toBe('5 Abovyan St');
  });

  test("a private stay's public point is approximate; its managers see the exact one", () => {
    const location = { cityId: 1, latitude: 40.18, longitude: 44.51 };
    const property = baseListing({ listingTypeCode: 'PROPERTY', location });

    expect(toListingResponse(property).location).toMatchObject({
      latitude: 40.185,
      longitude: 44.515,
      location_precision: 'approximate',
    });
    expect(
      toListingResponse(property, { includePrivateAddress: true }).location,
    ).toMatchObject({
      latitude: 40.18,
      longitude: 44.51,
      location_precision: 'exact',
    });
    expect(
      toListingResponse(baseListing({ listingTypeCode: 'HOTEL', location }))
        .location.location_precision,
    ).toBe('exact');
  });

  test("the owner and admin responses carry a private stay's address", () => {
    const property = baseListing({
      listingTypeCode: 'PROPERTY',
      location: { addressId: 3, addressLine: '5 Abovyan St', cityId: 1 },
    });

    expect(toListingOwnerResponse(property).location.address_line).toBe(
      '5 Abovyan St',
    );
    expect(toListingAdminDetailResponse(property).location.address_line).toBe(
      '5 Abovyan St',
    );
  });

  test('archived_at is null for a listing that has never been archived', () => {
    const response = toListingResponse(baseListing({ archivedAt: null }));
    expect(response.archived_at).toBeNull();
  });

  test('company is null when the repository resolved no public company', () => {
    const response = toListingResponse(baseListing({ company: null }));
    expect(response.company).toBeNull();
  });

  test('company is null when the field was never fetched (undefined)', () => {
    const response = toListingResponse(baseListing());
    expect(response.company).toBeNull();
  });

  test('carries the guest notes of every language, and an empty list when none were fetched', () => {
    const response = toListingResponse(
      baseListing({
        listingTypeCode: 'TOUR',
        guestNotes: [
          {
            id: 4,
            languageId: 1,
            languageCode: 'en',
            kind: 'BRING',
            text: 'Water',
            sortOrder: 0,
          },
        ],
      }),
    );
    expect(response.guest_notes).toEqual([
      { id: 4, language_code: 'en', kind: 'BRING', text: 'Water' },
    ]);
    expect(toListingResponse(baseListing()).guest_notes).toEqual([]);
  });
});

describe('toGuestNoteResponse', () => {
  test('exposes only the public fields — no audit columns or internal ids', () => {
    expect(
      toGuestNoteResponse({
        id: 9,
        languageId: 2,
        languageCode: 'hy',
        kind: 'NOT_ALLOWED',
        text: 'Դրոններ',
        sortOrder: 1,
        createdBy: 7,
      }),
    ).toEqual({
      id: 9,
      language_code: 'hy',
      kind: 'NOT_ALLOWED',
      text: 'Դրոններ',
    });
  });
});

describe('toCompanyAttributionResponse (Step A3: Listing → Company Linking)', () => {
  test('returns null for a listing whose partner is not publicly eligible', () => {
    expect(toCompanyAttributionResponse(null)).toBeNull();
  });

  test('maps real company fields, and only those fields', () => {
    const response = toCompanyAttributionResponse({
      slug: 'ararat-grand-hotels',
      displayName: 'Ararat Grand Hotels',
      logoUrl: 'https://cdn.example.com/logo.png',
      isVerified: true,
    });

    expect(response).toEqual({
      slug: 'ararat-grand-hotels',
      display_name: 'Ararat Grand Hotels',
      logo_url: 'https://cdn.example.com/logo.png',
      is_verified: true,
    });
    // Never leaks private partner fields (owner/legal/contact/moderation
    // internals) — the repository never even selects them for this read,
    // but this asserts the DTO's own contract too.
    expect(response).not.toHaveProperty('owner_user_id');
    expect(response).not.toHaveProperty('legal_name');
    expect(response).not.toHaveProperty('email');
    expect(response).not.toHaveProperty('phone');
  });

  test('logo_url is null when the company has no logo, never fabricated', () => {
    const response = toCompanyAttributionResponse({
      slug: 'no-logo-co',
      displayName: 'No Logo Co',
      logoUrl: null,
      isVerified: false,
    });
    expect(response.logo_url).toBeNull();
    expect(response.is_verified).toBe(false);
  });
});

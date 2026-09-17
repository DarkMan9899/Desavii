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
  toCompanyAttributionResponse,
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
      city_id: 1,
      city_name: 'Yerevan',
      country_name: 'Armenia',
      latitude: 40.1772,
      longitude: 44.5035,
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

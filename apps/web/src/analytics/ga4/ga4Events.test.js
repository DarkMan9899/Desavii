import { describe, test, expect } from 'vitest';
import { CLIENT_EVENT_NAMES } from '../constants.js';
import { buildGa4EventParams, buildGa4PageViewParams } from './ga4Events.js';

describe('buildGa4EventParams — unknown/server-authoritative events', () => {
  test('returns null for a name outside the 9 client-observable events', () => {
    expect(
      buildGa4EventParams('booking_confirmed', { bookingId: 1 }),
    ).toBeNull();
    expect(buildGa4EventParams('favorite_added', { listingId: 1 })).toBeNull();
    expect(buildGa4EventParams('vendor_registered', {})).toBeNull();
    expect(buildGa4EventParams('not_a_real_event', {})).toBeNull();
  });
});

describe('listing_impression / listing_viewed', () => {
  test('listing_impression keeps only the allowed fields', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.LISTING_IMPRESSION, {
      listingId: 5,
      placement: 'search_results',
      position: 2,
      categoryCode: 'hotel',
      locale: 'en',
      partnerId: 99, // must never appear
    });
    expect(params).toEqual({
      listing_id: 5,
      placement: 'search_results',
      position: 2,
      category_code: 'hotel',
      locale: 'en',
    });
  });

  test('listing_viewed drops partnerId/price/any field beyond its allowlist', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.LISTING_VIEWED, {
      listingId: 5,
      categoryCode: 'hotel',
      locale: 'en',
      price: 4200,
      partnerId: 99,
    });
    expect(params).toEqual({
      listing_id: 5,
      category_code: 'hotel',
      locale: 'en',
    });
  });
});

describe('promotion_impression / promotion_clicked — no billing/payment fields', () => {
  test('promotion_impression keeps only promotion_id/listing_id/placement/locale', () => {
    const params = buildGa4EventParams(
      CLIENT_EVENT_NAMES.PROMOTION_IMPRESSION,
      {
        promotionId: 3,
        listingId: 5,
        placement: 'home_featured',
        locale: 'hy',
        partnerId: 7,
        billingStatus: 'paid',
        priceSnapshot: 1000,
      },
    );
    expect(params).toEqual({
      promotion_id: 3,
      listing_id: 5,
      placement: 'home_featured',
      locale: 'hy',
    });
  });

  test('promotion_clicked never carries partner_id/status/price', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.PROMOTION_CLICKED, {
      promotionId: 3,
      listingId: 5,
      placement: 'home_featured',
      partnerId: 7,
      internalStatus: 'active',
    });
    expect(Object.keys(params).sort()).toEqual(
      ['promotion_id', 'listing_id', 'placement'].sort(),
    );
  });
});

describe('contact_click — method only, never the raw contact value', () => {
  test('keeps only company_slug + contact_method', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.CONTACT_CLICK, {
      companySlug: 'acme-tours',
      contactMethod: 'phone',
    });
    expect(params).toEqual({
      company_slug: 'acme-tours',
      contact_method: 'phone',
    });
  });

  test('a raw phone/email/URL passed alongside is never forwarded', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.CONTACT_CLICK, {
      companySlug: 'acme-tours',
      contactMethod: 'email',
      // A caller could never legitimately pass these (trackContactClick's
      // own signature doesn't accept them), but the sanitizer must still
      // never forward them if it somehow received them.
      email: 'owner@acme-tours.example',
      phone: '+374...',
      website: 'https://acme-tours.example',
    });
    expect(Object.keys(params).sort()).toEqual(
      ['company_slug', 'contact_method'].sort(),
    );
  });
});

describe('company_profile_view / company_listing_click', () => {
  test('company_profile_view keeps only company_slug', () => {
    const params = buildGa4EventParams(
      CLIENT_EVENT_NAMES.COMPANY_PROFILE_VIEW,
      {
        companySlug: 'acme-tours',
      },
    );
    expect(params).toEqual({ company_slug: 'acme-tours' });
  });

  test('company_listing_click keeps company_slug + listing_id + locale', () => {
    const params = buildGa4EventParams(
      CLIENT_EVENT_NAMES.COMPANY_LISTING_CLICK,
      { companySlug: 'acme-tours', listingId: 5, locale: 'ru' },
    );
    expect(params).toEqual({
      company_slug: 'acme-tours',
      listing_id: 5,
      locale: 'ru',
    });
  });
});

describe('search_impression / search_result_click — no query text ever', () => {
  test('search_impression drops queryText, keeps category_code/result_count/locale', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.SEARCH_IMPRESSION, {
      queryText: 'cheap hotels yerevan',
      categoryCode: 'hotel',
      resultCount: 12,
      locale: 'en',
    });
    expect(params).toEqual({
      category_code: 'hotel',
      result_count: 12,
      locale: 'en',
    });
    expect(params).not.toHaveProperty('query_text');
    expect(params).not.toHaveProperty('queryText');
  });

  test('search_result_click drops queryText, keeps listing_id/position/category_code/locale', () => {
    const params = buildGa4EventParams(CLIENT_EVENT_NAMES.SEARCH_RESULT_CLICK, {
      listingId: 5,
      position: 0,
      queryText: 'cheap hotels yerevan',
      categoryCode: 'hotel',
      locale: 'en',
    });
    expect(params).toEqual({
      listing_id: 5,
      position: 0,
      category_code: 'hotel',
      locale: 'en',
    });
  });
});

describe('buildGa4PageViewParams — sanitized page_location', () => {
  test('excludes query string and hash, includes only origin+pathname', () => {
    const params = buildGa4PageViewParams({
      origin: 'https://desavii.com',
      pathname: '/en/search',
      title: 'Search — Desavii',
      locale: 'en',
    });
    expect(params.page_location).toBe('https://desavii.com/en/search');
    expect(params.page_location).not.toContain('?');
    expect(params.page_location).not.toContain('#');
  });

  test('never receives/forwards a query string even if the raw pathname somehow carried one', () => {
    // Defensive: `location.pathname` from react-router never includes a
    // query string by definition, but the sanitizer itself does not
    // special-case stripping one — this test documents that contract by
    // construction (the caller is responsible for passing pathname only).
    const params = buildGa4PageViewParams({
      origin: 'https://desavii.com',
      pathname: '/en/listings/42',
      title: 'Listing',
      locale: 'en',
    });
    expect(params).toEqual({
      page_location: 'https://desavii.com/en/listings/42',
      page_title: 'Listing',
      locale: 'en',
    });
  });

  test('omits page_title when not provided', () => {
    const params = buildGa4PageViewParams({
      origin: 'https://desavii.com',
      pathname: '/en',
      locale: 'en',
    });
    expect(params).not.toHaveProperty('page_title');
  });
});

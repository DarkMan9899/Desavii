import { describe, test, expect } from '@jest/globals';
import {
  isUuidV4,
  computeDedupKey,
  classifyDeviceClass,
  classifyTrafficSource,
} from '../../../../src/modules/engagementAnalytics/models/eventContext.js';

describe('isUuidV4', () => {
  test('accepts a genuine UUID v4', () => {
    expect(isUuidV4('4b3f1c9a-2e1d-4a3b-8c2d-1a2b3c4d5e6f')).toBe(true);
  });

  test('rejects a UUID v1 (wrong version nibble)', () => {
    expect(isUuidV4('4b3f1c9a-2e1d-1a3b-8c2d-1a2b3c4d5e6f')).toBe(false);
  });

  test('rejects a non-UUID string', () => {
    expect(isUuidV4('not-a-uuid')).toBe(false);
  });

  test('rejects a non-string value', () => {
    expect(isUuidV4(12345)).toBe(false);
  });
});

describe('computeDedupKey', () => {
  const ctx = {
    sessionId: 'session-1',
    listingId: 5,
    promotionId: 9,
    partnerId: 7,
    placement: 'home_featured',
  };

  test('returns a 32-byte Buffer for listing_impression', () => {
    const key = computeDedupKey('listing_impression', ctx);
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  test('is deterministic for identical inputs', () => {
    const a = computeDedupKey('listing_impression', ctx);
    const b = computeDedupKey('listing_impression', ctx);
    expect(a.equals(b)).toBe(true);
  });

  test('differs when session_id differs', () => {
    const a = computeDedupKey('listing_impression', ctx);
    const b = computeDedupKey('listing_impression', {
      ...ctx,
      sessionId: 'session-2',
    });
    expect(a.equals(b)).toBe(false);
  });

  test('listing_viewed ignores placement (not part of its hash inputs)', () => {
    const a = computeDedupKey('listing_viewed', ctx);
    const b = computeDedupKey('listing_viewed', {
      ...ctx,
      placement: 'category_top',
    });
    expect(a.equals(b)).toBe(true);
  });

  test('company_profile_view hashes the resolved partnerId, not a listingId', () => {
    const a = computeDedupKey('company_profile_view', ctx);
    const b = computeDedupKey('company_profile_view', {
      ...ctx,
      partnerId: 99,
    });
    expect(a.equals(b)).toBe(false);
  });

  test('returns null for an event name with no semantic dedup rule', () => {
    expect(computeDedupKey('contact_click', ctx)).toBeNull();
    expect(computeDedupKey('search_result_click', ctx)).toBeNull();
    expect(computeDedupKey('favorite_added', ctx)).toBeNull();
  });

  test('returns null when a required piece of context is missing', () => {
    expect(
      computeDedupKey('listing_impression', { ...ctx, listingId: null }),
    ).toBeNull();
  });
});

describe('classifyDeviceClass', () => {
  test('classifies a standard iPhone UA as mobile', () => {
    expect(
      classifyDeviceClass(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe('mobile');
  });

  test('classifies an iPad UA as tablet', () => {
    expect(
      classifyDeviceClass(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe('tablet');
  });

  test('classifies a desktop Chrome UA as desktop', () => {
    expect(
      classifyDeviceClass(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
      ),
    ).toBe('desktop');
  });

  test('classifies a missing/empty UA as other', () => {
    expect(classifyDeviceClass(undefined)).toBe('other');
    expect(classifyDeviceClass('')).toBe('other');
  });
});

describe('classifyTrafficSource', () => {
  const internalHost = 'desavii.com';

  test('classifies a missing Referer as direct', () => {
    expect(classifyTrafficSource(undefined, internalHost)).toBe('direct');
  });

  test("classifies the app's own origin as internal", () => {
    expect(
      classifyTrafficSource('https://www.desavii.com/search', internalHost),
    ).toBe('internal');
  });

  test('classifies a search engine Referer as search', () => {
    expect(
      classifyTrafficSource(
        'https://www.google.com/search?q=hotels',
        internalHost,
      ),
    ).toBe('search');
  });

  test('classifies a social Referer as social', () => {
    expect(
      classifyTrafficSource('https://www.instagram.com/', internalHost),
    ).toBe('social');
  });

  test('classifies an unrecognized external Referer as referral', () => {
    expect(
      classifyTrafficSource(
        'https://some-travel-blog.example/post',
        internalHost,
      ),
    ).toBe('referral');
  });

  test('classifies a malformed Referer value as unknown', () => {
    expect(classifyTrafficSource('not a url', internalHost)).toBe('unknown');
  });
});

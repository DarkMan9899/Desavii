import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resetQueueForTests,
  getQueueLengthForTests,
  peekQueueForTests,
} from './analyticsQueue.js';
import { resetInMemoryIdentityForTests } from './analyticsIdentity.js';
import {
  trackListingImpression,
  trackListingViewed,
  trackPromotionImpression,
  trackContactClick,
  trackCompanyProfileView,
  trackSearchResultClick,
  resetDedupForTests,
} from './analyticsClient.js';

// `isAnalyticsCollectionEnabled()` reads `import.meta.env` on every call
// (never cached at import time), so `vi.stubEnv` per test is enough —
// no `vi.resetModules()`/dynamic re-import needed, and none of this
// file's other module-level state (the queue, the dedup Set) would
// survive a module reset anyway.
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetInMemoryIdentityForTests();
  resetQueueForTests();
  resetDedupForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetQueueForTests();
});

describe('collection disabled (default)', () => {
  test('trackEvent is a no-op: no identity created, nothing enqueued', () => {
    vi.stubEnv('VITE_ANALYTICS_COLLECTION_ENABLED', 'false');
    trackListingViewed({ listingId: 5 });
    expect(
      window.localStorage.getItem('desavii_analytics_visitor_id'),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem('desavii_analytics_session_id'),
    ).toBeNull();
    expect(getQueueLengthForTests()).toBe(0);
  });

  test('unset env (no .env at all) is also treated as disabled', () => {
    vi.stubEnv('VITE_ANALYTICS_COLLECTION_ENABLED', undefined);
    trackListingViewed({ listingId: 5 });
    expect(getQueueLengthForTests()).toBe(0);
  });
});

describe('collection enabled', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_ANALYTICS_COLLECTION_ENABLED', 'true');
  });

  test('trackListingImpression enqueues listing_impression with the exact A2 field names', () => {
    trackListingImpression({
      listingId: 5,
      placement: 'search_results',
      position: 2,
    });
    expect(getQueueLengthForTests()).toBe(1);
    const [sentEvent] = peekQueueForTests();
    expect(sentEvent).toMatchObject({
      eventName: 'listing_impression',
      listingId: 5,
      placement: 'search_results',
      position: 2,
    });
  });

  test('a genuine trackEvent creates real visitor/session ids', () => {
    trackListingViewed({ listingId: 5 });
    expect(
      window.localStorage.getItem('desavii_analytics_visitor_id'),
    ).toBeTruthy();
    expect(
      window.sessionStorage.getItem('desavii_analytics_session_id'),
    ).toBeTruthy();
  });

  test('every event gets its own unique event_id', () => {
    trackListingViewed({ listingId: 5 });
    trackListingViewed({ listingId: 6 });
    const [first, second] = peekQueueForTests();
    expect(first.eventId).toBeTruthy();
    expect(second.eventId).toBeTruthy();
    expect(first.eventId).not.toBe(second.eventId);
  });

  test('never sends a client-supplied occurred_at field', () => {
    trackListingViewed({ listingId: 5 });
    const [sentEvent] = peekQueueForTests();
    expect(sentEvent).not.toHaveProperty('occurredAt');
    expect(sentEvent).not.toHaveProperty('occurred_at');
  });

  describe('client-side dedup', () => {
    test('trackListingImpression dedups by listingId+placement within a session', () => {
      trackListingImpression({ listingId: 5, placement: 'search_results' });
      trackListingImpression({ listingId: 5, placement: 'search_results' });
      expect(getQueueLengthForTests()).toBe(1);
    });

    test('a different placement is a distinct event', () => {
      trackListingImpression({ listingId: 5, placement: 'search_results' });
      trackListingImpression({ listingId: 5, placement: 'category_top' });
      expect(getQueueLengthForTests()).toBe(2);
    });

    test('trackListingViewed dedups by listingId within a session', () => {
      trackListingViewed({ listingId: 5 });
      trackListingViewed({ listingId: 5 });
      expect(getQueueLengthForTests()).toBe(1);
    });

    test('a different listingId is a distinct listing_viewed event', () => {
      trackListingViewed({ listingId: 5 });
      trackListingViewed({ listingId: 6 });
      expect(getQueueLengthForTests()).toBe(2);
    });

    test('trackCompanyProfileView dedups by companySlug within a session', () => {
      trackCompanyProfileView({ companySlug: 'acme' });
      trackCompanyProfileView({ companySlug: 'acme' });
      expect(getQueueLengthForTests()).toBe(1);
    });

    test('trackPromotionImpression dedups by promotionId+placement within a session', () => {
      trackPromotionImpression({
        promotionId: 3,
        listingId: 5,
        placement: 'home_featured',
      });
      trackPromotionImpression({
        promotionId: 3,
        listingId: 5,
        placement: 'home_featured',
      });
      expect(getQueueLengthForTests()).toBe(1);
    });

    test('click events (search_result_click) are never deduped — every real click is a distinct action', () => {
      trackSearchResultClick({ listingId: 5, position: 0 });
      trackSearchResultClick({ listingId: 5, position: 0 });
      expect(getQueueLengthForTests()).toBe(2);
    });
  });

  test('trackContactClick never carries the raw contact value, only the bounded method', () => {
    trackContactClick({ companySlug: 'acme', contactMethod: 'phone' });
    const [sentEvent] = peekQueueForTests();
    expect(sentEvent.contactMethod).toBe('phone');
    // Only these exact keys — no "value"/"phone"/"email"/"url" field
    // that could carry the raw contact value ever gets added.
    expect(Object.keys(sentEvent).sort()).toEqual(
      [
        'eventId',
        'eventName',
        'sessionId',
        'anonymousVisitorId',
        'companySlug',
        'contactMethod',
      ].sort(),
    );
  });
});

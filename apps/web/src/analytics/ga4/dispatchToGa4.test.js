import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dispatchToGa4,
  resetGa4DispatchDedupForTests,
} from './dispatchToGa4.js';
import {
  GA4_CONSENT_STATES,
  setGa4AnalyticsConsent,
  resetGa4ConsentForTests,
} from './ga4Consent.js';
import { resetGa4ClientForTests } from './ga4Client.js';
import {
  setGa4AuthBootstrapping,
  setGa4InternalTrafficSuppressed,
  resetGa4InternalTrafficForTests,
} from './ga4InternalTraffic.js';
import { CLIENT_EVENT_NAMES } from '../constants.js';

function stubConfigured() {
  vi.stubEnv('VITE_GA4_ENABLED', 'true');
  vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST1234');
}

beforeEach(() => {
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
  resetGa4InternalTrafficForTests();
  resetGa4DispatchDedupForTests();
  window.gtag = vi.fn();
  // Step A8.1: `resetGa4InternalTrafficForTests` now leaves auth in the
  // conservative "still bootstrapping" state by default (matching a real
  // page load) — every test below except the dedicated bootstrap-race
  // block is modeling an ordinary, already-resolved session, so it opts
  // into that explicitly rather than relying on an implicit default.
  setGa4AuthBootstrapping(false);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
  resetGa4InternalTrafficForTests();
  resetGa4DispatchDedupForTests();
});

describe('gating', () => {
  test('no-op when GA4 is not configured', () => {
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  test('no-op when configured but consent is not GRANTED', () => {
    stubConfigured();
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  test('no-op when internal traffic is suppressed, even with consent granted', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    setGa4InternalTrafficSuppressed(true);
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });
    expect(window.gtag).not.toHaveBeenCalled();
  });

  test('dispatches when configured + consent granted + not suppressed', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });
    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'listing_viewed',
      expect.objectContaining({ listing_id: 5 }),
    );
  });

  test('an unrecognized/server-authoritative event name never reaches gtag', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    dispatchToGa4('booking_confirmed', { bookingId: 9 });
    expect(window.gtag).not.toHaveBeenCalled();
  });
});

describe('dedup — independent from analyticsClient.js', () => {
  beforeEach(() => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
  });

  test('a repeated dedupKey is only sent once', () => {
    dispatchToGa4(
      CLIENT_EVENT_NAMES.LISTING_IMPRESSION,
      { listingId: 5, placement: 'search_results' },
      '5:search_results',
    );
    dispatchToGa4(
      CLIENT_EVENT_NAMES.LISTING_IMPRESSION,
      { listingId: 5, placement: 'search_results' },
      '5:search_results',
    );
    const pageViewLikeCalls = window.gtag.mock.calls.filter(
      ([, eventName]) => eventName === 'listing_impression',
    );
    expect(pageViewLikeCalls).toHaveLength(1);
  });

  test('a click event with no dedupKey is never deduped — every call dispatches', () => {
    dispatchToGa4(CLIENT_EVENT_NAMES.SEARCH_RESULT_CLICK, {
      listingId: 5,
      position: 0,
    });
    dispatchToGa4(CLIENT_EVENT_NAMES.SEARCH_RESULT_CLICK, {
      listingId: 5,
      position: 0,
    });
    const clickCalls = window.gtag.mock.calls.filter(
      ([, eventName]) => eventName === 'search_result_click',
    );
    expect(clickCalls).toHaveLength(2);
  });
});

describe('auth bootstrap race (Step A8.1, brief §17)', () => {
  test('never dispatches while auth bootstrap is unresolved, even with consent granted', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    setGa4AuthBootstrapping(true);

    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });

    expect(window.gtag).not.toHaveBeenCalled();
  });

  test('may dispatch once bootstrap resolves as an ordinary (non-internal) session', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    setGa4AuthBootstrapping(true);
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });
    expect(window.gtag).not.toHaveBeenCalled();

    setGa4AuthBootstrapping(false);
    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });

    expect(window.gtag).toHaveBeenCalledWith(
      'event',
      'listing_viewed',
      expect.objectContaining({ listing_id: 5 }),
    );
  });

  test('remains suppressed once bootstrap resolves as internal staff', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    setGa4AuthBootstrapping(true);
    setGa4AuthBootstrapping(false);
    setGa4InternalTrafficSuppressed(true); // Ga4RouteTracker's own resolved-role effect

    dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 });

    expect(window.gtag).not.toHaveBeenCalled();
  });
});

describe('never throws into the calling UI', () => {
  test('a gtag implementation that throws is swallowed', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    window.gtag = vi.fn(() => {
      throw new Error('simulated gtag failure');
    });
    expect(() =>
      dispatchToGa4(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId: 5 }),
    ).not.toThrow();
  });
});

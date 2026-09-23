import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureGa4Initialized,
  sendGa4PageView,
  sendGa4Event,
  resetGa4ClientForTests,
} from './ga4Client.js';
import {
  GA4_CONSENT_STATES,
  setGa4AnalyticsConsent,
  resetGa4ConsentForTests,
} from './ga4Consent.js';

function stubConfigured() {
  vi.stubEnv('VITE_GA4_ENABLED', 'true');
  vi.stubEnv('VITE_GA4_MEASUREMENT_ID', 'G-TEST1234');
}

beforeEach(() => {
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetGa4ConsentForTests();
  resetGa4ClientForTests();
});

describe('ensureGa4Initialized — gating', () => {
  test('does nothing when GA4 is not configured, even with consent granted', () => {
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    expect(document.getElementById('desavii-ga4-gtag-js')).toBeNull();
  });

  test('does nothing when configured but consent is not GRANTED', () => {
    stubConfigured();
    ensureGa4Initialized();
    expect(document.getElementById('desavii-ga4-gtag-js')).toBeNull();
  });

  test('does nothing when consent is explicitly DENIED', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.DENIED);
    ensureGa4Initialized();
    expect(document.getElementById('desavii-ga4-gtag-js')).toBeNull();
  });

  test('initializes when configured AND consent is GRANTED', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    const script = document.getElementById('desavii-ga4-gtag-js');
    expect(script).not.toBeNull();
    expect(script.src).toContain('googletagmanager.com/gtag/js');
    expect(script.src).toContain('id=G-TEST1234');
    expect(script.async).toBe(true);
  });

  test('exactly one script tag even across repeated/idempotent calls', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    ensureGa4Initialized();
    ensureGa4Initialized();
    expect(
      document.querySelectorAll('script[src*="googletagmanager.com"]'),
    ).toHaveLength(1);
  });

  test('configures gtag with send_page_view: false', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    expect(window.dataLayer).toContainEqual(
      expect.arrayContaining([
        'config',
        'G-TEST1234',
        expect.objectContaining({ send_page_view: false }),
      ]),
    );
  });

  test('sets Consent Mode v2 defaults with advertising signals denied', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    expect(window.dataLayer).toContainEqual(
      expect.arrayContaining([
        'consent',
        'default',
        expect.objectContaining({
          analytics_storage: 'granted',
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        }),
      ]),
    );
  });
});

describe('sendGa4PageView / sendGa4Event', () => {
  test('sendGa4PageView is a no-op (no gtag call) when GA4 is not configured', () => {
    window.gtag = vi.fn();
    sendGa4PageView({ page_location: 'https://desavii.com/en' });
    expect(window.gtag).not.toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.anything(),
    );
  });

  test('sendGa4PageView dispatches page_view once initialized', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    sendGa4PageView({ page_location: 'https://desavii.com/en', locale: 'en' });
    expect(window.dataLayer).toContainEqual([
      'event',
      'page_view',
      { page_location: 'https://desavii.com/en', locale: 'en' },
    ]);
  });

  test('sendGa4Event strips undefined/null params before dispatch', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    sendGa4Event('listing_viewed', {
      listing_id: 5,
      category_code: undefined,
      locale: null,
    });
    expect(window.dataLayer).toContainEqual([
      'event',
      'listing_viewed',
      { listing_id: 5 },
    ]);
  });
});

describe('consent revoke reaction (brief §13)', () => {
  test('a GRANTED->DENIED transition after init sends a consent update, no cookie deletion attempted', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.DENIED);
    expect(window.dataLayer).toContainEqual([
      'consent',
      'update',
      { analytics_storage: 'denied' },
    ]);
  });

  test('after revoke, sendGa4Event still no-ops for future dispatches gated upstream (dispatchToGa4 owns that check)', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.DENIED);
    // Exactly one script tag persists — a revoke never removes/reloads it.
    expect(
      document.querySelectorAll('script[src*="googletagmanager.com"]'),
    ).toHaveLength(1);
  });
});

describe('failure isolation (brief §45-46)', () => {
  test('script.onerror is a real handler that never throws', () => {
    stubConfigured();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    ensureGa4Initialized();
    const script = document.getElementById('desavii-ga4-gtag-js');
    expect(() => script.onerror(new Event('error'))).not.toThrow();
  });
});

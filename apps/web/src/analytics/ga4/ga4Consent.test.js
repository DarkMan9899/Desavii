import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  GA4_CONSENT_STATES,
  getGa4AnalyticsConsent,
  setGa4AnalyticsConsent,
  onGa4ConsentChange,
  resetGa4ConsentForTests,
} from './ga4Consent.js';

beforeEach(() => {
  resetGa4ConsentForTests();
});

describe('default state', () => {
  test('defaults to UNKNOWN', () => {
    expect(getGa4AnalyticsConsent()).toBe(GA4_CONSENT_STATES.UNKNOWN);
  });
});

describe('setGa4AnalyticsConsent', () => {
  test('transitions to GRANTED', () => {
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    expect(getGa4AnalyticsConsent()).toBe(GA4_CONSENT_STATES.GRANTED);
  });

  test('transitions to DENIED', () => {
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.DENIED);
    expect(getGa4AnalyticsConsent()).toBe(GA4_CONSENT_STATES.DENIED);
  });

  test('ignores an unrecognized value, leaving state unchanged', () => {
    setGa4AnalyticsConsent('yes-please');
    expect(getGa4AnalyticsConsent()).toBe(GA4_CONSENT_STATES.UNKNOWN);
  });

  test('a no-op transition to the same state does not notify listeners', () => {
    const listener = vi.fn();
    onGa4ConsentChange(listener);
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.UNKNOWN); // already the default
    expect(listener).not.toHaveBeenCalled();
  });

  test('notifies subscribed listeners on a real transition', () => {
    const listener = vi.fn();
    onGa4ConsentChange(listener);
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    expect(listener).toHaveBeenCalledWith(GA4_CONSENT_STATES.GRANTED);
  });

  test('a full revoke/re-grant cycle notifies each real transition', () => {
    const listener = vi.fn();
    onGa4ConsentChange(listener);
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.DENIED);
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    expect(listener).toHaveBeenNthCalledWith(1, GA4_CONSENT_STATES.GRANTED);
    expect(listener).toHaveBeenNthCalledWith(2, GA4_CONSENT_STATES.DENIED);
    expect(listener).toHaveBeenNthCalledWith(3, GA4_CONSENT_STATES.GRANTED);
  });
});

describe('onGa4ConsentChange unsubscribe', () => {
  test('the returned function stops further notifications', () => {
    const listener = vi.fn();
    const unsubscribe = onGa4ConsentChange(listener);
    unsubscribe();
    setGa4AnalyticsConsent(GA4_CONSENT_STATES.GRANTED);
    expect(listener).not.toHaveBeenCalled();
  });
});

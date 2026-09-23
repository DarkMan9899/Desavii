/**
 * Step A7 — GA4 consent adapter (brief §9-14). No real consent/CMP
 * infrastructure exists anywhere in this frontend as of A7 (audited: no
 * consent, CMP, cookie-preference, or cookie-banner code found repo-wide)
 * — this is the small, deliberately basic contract a future approved
 * consent solution (A0.1's still-unresolved legal/privacy decision) can
 * call into, WITHOUT this step inventing any legal copy or banner UI.
 *
 * Defaults to UNKNOWN, which keeps GA4 fully blocked identically to
 * DENIED (`ga4Client.js` only ever initializes on GRANTED) — the
 * distinction exists only so a caller/consumer can tell "never asked"
 * apart from "asked and declined" if that's ever useful, not because the
 * two states behave differently here.
 */

import { useSyncExternalStore } from 'react';

export const GA4_CONSENT_STATES = Object.freeze({
  UNKNOWN: 'unknown',
  DENIED: 'denied',
  GRANTED: 'granted',
});

let consentState = GA4_CONSENT_STATES.UNKNOWN;
const listeners = new Set();

export function getGa4AnalyticsConsent() {
  return consentState;
}

/**
 * The one write path into GA4 consent state (brief §9's "small GA4
 * consent adapter contract"). A future approved consent UI/CMP calls
 * this with 'granted' or 'denied' — nothing else in this codebase should
 * ever write `consentState` directly.
 */
export function setGa4AnalyticsConsent(nextState) {
  if (!Object.values(GA4_CONSENT_STATES).includes(nextState)) return;
  if (nextState === consentState) return;
  consentState = nextState;
  listeners.forEach((listener) => listener(consentState));
}

/**
 * Notifies `listener` on every future consent transition. Used both by
 * `useGa4AnalyticsConsent` below and by `ga4Client.js`'s own one-time
 * subscription (so a GRANTED->DENIED revoke can suppress future
 * collection even without a mounted React consumer in the tree).
 * @returns {() => void} unsubscribe function.
 */
export function onGa4ConsentChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reactive read for components (e.g. `Ga4RouteTracker`) that must
 * re-evaluate eligibility the moment consent changes, not just on the
 * next route change. */
export function useGa4AnalyticsConsent() {
  return useSyncExternalStore(
    onGa4ConsentChange,
    getGa4AnalyticsConsent,
    getGa4AnalyticsConsent,
  );
}

/**
 * Test-only: resets consent state between tests. Deliberately does NOT
 * clear `listeners` — `ga4Client.js` registers a real, production
 * subscription once at module-eval time (its own revoke reaction), and
 * clearing the whole Set here would silently unsubscribe it for the rest
 * of the test file. Individual tests that assert on their own listener
 * still work fine, since each uses its own fresh `vi.fn()`.
 */
export function resetGa4ConsentForTests() {
  consentState = GA4_CONSENT_STATES.UNKNOWN;
}

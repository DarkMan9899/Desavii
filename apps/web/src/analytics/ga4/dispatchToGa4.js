/**
 * Step A7 — the event bridge `analyticsClient.js#trackEvent` calls
 * BEFORE its own `isAnalyticsCollectionEnabled()` early return (brief
 * §8/§34's independence requirement: FP off + GA4 on must still dispatch
 * to GA4, and must never create a DESAVII visitor/session identifier to
 * do so). Gated entirely on GA4's own config/consent/internal-traffic
 * state — never on the first-party flag, never touching
 * `analyticsIdentity.js`.
 *
 * Owns its own dedup `Set`, deliberately separate from
 * `analyticsClient.js`'s `seenDedupKeys` — the two must never share or
 * influence each other's state.
 */

import { GA4_CONSENT_STATES, getGa4AnalyticsConsent } from './ga4Consent.js';
import { isGa4InternalTrafficSuppressed } from './ga4InternalTraffic.js';
import { isGa4Configured } from './ga4Config.js';
import { buildGa4EventParams } from './ga4Events.js';
import { sendGa4Event } from './ga4Client.js';

const ga4SeenDedupKeys = new Set();

/**
 * @param {string} eventName - one of `CLIENT_EVENT_NAMES`'s values.
 * @param {object} payload - the SAME raw payload `trackEvent` received,
 *   before any first-party `eventId`/`sessionId`/`anonymousVisitorId`
 *   enrichment — GA4 must never see those fields.
 * @param {string} [dedupKey]
 */
export function dispatchToGa4(eventName, payload = {}, dedupKey = undefined) {
  if (!isGa4Configured()) return;
  if (getGa4AnalyticsConsent() !== GA4_CONSENT_STATES.GRANTED) return;
  if (isGa4InternalTrafficSuppressed()) return;

  const params = buildGa4EventParams(eventName, payload);
  if (!params) return; // not one of the 9 GA4-eligible client events

  if (dedupKey) {
    const fullKey = `${eventName}:${dedupKey}`;
    if (ga4SeenDedupKeys.has(fullKey)) return;
    ga4SeenDedupKeys.add(fullKey);
  }

  try {
    sendGa4Event(eventName, params);
  } catch {
    // GA4 must never break the calling UI (brief §46).
  }
}

/** Test-only: clears GA4's own dedup set between tests. */
export function resetGa4DispatchDedupForTests() {
  ga4SeenDedupKeys.clear();
}

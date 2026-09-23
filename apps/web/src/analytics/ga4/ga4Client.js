/**
 * Step A7 — GA4 transport layer: `window.dataLayer`/`gtag` setup, the
 * single script injection, and the two outbound calls (`page_view`,
 * named event) everything else in `ga4/` funnels through. No other file
 * in this codebase should touch `window.gtag`/`window.dataLayer`
 * directly (brief §18's "product components must not directly call
 * `window.gtag(...)`" extended to every internal caller too — this file
 * is the one exception).
 *
 * Initialization only ever happens once feature+ID are valid AND consent
 * is GRANTED (`ensureGa4Initialized`, called by both dispatch functions
 * below, is idempotent and safe to call unconditionally on every
 * attempt). Script injection is guarded by a DOM id check, not just the
 * in-memory `initialized` flag, so a hot-reload/remount in dev can never
 * append a second `<script>` tag.
 */

import { getGa4MeasurementId, isGa4Configured } from './ga4Config.js';
import {
  GA4_CONSENT_STATES,
  getGa4AnalyticsConsent,
  onGa4ConsentChange,
} from './ga4Consent.js';

const SCRIPT_ELEMENT_ID = 'desavii-ga4-gtag-js';

let initialized = false;

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
}

// Only defined if nothing else already defined a real `gtag` — brief §17's
// "avoid conflicting globals if another tag unexpectedly exists" (the
// repo-wide audit found none, but this stays defensive rather than
// clobbering an unknown existing implementation).
function ensureGtagFunction() {
  if (typeof window.gtag === 'function') return;
  window.gtag = function gtag(...args) {
    window.dataLayer.push(args);
  };
}

function injectScriptOnce(measurementId) {
  if (document.getElementById(SCRIPT_ELEMENT_ID)) return;
  const script = document.createElement('script');
  script.id = SCRIPT_ELEMENT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  // Failure isolation (brief §45-46): a blocked/failed load (ad blocker,
  // offline, Google outage) must never surface as an error — every
  // dispatch call already treats GA4 as best-effort regardless of
  // whether the remote script ever actually loads.
  script.onerror = () => {};
  document.head.appendChild(script);
}

/**
 * Idempotent — safe to call before every dispatch attempt. No-ops unless
 * GA4 is configured AND consent is currently GRANTED (brief §7: "No
 * Google tag script is loaded before explicit analytics consent is
 * GRANTED").
 */
export function ensureGa4Initialized() {
  if (initialized) return;
  if (!isGa4Configured()) return;
  if (getGa4AnalyticsConsent() !== GA4_CONSENT_STATES.GRANTED) return;

  const measurementId = getGa4MeasurementId();

  ensureDataLayer();
  ensureGtagFunction();

  // Consent Mode v2 (brief §11): analytics_storage reflects the GRANTED
  // state we already gated on above; every advertising-related signal
  // stays denied — A7 is analytics-only, never Ads/Signals/remarketing.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  // send_page_view: false (brief §17) — DESAVII dispatches every
  // page_view explicitly via `sendGa4PageView`, never GA4's own
  // automatic pageview.
  window.gtag('config', measurementId, { send_page_view: false });

  injectScriptOnce(measurementId);
  initialized = true;
}

/**
 * Called whenever consent transitions to DENIED after GA4 was already
 * initialized (brief §13) — suppresses future collection without
 * attempting any homegrown Google-cookie deletion. A no-op before
 * `ensureGa4Initialized` has ever run (nothing to update yet).
 */
export function notifyGa4ConsentRevoked() {
  if (!initialized) return;
  window.gtag('consent', 'update', { analytics_storage: 'denied' });
}

// Module-level, one-time subscription (brief §13): a GRANTED->DENIED
// revoke must suppress future collection even with no `Ga4RouteTracker`
// re-render in between — this reacts independently of React's lifecycle.
onGa4ConsentChange((nextState) => {
  if (nextState !== GA4_CONSENT_STATES.DENIED) return;
  notifyGa4ConsentRevoked();
});

function sanitizedParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

/** @param {object} params - already-sanitized GA4 `page_view` params. */
export function sendGa4PageView(params) {
  ensureGa4Initialized();
  if (!initialized) return;
  window.gtag('event', 'page_view', sanitizedParams(params));
}

/** @param {object} params - already-sanitized, per-event allowlisted params. */
export function sendGa4Event(eventName, params) {
  ensureGa4Initialized();
  if (!initialized) return;
  window.gtag('event', eventName, sanitizedParams(params));
}

/** Test-only: resets in-memory init state and removes the injected script. */
export function resetGa4ClientForTests() {
  initialized = false;
  document.getElementById(SCRIPT_ELEMENT_ID)?.remove();
  delete window.gtag;
  delete window.dataLayer;
}

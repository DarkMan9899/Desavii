/**
 * Step A3 — `trackEvent` + the 9 client-observation specialized helpers
 * (brief §5/§6). The ONLY place a product component should reach for is
 * one of the named `track*` helpers below — never a raw `trackEvent`
 * call with a hand-typed event name/field set, so a typo can never
 * silently produce a wrong/rejected analytics row.
 *
 * Gated by `VITE_ANALYTICS_COLLECTION_ENABLED` (brief §3/§13): when
 * disabled (the default in every environment), every helper is a true
 * no-op — no visitor/session id is created, nothing is enqueued, no
 * network call is ever attempted. This is checked FIRST, before any
 * identity resolution, specifically so collection-disabled browsing
 * never creates a `localStorage`/`sessionStorage` entry at all.
 */

import {
  getOrCreateVisitorId,
  getOrCreateSessionId,
} from './analyticsIdentity.js';
import { enqueueEvent } from './analyticsQueue.js';
import { CLIENT_EVENT_NAMES } from './constants.js';

export function isAnalyticsCollectionEnabled() {
  return import.meta.env.VITE_ANALYTICS_COLLECTION_ENABLED === 'true';
}

// Client-side dedup only (brief §15) — reduces noise; the server's own
// semantic dedup (A2) remains the actual correctness/security boundary.
// Never persisted, so a full page reload naturally starts a fresh set —
// acceptable, since the server-side dedup key is unaffected either way.
const seenDedupKeys = new Set();

/**
 * @param {string} eventName - one of `CLIENT_EVENT_NAMES`'s values.
 * @param {object} payload - already camelCase, A2-schema-shaped fields.
 * @param {string} [dedupKey] - when given, a second call with the same
 *   (eventName, sessionId, dedupKey) tuple is silently skipped.
 */
export function trackEvent(eventName, payload = {}, dedupKey = undefined) {
  if (!isAnalyticsCollectionEnabled()) return;
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.randomUUID !== 'function'
  ) {
    return;
  }

  let sessionId;
  let anonymousVisitorId;
  try {
    sessionId = getOrCreateSessionId();
    anonymousVisitorId = getOrCreateVisitorId();
  } catch {
    // Identity resolution must never throw into a caller mid-render/
    // mid-click (brief §8's UI-safety guarantee extended to the whole
    // tracking call, not just storage access).
    return;
  }

  if (dedupKey) {
    const fullKey = `${eventName}:${sessionId}:${dedupKey}`;
    if (seenDedupKeys.has(fullKey)) return;
    seenDedupKeys.add(fullKey);
  }

  try {
    enqueueEvent({
      eventId: crypto.randomUUID(),
      eventName,
      sessionId,
      anonymousVisitorId,
      ...payload,
    });
  } catch {
    // Never let a transport-layer bug break the calling UI (brief §12).
  }
}

/** Test-only: clears the client-side dedup set between tests. */
export function resetDedupForTests() {
  seenDedupKeys.clear();
}

// --- The 9 client-ingestible events, one named helper each ---------

export function trackListingImpression({
  listingId,
  placement,
  position,
  categoryCode,
  locale,
}) {
  trackEvent(
    CLIENT_EVENT_NAMES.LISTING_IMPRESSION,
    { listingId, placement, position, categoryCode, locale },
    `${listingId}:${placement}`,
  );
}

export function trackListingViewed({ listingId }) {
  trackEvent(CLIENT_EVENT_NAMES.LISTING_VIEWED, { listingId }, `${listingId}`);
}

export function trackPromotionImpression({
  promotionId,
  listingId,
  placement,
}) {
  trackEvent(
    CLIENT_EVENT_NAMES.PROMOTION_IMPRESSION,
    { promotionId, listingId, placement },
    `${promotionId}:${placement}`,
  );
}

/** A genuine click/navigation from a promoted card — never dedup'd, one real action per call. */
export function trackPromotionClicked({ promotionId, listingId, placement }) {
  trackEvent(CLIENT_EVENT_NAMES.PROMOTION_CLICKED, {
    promotionId,
    listingId,
    placement,
  });
}

/** Never the raw phone/email/URL/handle value — `contactMethod` is only ever the bounded A1 category. */
export function trackContactClick({ companySlug, contactMethod }) {
  trackEvent(CLIENT_EVENT_NAMES.CONTACT_CLICK, {
    companySlug,
    contactMethod,
  });
}

export function trackCompanyProfileView({ companySlug }) {
  trackEvent(
    CLIENT_EVENT_NAMES.COMPANY_PROFILE_VIEW,
    { companySlug },
    `${companySlug}`,
  );
}

export function trackCompanyListingClick({ companySlug, listingId }) {
  trackEvent(CLIENT_EVENT_NAMES.COMPANY_LISTING_CLICK, {
    companySlug,
    listingId,
  });
}

/**
 * @param {string} [dedupKey] - a stable key for the CURRENT resolved
 *   search/result state (brief §24) — the caller owns building this,
 *   since "what counts as the same state" is page-specific (e.g. the
 *   serialized filter set), not a fixed field combination like the
 *   other events above.
 */
export function trackSearchImpression(
  { queryText, categoryCode, resultCount, locale },
  dedupKey,
) {
  trackEvent(
    CLIENT_EVENT_NAMES.SEARCH_IMPRESSION,
    { queryText, categoryCode, resultCount, locale },
    dedupKey,
  );
}

export function trackSearchResultClick({
  listingId,
  position,
  queryText,
  categoryCode,
  locale,
}) {
  trackEvent(CLIENT_EVENT_NAMES.SEARCH_RESULT_CLICK, {
    listingId,
    position,
    queryText,
    categoryCode,
    locale,
  });
}

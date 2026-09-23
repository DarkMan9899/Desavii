/**
 * Step A7 (brief §21-28) — the exact, hand-picked GA4 param allowlist per
 * event, plus `page_view`'s own. Every field NOT listed in a builder
 * below is a deliberate omission — `queryText`/`companySlug`'s raw value
 * is judged "safe" (a public slug, not a secret), but `partnerId`, price,
 * billing/status fields, raw search text, and any DESAVII visitor/session
 * identifier are never forwarded here even if the first-party payload
 * carries them (e.g. `trackSearchImpression`'s `queryText`).
 *
 * `buildGa4EventParams` returns `null` for any event name outside the 9
 * client-observable events — GA4 must never receive a server-authoritative
 * event (`favorite_added`, `booking_*`, etc.) even by accident.
 */

import { CLIENT_EVENT_NAMES } from '../constants.js';

function pruneEmpty(params) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

const EVENT_PARAM_BUILDERS = {
  [CLIENT_EVENT_NAMES.LISTING_IMPRESSION]: ({
    listingId,
    placement,
    position,
    categoryCode,
    locale,
  }) => ({
    listing_id: listingId,
    placement,
    position,
    category_code: categoryCode,
    locale,
  }),

  [CLIENT_EVENT_NAMES.LISTING_VIEWED]: ({
    listingId,
    categoryCode,
    locale,
  }) => ({
    listing_id: listingId,
    category_code: categoryCode,
    locale,
  }),

  [CLIENT_EVENT_NAMES.PROMOTION_IMPRESSION]: ({
    promotionId,
    listingId,
    placement,
    locale,
  }) => ({
    promotion_id: promotionId,
    listing_id: listingId,
    placement,
    locale,
  }),

  [CLIENT_EVENT_NAMES.PROMOTION_CLICKED]: ({
    promotionId,
    listingId,
    placement,
    locale,
  }) => ({
    promotion_id: promotionId,
    listing_id: listingId,
    placement,
    locale,
  }),

  // Never the raw phone/email/URL/handle value — `contactMethod` is only
  // ever the bounded A1 category (same guarantee `trackContactClick`'s
  // own first-party contract already makes).
  [CLIENT_EVENT_NAMES.CONTACT_CLICK]: ({ companySlug, contactMethod }) => ({
    company_slug: companySlug,
    contact_method: contactMethod,
  }),

  [CLIENT_EVENT_NAMES.COMPANY_PROFILE_VIEW]: ({ companySlug }) => ({
    company_slug: companySlug,
  }),

  [CLIENT_EVENT_NAMES.COMPANY_LISTING_CLICK]: ({
    companySlug,
    listingId,
    locale,
  }) => ({
    company_slug: companySlug,
    listing_id: listingId,
    locale,
  }),

  // Deliberately drops `queryText` — brief §28: no raw search text ever
  // reaches Google in A7 v1.
  [CLIENT_EVENT_NAMES.SEARCH_IMPRESSION]: ({
    categoryCode,
    resultCount,
    locale,
  }) => ({
    category_code: categoryCode,
    result_count: resultCount,
    locale,
  }),

  // Same `queryText` omission as SEARCH_IMPRESSION above.
  [CLIENT_EVENT_NAMES.SEARCH_RESULT_CLICK]: ({
    listingId,
    position,
    categoryCode,
    locale,
  }) => ({
    listing_id: listingId,
    position,
    category_code: categoryCode,
    locale,
  }),
};

/**
 * @returns {object|null} sanitized, low-cardinality GA4 params, or `null`
 *   if `eventName` isn't one of the 9 GA4-eligible client events.
 */
export function buildGa4EventParams(eventName, payload = {}) {
  const builder = EVENT_PARAM_BUILDERS[eventName];
  if (!builder) return null;
  return pruneEmpty(builder(payload));
}

/**
 * page_location deliberately excludes query string and hash (brief §17):
 * DESAVII query params may carry search terms/filters/partnerId/other
 * contextual values that must never reach Google. `pathname` here is the
 * router's own `location.pathname`, which already never includes
 * search/hash by definition.
 */
export function buildGa4PageViewParams({ origin, pathname, title, locale }) {
  return pruneEmpty({
    page_location: `${origin}${pathname}`,
    page_title: title,
    locale,
  });
}

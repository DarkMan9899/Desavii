/**
 * `analytics/` public export surface (FRONTEND_ARCHITECTURE.md §6.2) —
 * the ONLY entry point other modules/pages may import from. Product
 * components must never call `fetch('/analytics/events')` directly, and
 * never import `analyticsQueue.js`/`analyticsIdentity.js` directly
 * either — only the named helpers and the impression hook below.
 *
 * Step A7: `Ga4RouteTracker` (mounted once in `routes/index.jsx`, next to
 * `ScrollRestoration`) and `setGa4AnalyticsConsent` (the consent adapter
 * a future approved consent UI/CMP calls into) are the only two GA4
 * surfaces exposed here — no product component ever imports from `ga4/`
 * directly, and none should ever call `window.gtag(...)` itself.
 */

export { useListingImpression } from './useListingImpression.js';
export { PLACEMENTS, CONTACT_METHODS } from './constants.js';
export {
  trackListingImpression,
  trackListingViewed,
  trackPromotionImpression,
  trackPromotionClicked,
  trackContactClick,
  trackCompanyProfileView,
  trackCompanyListingClick,
  trackSearchImpression,
  trackSearchResultClick,
  isAnalyticsCollectionEnabled,
} from './analyticsClient.js';
export { default as Ga4RouteTracker } from './ga4/Ga4RouteTracker.jsx';
export { setGa4AnalyticsConsent } from './ga4/ga4Consent.js';

/**
 * `analytics/` public export surface (FRONTEND_ARCHITECTURE.md §6.2) —
 * the ONLY entry point other modules/pages may import from. Product
 * components must never call `fetch('/analytics/events')` directly, and
 * never import `analyticsQueue.js`/`analyticsIdentity.js` directly
 * either — only the named helpers and the impression hook below.
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

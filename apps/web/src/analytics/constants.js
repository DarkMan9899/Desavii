/**
 * Step A3 — the frontend's own copy of the small, fixed A1/A2 value
 * sets it needs. Deliberately NOT imported from `@desavii/types`/the
 * backend: apps/web has no dependency on the API workspace's packages,
 * and these are exactly the same tiny, rarely-changing constant sets
 * `apps/api/src/modules/engagementAnalytics/constants/
 * engagementAnalyticsConstants.js` already locks — kept in sync by
 * being equally small and equally deliberate about never expanding
 * speculatively (A0.1's own rule).
 *
 * Only the 9 client-observation event names are listed here — the
 * other 11 names in the canonical 20-event contract (favorite_*,
 * booking_*, vendor_registered, listing_created, search_performed,
 * filter_applied) are server-authoritative or unwired; this frontend
 * tracker must never be able to construct one of them at all (brief §6).
 */

export const CLIENT_EVENT_NAMES = Object.freeze({
  LISTING_IMPRESSION: 'listing_impression',
  LISTING_VIEWED: 'listing_viewed',
  PROMOTION_IMPRESSION: 'promotion_impression',
  PROMOTION_CLICKED: 'promotion_clicked',
  CONTACT_CLICK: 'contact_click',
  COMPANY_PROFILE_VIEW: 'company_profile_view',
  COMPANY_LISTING_CLICK: 'company_listing_click',
  SEARCH_IMPRESSION: 'search_impression',
  SEARCH_RESULT_CLICK: 'search_result_click',
});

/**
 * The 4 A0.1-locked placement values. `SEARCH_RESULTS` also covers
 * Category/Destination/Home-organic listing grids — every surface that
 * renders through `useSearchListingsQuery`/`SearchResultCard`, exactly
 * the rule `engagementAnalyticsConstants.js`'s own `ENGAGEMENT_PLACEMENTS`
 * comment documents ("Search results and Category page organic results
 * both render through the same mechanism, so both fall under
 * SEARCH_RESULTS").
 */
export const PLACEMENTS = Object.freeze({
  SEARCH_RESULTS: 'search_results',
  HOME_FEATURED: 'home_featured',
  CATEGORY_TOP: 'category_top',
  COMPANY_PROFILE: 'company_profile',
});

/** The exact contact channels `CompanyProfilePageContent` renders. */
export const CONTACT_METHODS = Object.freeze({
  PHONE: 'phone',
  EMAIL: 'email',
  WEBSITE: 'website',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  X: 'x',
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  LINKEDIN: 'linkedin',
});

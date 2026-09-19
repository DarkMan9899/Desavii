/**
 * `partnerAnalytics` module public export surface
 * (FRONTEND_ARCHITECTURE.md §6.2) — the ONLY entry point other
 * modules/pages may import from (§6.3).
 */

export { default as usePartnerAnalyticsOverviewQuery } from './queries/usePartnerAnalyticsOverviewQuery.js';
export {
  default as usePartnerAnalyticsListingsQuery,
  LISTINGS_PAGE_LIMIT,
} from './queries/usePartnerAnalyticsListingsQuery.js';
export { default as usePartnerAnalyticsListingDetailQuery } from './queries/usePartnerAnalyticsListingDetailQuery.js';
export { default as usePartnerAnalyticsPromotionDetailQuery } from './queries/usePartnerAnalyticsPromotionDetailQuery.js';
export { default as useAnalyticsRangeParam } from './hooks/useAnalyticsRangeParam.js';
export {
  ALLOWED_RANGE_DAYS,
  DEFAULT_RANGE_DAYS,
  LISTINGS_SORT_VALUES,
  DEFAULT_LISTINGS_SORT,
  parseListingsSort,
} from './constants/ranges.js';
export { formatCount, formatPercent, formatDay } from './utils/formatters.js';

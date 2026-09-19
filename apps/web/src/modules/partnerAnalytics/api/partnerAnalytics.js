/**
 * Partner Analytics module — raw endpoint calls (FRONTEND_ARCHITECTURE.md
 * §3.1's `api/` contract). Mirrors
 * `apps/api/src/modules/engagementAnalytics/module.routes.js` exactly —
 * all four routes are mounted under this module's `/analytics` prefix,
 * under a `/partner` sub-path (Step A5's own routing note: this codebase
 * has no separate top-level `/partner/*` namespace).
 */

import apiClient from '../../../api/client.js';

/** `GET /analytics/partner/overview` */
export function getPartnerAnalyticsOverview({ partnerId, range }) {
  return apiClient
    .get('/analytics/partner/overview', { params: { partnerId, range } })
    .then((response) => response.data);
}

/** `GET /analytics/partner/listings` */
export function listPartnerAnalyticsListings({
  partnerId,
  range,
  sort,
  cursor,
  limit,
}) {
  return apiClient
    .get('/analytics/partner/listings', {
      params: { partnerId, range, sort, cursor, limit },
    })
    .then((response) => response.data);
}

/** `GET /analytics/partner/promotions` (Step A6.1) */
export function listPartnerAnalyticsPromotions({
  partnerId,
  range,
  cursor,
  limit,
}) {
  return apiClient
    .get('/analytics/partner/promotions', {
      params: { partnerId, range, cursor, limit },
    })
    .then((response) => response.data);
}

/** `GET /analytics/partner/listings/:listingId` */
export function getPartnerAnalyticsListingDetail({
  partnerId,
  listingId,
  range,
}) {
  return apiClient
    .get(`/analytics/partner/listings/${listingId}`, {
      params: { partnerId, range },
    })
    .then((response) => response.data);
}

/** `GET /analytics/partner/promotions/:promotionId` */
export function getPartnerAnalyticsPromotionDetail({
  partnerId,
  promotionId,
  range,
}) {
  return apiClient
    .get(`/analytics/partner/promotions/${promotionId}`, {
      params: { partnerId, range },
    })
    .then((response) => response.data);
}

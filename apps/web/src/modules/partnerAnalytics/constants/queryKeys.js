/**
 * Partner Analytics query-key factory (FRONTEND_ARCHITECTURE.md §14.1) —
 * every hook in this module builds its key through this, never an ad hoc
 * array. Every key is scoped by `partnerId` first — critical for A6's
 * multi-partner workspace-switch requirement (brief §38/§39): switching
 * the active partner must never resolve to another partner's cached
 * data, so `partnerId` is always the leading, non-optional segment.
 */

const partnerAnalyticsKeys = {
  all: ['partnerAnalytics'],
  overview: (partnerId, rangeDays) => [
    ...partnerAnalyticsKeys.all,
    'overview',
    partnerId,
    rangeDays,
  ],
  listings: (partnerId, rangeDays, sort) => [
    ...partnerAnalyticsKeys.all,
    'listings',
    partnerId,
    rangeDays,
    sort,
  ],
  listingDetail: (partnerId, listingId, rangeDays) => [
    ...partnerAnalyticsKeys.all,
    'listingDetail',
    partnerId,
    listingId,
    rangeDays,
  ],
  promotionDetail: (partnerId, promotionId, rangeDays) => [
    ...partnerAnalyticsKeys.all,
    'promotionDetail',
    partnerId,
    promotionId,
    rangeDays,
  ],
};

export default partnerAnalyticsKeys;

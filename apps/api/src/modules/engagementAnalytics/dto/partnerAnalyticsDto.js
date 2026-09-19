/**
 * Step A5 (Partner Analytics Read API) — response DTOs. snake_case output
 * keys, matching every other Partner-facing response in this codebase
 * (`listingDto.js`, `bookingDto.js`) — Service/domain objects stay
 * camelCase, only these functions translate at the HTTP boundary. Never
 * spreads a raw DB row; every field here is an explicit, named,
 * privacy-reviewed pick (brief §29: no `anonymous_visitor_id`,
 * `session_id`, `user_id`, `event_id`, `dedup_key`, raw event rows,
 * `query_text`, IP, User-Agent, Referer, or customer identity ever
 * appears in any of these shapes).
 */

const RANGE_TIMEZONE = 'Asia/Yerevan';

function toRangeMeta({ rangeDays, fromDay, toDay }) {
  return {
    range_days: rangeDays,
    from_day: fromDay,
    to_day: toDay,
    timezone: RANGE_TIMEZONE,
  };
}

function toDailyPointResponse(point) {
  return {
    day: point.day,
    impressions: point.impressionsCount,
    views: point.viewsCount,
    daily_unique_visitors: point.dailyUniqueVisitors,
    favorite_adds: point.favoriteAddsCount,
    favorite_removes: point.favoriteRemovesCount,
    contact_clicks: point.contactClicksCount,
    booking_starts: point.bookingStartsCount,
    booking_requests: point.bookingRequestsCount,
    confirmed_bookings: point.bookingConfirmationsCount,
    search_impressions: point.searchImpressionsCount,
    search_clicks: point.searchClicksCount,
    promotion_impressions: point.promotionImpressionsCount,
    promotion_clicks: point.promotionClicksCount,
    company_profile_views: point.companyProfileViews,
    company_listing_clicks: point.companyListingClicks,
  };
}

export function toPartnerOverviewResponse({
  partnerId,
  rangeDays,
  fromDay,
  toDay,
  totals,
  exactUniqueVisitors,
  netSaves,
  ratios,
  daily,
}) {
  return {
    partner_id: partnerId,
    ...toRangeMeta({ rangeDays, fromDay, toDay }),
    listing_impressions: totals.impressionsCount,
    listing_views: totals.viewsCount,
    exact_unique_visitors: exactUniqueVisitors,
    net_saves: netSaves,
    favorite_adds: totals.favoriteAddsCount,
    favorite_removes: totals.favoriteRemovesCount,
    contact_clicks: totals.contactClicksCount,
    booking_starts: totals.bookingStartsCount,
    booking_requests: totals.bookingRequestsCount,
    confirmed_bookings: totals.bookingConfirmationsCount,
    view_to_request_conversion: ratios.viewToRequestConversion,
    search_impressions: totals.searchImpressionsCount,
    search_clicks: totals.searchClicksCount,
    search_ctr: ratios.searchCtr,
    promotion_impressions: totals.promotionImpressionsCount,
    promotion_clicks: totals.promotionClicksCount,
    promotion_ctr: ratios.promotionCtr,
    company_profile_views: totals.profileViewsCount,
    company_listing_clicks: totals.listingClicksCount,
    daily: daily.map(toDailyPointResponse),
  };
}

export function toPartnerListingRowResponse(row) {
  return {
    listing_id: row.listingId,
    title: row.title,
    listing_type: row.listingTypeCode,
    impressions: row.impressionsCount,
    views: row.viewsCount,
    exact_unique_visitors: row.exactUniqueVisitors,
    net_saves: row.netSaves,
    favorite_adds: row.favoriteAddsCount,
    favorite_removes: row.favoriteRemovesCount,
    booking_starts: row.bookingStartsCount,
    booking_requests: row.bookingRequestsCount,
    confirmed_bookings: row.bookingConfirmationsCount,
    search_impressions: row.searchImpressionsCount,
    search_clicks: row.searchClicksCount,
    search_ctr: row.searchCtr,
    promotion_impressions: row.promotionImpressionsCount,
    promotion_clicks: row.promotionClicksCount,
  };
}

export function toPartnerListingDetailResponse({
  rangeDays,
  fromDay,
  toDay,
  listing,
  exactUniqueVisitors,
  netSaves,
  ratios,
  daily,
}) {
  return {
    listing_id: listing.listingId,
    title: listing.title,
    listing_type: listing.listingTypeCode,
    slug: listing.slug,
    ...toRangeMeta({ rangeDays, fromDay, toDay }),
    impressions: listing.impressionsCount,
    views: listing.viewsCount,
    exact_unique_visitors: exactUniqueVisitors,
    net_saves: netSaves,
    favorite_adds: listing.favoriteAddsCount,
    favorite_removes: listing.favoriteRemovesCount,
    booking_starts: listing.bookingStartsCount,
    booking_requests: listing.bookingRequestsCount,
    confirmed_bookings: listing.bookingConfirmationsCount,
    view_to_request_conversion: ratios.viewToRequestConversion,
    search_impressions: listing.searchImpressionsCount,
    search_clicks: listing.searchClicksCount,
    search_ctr: ratios.searchCtr,
    promotion_impressions: listing.promotionImpressionsCount,
    promotion_clicks: listing.promotionClicksCount,
    promotion_ctr: ratios.promotionCtr,
    daily: daily.map((point) => ({
      day: point.day,
      impressions: point.impressionsCount,
      views: point.viewsCount,
      daily_unique_visitors: point.dailyUniqueVisitors,
      favorite_adds: point.favoriteAddsCount,
      favorite_removes: point.favoriteRemovesCount,
      booking_starts: point.bookingStartsCount,
      booking_requests: point.bookingRequestsCount,
      confirmed_bookings: point.bookingConfirmationsCount,
      search_impressions: point.searchImpressionsCount,
      search_clicks: point.searchClicksCount,
      promotion_impressions: point.promotionImpressionsCount,
      promotion_clicks: point.promotionClicksCount,
    })),
  };
}

export function toPartnerPromotionDetailResponse({
  rangeDays,
  fromDay,
  toDay,
  promotionId,
  listingId,
  totals,
  ctr,
  daily,
}) {
  return {
    promotion_id: promotionId,
    listing_id: listingId,
    ...toRangeMeta({ rangeDays, fromDay, toDay }),
    impressions: totals.impressionsCount,
    clicks: totals.clicksCount,
    ctr,
    daily: daily.map((point) => ({
      day: point.day,
      impressions: point.impressionsCount,
      clicks: point.clicksCount,
    })),
  };
}

export default {
  toPartnerOverviewResponse,
  toPartnerListingRowResponse,
  toPartnerListingDetailResponse,
  toPartnerPromotionDetailResponse,
};

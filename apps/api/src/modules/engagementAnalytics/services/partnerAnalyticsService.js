/**
 * PartnerAnalyticsService — Step A5 (Partner Analytics Read API).
 * Authorization, target-workspace resolution, date-range resolution,
 * zero-filling, ratio calculation, and DTO composition all live here —
 * the repository only runs SQL, the controller only translates HTTP
 * (brief §34).
 *
 * READ-ONLY: never writes `analytics_events` or any daily rollup table,
 * never triggers aggregation as a side effect of a request (brief §41).
 *
 * Workspace/capability check is a small LOCAL duplicate of
 * `partners/authorization/partnerAuthorization.js#assertPartnerCapability`
 * (identical shape: owner bypass, then `roleHasCapability`), built from
 * the same shared low-level primitives
 * (`infrastructure/database/repositories/partnerEmployeeRepository.js`,
 * `core/domain/partnerCapabilities.js`) — matching this codebase's own
 * established cross-module precedent
 * (`availabilityService.js#assertPartnerCapability` does the same thing
 * rather than importing the Partners module's own authorization helper
 * directly). A2.1's own lesson applies here too: `principal.partnerId`
 * is never read anywhere in this file — `partnerId` is always the
 * caller-supplied, freshly-reverified request parameter.
 */

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import {
  isPartnerOwner,
  getPartnerEmployeeRoleCode,
} from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import {
  PARTNER_CAPABILITIES,
  roleHasCapability,
} from '../../../core/domain/partnerCapabilities.js';
import {
  toPartnerOverviewResponse,
  toPartnerListingRowResponse,
  toPartnerListingDetailResponse,
  toPartnerPromotionDetailResponse,
} from '../dto/partnerAnalyticsDto.js';

const DEFAULT_LISTINGS_LIMIT = 20;

function computeRatio(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

/** Enumerates the `YYYY-MM-DD` calendar-date strings from `fromDay` to `toDay` inclusive — pure string/UTC-Date-object calendar math (never a timezone-authoritative computation; the business-day boundaries themselves were already resolved DB-side before this ever runs). */
function enumerateDays(fromDay, toDay) {
  const [fy, fm, fd] = fromDay.split('-').map(Number);
  const [ty, tm, td] = toDay.split('-').map(Number);
  const cursor = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  const days = [];
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const ZERO_LISTING_DAY = Object.freeze({
  impressionsCount: 0,
  viewsCount: 0,
  dailyUniqueVisitors: 0,
  favoriteAddsCount: 0,
  favoriteRemovesCount: 0,
  bookingStartsCount: 0,
  bookingRequestsCount: 0,
  bookingConfirmationsCount: 0,
  searchImpressionsCount: 0,
  searchClicksCount: 0,
  promotionImpressionsCount: 0,
  promotionClicksCount: 0,
});

const ZERO_COMPANY_DAY = Object.freeze({
  profileViewsCount: 0,
  listingClicksCount: 0,
  contactClicksCount: 0,
});

export class PartnerAnalyticsService {
  #partnerAnalyticsRepository;

  #listingService;

  #advertisementService;

  #favoriteService;

  constructor({
    partnerAnalyticsRepository,
    listingService,
    advertisementService,
    favoriteService,
  }) {
    this.#partnerAnalyticsRepository = partnerAnalyticsRepository;
    this.#listingService = listingService;
    this.#advertisementService = advertisementService;
    this.#favoriteService = favoriteService;
  }

  async #assertAnalyticsAccess(principal, partnerId) {
    if (!principal) throw new AuthenticationError();
    if (await isPartnerOwner(principal.userId, partnerId)) return;
    const roleCode = await getPartnerEmployeeRoleCode(
      principal.userId,
      partnerId,
    );
    if (roleHasCapability(roleCode, PARTNER_CAPABILITIES.VIEW_ANALYTICS)) {
      return;
    }
    throw new AuthorizationError();
  }

  async #resolveRange(rangeDays) {
    return this.#partnerAnalyticsRepository.resolveBusinessDateRange(rangeDays);
  }

  #mergeOverviewDaily(fromDay, toDay, listingDaily, companyDaily) {
    const listingByDay = new Map(listingDaily.map((row) => [row.day, row]));
    const companyByDay = new Map(companyDaily.map((row) => [row.day, row]));
    return enumerateDays(fromDay, toDay).map((day) => {
      const l = listingByDay.get(day) ?? ZERO_LISTING_DAY;
      const c = companyByDay.get(day) ?? ZERO_COMPANY_DAY;
      return {
        day,
        impressionsCount: l.impressionsCount,
        viewsCount: l.viewsCount,
        dailyUniqueVisitors: l.dailyUniqueVisitors,
        favoriteAddsCount: l.favoriteAddsCount,
        favoriteRemovesCount: l.favoriteRemovesCount,
        bookingStartsCount: l.bookingStartsCount,
        bookingRequestsCount: l.bookingRequestsCount,
        bookingConfirmationsCount: l.bookingConfirmationsCount,
        searchImpressionsCount: l.searchImpressionsCount,
        searchClicksCount: l.searchClicksCount,
        promotionImpressionsCount: l.promotionImpressionsCount,
        promotionClicksCount: l.promotionClicksCount,
        contactClicksCount: c.contactClicksCount,
        companyProfileViews: c.profileViewsCount,
        companyListingClicks: c.listingClicksCount,
      };
    });
  }

  #zeroFillListingDaily(fromDay, toDay, series) {
    const byDay = new Map(series.map((row) => [row.day, row]));
    return enumerateDays(fromDay, toDay).map((day) => ({
      day,
      ...(byDay.get(day) ?? ZERO_LISTING_DAY),
    }));
  }

  #zeroFillPromotionDaily(fromDay, toDay, series) {
    const byDay = new Map(series.map((row) => [row.day, row]));
    return enumerateDays(fromDay, toDay).map((day) => {
      const row = byDay.get(day);
      return {
        day,
        impressionsCount: row?.impressionsCount ?? 0,
        clicksCount: row?.clicksCount ?? 0,
      };
    });
  }

  /**
   * `GET /analytics/partner/overview`. `exact_unique_visitors` and
   * `net_saves` are the two headline fields this method is careful to
   * source correctly (brief §9/§11/§38): the former from raw
   * `analytics_events` (never `SUM(daily_unique_visitors)`), the latter
   * from the CURRENT `favorites` table (a snapshot, not constrained by
   * `range` — see the DTO/repository doc comments for why).
   */
  async getOverview(principal, { partnerId, rangeDays }) {
    await this.#assertAnalyticsAccess(principal, partnerId);
    const { fromDay, toDay } = await this.#resolveRange(rangeDays);

    const [
      listingTotals,
      companyTotals,
      exactUniqueVisitors,
      netSaves,
      listingDaily,
      companyDaily,
    ] = await Promise.all([
      this.#partnerAnalyticsRepository.getListingRangeTotals({
        partnerId,
        fromDay,
        toDay,
      }),
      this.#partnerAnalyticsRepository.getCompanyRangeTotals({
        partnerId,
        fromDay,
        toDay,
      }),
      this.#partnerAnalyticsRepository.getExactUniqueVisitors({
        partnerId,
        fromDay,
        toDay,
      }),
      this.#favoriteService.countCurrentSavesForPartner(partnerId),
      this.#partnerAnalyticsRepository.getListingDailySeriesForPartner({
        partnerId,
        fromDay,
        toDay,
      }),
      this.#partnerAnalyticsRepository.getCompanyDailySeriesForPartner({
        partnerId,
        fromDay,
        toDay,
      }),
    ]);

    const totals = { ...listingTotals, ...companyTotals };
    const ratios = {
      viewToRequestConversion: computeRatio(
        totals.bookingRequestsCount,
        totals.viewsCount,
      ),
      searchCtr: computeRatio(
        totals.searchClicksCount,
        totals.searchImpressionsCount,
      ),
      promotionCtr: computeRatio(
        totals.promotionClicksCount,
        totals.promotionImpressionsCount,
      ),
    };
    const daily = this.#mergeOverviewDaily(
      fromDay,
      toDay,
      listingDaily,
      companyDaily,
    );

    return toPartnerOverviewResponse({
      partnerId,
      rangeDays,
      fromDay,
      toDay,
      totals,
      exactUniqueVisitors,
      netSaves,
      ratios,
      daily,
    });
  }

  /**
   * `GET /analytics/partner/listings`. Exact-unique-visitors and
   * net-saves are computed with exactly ONE grouped query each, scoped
   * to the current page's listing ids (brief §19 — never N+1).
   */
  async listListings(
    principal,
    { partnerId, rangeDays, sort, cursor, limit = DEFAULT_LISTINGS_LIMIT },
  ) {
    await this.#assertAnalyticsAccess(principal, partnerId);
    const { fromDay, toDay } = await this.#resolveRange(rangeDays);

    const { rows, meta } =
      await this.#partnerAnalyticsRepository.listListingsRange({
        partnerId,
        fromDay,
        toDay,
        sort,
        cursor,
        limit,
      });

    const listingIds = rows.map((row) => row.listingId);
    const [uniqueByListing, savesByListing] = await Promise.all([
      this.#partnerAnalyticsRepository.getExactUniqueVisitorsGroupedByListings({
        partnerId,
        listingIds,
        fromDay,
        toDay,
      }),
      this.#favoriteService.countCurrentSavesGroupedByListingIds(listingIds),
    ]);

    const enriched = rows.map((row) => ({
      ...row,
      exactUniqueVisitors: uniqueByListing.get(row.listingId) ?? 0,
      netSaves: savesByListing.get(row.listingId) ?? 0,
      searchCtr: computeRatio(
        row.searchClicksCount,
        row.searchImpressionsCount,
      ),
    }));

    return {
      rows: enriched.map(toPartnerListingRowResponse),
      meta: {
        ...meta,
        range_days: rangeDays,
        from_day: fromDay,
        to_day: toDay,
        timezone: 'Asia/Yerevan',
      },
    };
  }

  /**
   * `GET /analytics/partner/listings/:listingId`. Ownership is verified
   * through `listingService.getListingForAnalytics` (an internal,
   * principal-free lookup — see that method's own doc comment for why
   * it, and not `getListing`, is the correct check here) — a listing
   * that exists but belongs to a different partner than `partnerId`
   * resolves identically to one that doesn't exist at all (brief §22:
   * "do not leak whether another Partner's listing exists").
   */
  async getListingDetail(principal, { partnerId, rangeDays, listingId }) {
    await this.#assertAnalyticsAccess(principal, partnerId);
    const owned = await this.#listingService.getListingForAnalytics(
      partnerId,
      listingId,
    );
    if (!owned) throw new NotFoundError('Listing not found.');

    const { fromDay, toDay } = await this.#resolveRange(rangeDays);
    const [detail, exactUniqueVisitors, netSaves, dailySeries] =
      await Promise.all([
        this.#partnerAnalyticsRepository.getListingRangeDetail({
          listingId,
          fromDay,
          toDay,
        }),
        this.#partnerAnalyticsRepository.getExactUniqueVisitorsForListing({
          partnerId,
          listingId,
          fromDay,
          toDay,
        }),
        this.#favoriteService.countCurrentSavesForListing(listingId),
        this.#partnerAnalyticsRepository.getListingDailySeries({
          listingId,
          fromDay,
          toDay,
        }),
      ]);

    const ratios = {
      viewToRequestConversion: computeRatio(
        detail.bookingRequestsCount,
        detail.viewsCount,
      ),
      searchCtr: computeRatio(
        detail.searchClicksCount,
        detail.searchImpressionsCount,
      ),
      promotionCtr: computeRatio(
        detail.promotionClicksCount,
        detail.promotionImpressionsCount,
      ),
    };
    const daily = this.#zeroFillListingDaily(fromDay, toDay, dailySeries);

    return toPartnerListingDetailResponse({
      rangeDays,
      fromDay,
      toDay,
      listing: detail,
      exactUniqueVisitors,
      netSaves,
      ratios,
      daily,
    });
  }

  /**
   * `GET /analytics/partner/promotions/:promotionId`. Ownership uses
   * `advertisementService.getById` (authenticated-only, per that
   * method's own doc comment — it does NOT itself verify partner
   * ownership) purely as an existence lookup, then this method does the
   * ownership comparison itself — never the public
   * `getPublicPromotionContext` path (brief §25: "A5 is authenticated
   * historical reporting, not public ad delivery"). Never requires the
   * promotion to be currently active (brief §24/§57) — an expired
   * promotion's historical analytics remain readable to its owner for
   * as long as the daily aggregate retains it.
   */
  async getPromotionDetail(principal, { partnerId, rangeDays, promotionId }) {
    await this.#assertAnalyticsAccess(principal, partnerId);
    const ad = await this.#advertisementService.getById(principal, promotionId);
    if (ad.partnerId !== partnerId) {
      throw new NotFoundError('Promotion not found.');
    }

    const { fromDay, toDay } = await this.#resolveRange(rangeDays);
    const [totals, dailySeries] = await Promise.all([
      this.#partnerAnalyticsRepository.getPromotionRangeTotals({
        promotionId,
        fromDay,
        toDay,
      }),
      this.#partnerAnalyticsRepository.getPromotionDailySeries({
        promotionId,
        fromDay,
        toDay,
      }),
    ]);
    const ctr = computeRatio(totals.clicksCount, totals.impressionsCount);
    const daily = this.#zeroFillPromotionDaily(fromDay, toDay, dailySeries);

    return toPartnerPromotionDetailResponse({
      rangeDays,
      fromDay,
      toDay,
      promotionId,
      listingId: ad.listingId ?? null,
      totals,
      ctr,
      daily,
    });
  }
}

export default PartnerAnalyticsService;

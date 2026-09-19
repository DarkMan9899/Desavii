import { describe, test, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../../api/client.js';
import {
  getPartnerAnalyticsOverview,
  listPartnerAnalyticsListings,
  getPartnerAnalyticsListingDetail,
  getPartnerAnalyticsPromotionDetail,
} from './partnerAnalytics.js';

vi.mock('../../../api/client.js', () => ({
  default: { get: vi.fn() },
}));

describe('partnerAnalytics api (apps/web/src/modules/partnerAnalytics) — brief §57', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
    apiClient.get.mockResolvedValue({ data: { success: true } });
  });

  test('getPartnerAnalyticsOverview calls the exact A5 overview route with partnerId + range', async () => {
    await getPartnerAnalyticsOverview({ partnerId: 7, range: 30 });
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/partner/overview', {
      params: { partnerId: 7, range: 30 },
    });
  });

  test('listPartnerAnalyticsListings calls the exact A5 listings route with partnerId, range, sort, cursor, limit', async () => {
    await listPartnerAnalyticsListings({
      partnerId: 7,
      range: 90,
      sort: 'impressions',
      cursor: 'abc',
      limit: 20,
    });
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/partner/listings', {
      params: {
        partnerId: 7,
        range: 90,
        sort: 'impressions',
        cursor: 'abc',
        limit: 20,
      },
    });
  });

  test('getPartnerAnalyticsListingDetail calls the exact A5 listing-detail route with the listingId in the path, partnerId/range in query', async () => {
    await getPartnerAnalyticsListingDetail({
      partnerId: 7,
      listingId: 42,
      range: 7,
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/analytics/partner/listings/42',
      { params: { partnerId: 7, range: 7 } },
    );
  });

  test('getPartnerAnalyticsPromotionDetail calls the exact A5 promotion-detail route with the promotionId in the path, partnerId/range in query', async () => {
    await getPartnerAnalyticsPromotionDetail({
      partnerId: 7,
      promotionId: 99,
      range: 7,
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/analytics/partner/promotions/99',
      { params: { partnerId: 7, range: 7 } },
    );
  });
});

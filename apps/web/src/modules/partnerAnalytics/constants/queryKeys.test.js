import { describe, test, expect } from 'vitest';
import partnerAnalyticsKeys from './queryKeys.js';

describe('partnerAnalyticsKeys (apps/web/src/modules/partnerAnalytics) — brief §39', () => {
  test('overview key differs by partnerId and by rangeDays', () => {
    expect(partnerAnalyticsKeys.overview(1, 30)).not.toEqual(
      partnerAnalyticsKeys.overview(2, 30),
    );
    expect(partnerAnalyticsKeys.overview(1, 30)).not.toEqual(
      partnerAnalyticsKeys.overview(1, 90),
    );
  });

  test('listings key differs by partnerId, rangeDays, and sort', () => {
    const base = partnerAnalyticsKeys.listings(1, 30, 'views');
    expect(base).not.toEqual(partnerAnalyticsKeys.listings(2, 30, 'views'));
    expect(base).not.toEqual(partnerAnalyticsKeys.listings(1, 90, 'views'));
    expect(base).not.toEqual(
      partnerAnalyticsKeys.listings(1, 30, 'impressions'),
    );
  });

  test('listingDetail key differs by partnerId, listingId, and rangeDays', () => {
    const base = partnerAnalyticsKeys.listingDetail(1, 42, 30);
    expect(base).not.toEqual(partnerAnalyticsKeys.listingDetail(2, 42, 30));
    expect(base).not.toEqual(partnerAnalyticsKeys.listingDetail(1, 43, 30));
    expect(base).not.toEqual(partnerAnalyticsKeys.listingDetail(1, 42, 90));
  });

  test('promotionDetail key differs by partnerId, promotionId, and rangeDays', () => {
    const base = partnerAnalyticsKeys.promotionDetail(1, 99, 30);
    expect(base).not.toEqual(partnerAnalyticsKeys.promotionDetail(2, 99, 30));
    expect(base).not.toEqual(partnerAnalyticsKeys.promotionDetail(1, 98, 30));
    expect(base).not.toEqual(partnerAnalyticsKeys.promotionDetail(1, 99, 90));
  });
});

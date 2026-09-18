/**
 * A dedicated file (default `ANALYTICS_COLLECTION_ENABLED=false`, no env
 * override — the safe default in every environment, see config/index.js)
 * asserting the kill-switch short-circuits BEFORE any target resolution
 * or repository write is even attempted — a spoofed/garbage listingId
 * must never surface a 422 while collection is disabled (brief: "skip
 * target resolution entirely for performance").
 */

import { describe, test, expect, jest } from '@jest/globals';
import { EngagementAnalyticsService } from '../../../../src/modules/engagementAnalytics/services/engagementAnalyticsService.js';

function buildService() {
  const engagementAnalyticsRepository = { insertBatch: jest.fn() };
  const listingService = { getListing: jest.fn() };
  const partnerService = { getPublicPartnerBySlug: jest.fn() };
  const advertisementService = { getPublicPromotionContext: jest.fn() };
  const service = new EngagementAnalyticsService({
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
  });
  return {
    service,
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
  };
}

describe('EngagementAnalyticsService with collection disabled', () => {
  test('ingestClientEvents is a no-op and never resolves targets, even for a nonexistent listing', async () => {
    const { service, engagementAnalyticsRepository, listingService } =
      buildService();
    await expect(
      service.ingestClientEvents({
        principal: null,
        events: [
          {
            eventId: 'x',
            eventName: 'listing_impression',
            sessionId: 's',
            listingId: 999_999_999,
            placement: 'search_results',
          },
        ],
        userAgent: 'test',
        referer: undefined,
      }),
    ).resolves.toBeUndefined();
    expect(listingService.getListing).not.toHaveBeenCalled();
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });

  test('recordServerEvent is a no-op', async () => {
    const { service, engagementAnalyticsRepository } = buildService();
    await service.recordServerEvent({
      eventName: 'favorite_added',
      userId: 1,
      listingId: 5,
      partnerId: 9,
    });
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });
});

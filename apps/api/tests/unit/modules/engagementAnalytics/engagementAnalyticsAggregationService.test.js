import { describe, test, expect, jest } from '@jest/globals';
import { EngagementAnalyticsAggregationService } from '../../../../src/modules/engagementAnalytics/services/engagementAnalyticsAggregationService.js';
import { InternalError } from '../../../../src/errors/AppError.js';

function buildRepository(overrides = {}) {
  return {
    getCurrentBusinessDate: jest.fn().mockResolvedValue('2026-09-19'),
    getRecentCompletedBusinessDates: jest
      .fn()
      .mockResolvedValue(['2026-09-18', '2026-09-17', '2026-09-16']),
    findListingPartnerIdConflicts: jest.fn().mockResolvedValue([]),
    findPromotionPartnerIdConflicts: jest.fn().mockResolvedValue([]),
    upsertListingDaily: jest.fn().mockResolvedValue(1),
    upsertCompanyDaily: jest.fn().mockResolvedValue(1),
    upsertPromotionDaily: jest.fn().mockResolvedValue(1),
    purgeRawEventsOlderThanRetentionWindow: jest.fn().mockResolvedValue(0),
    purgeAggregatesOlderThanRetentionWindow: jest
      .fn()
      .mockResolvedValue({ listing: 0, company: 0, promotion: 0 }),
    ...overrides,
  };
}

describe('EngagementAnalyticsAggregationService — aggregateDay (brief §7/§9/§26)', () => {
  test('upserts listing, company, and promotion daily in sequence for a clean day', async () => {
    const calls = [];
    const engagementAnalyticsAggregationRepository = buildRepository({
      upsertListingDaily: jest.fn(async () => {
        calls.push('listing');
        return 1;
      }),
      upsertCompanyDaily: jest.fn(async () => {
        calls.push('company');
        return 1;
      }),
      upsertPromotionDaily: jest.fn(async () => {
        calls.push('promotion');
        return 1;
      }),
    });
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

    const result = await service.aggregateDay('2026-06-15');

    expect(calls).toEqual(['listing', 'company', 'promotion']);
    expect(result).toEqual({
      day: '2026-06-15',
      listingRowsAffected: 1,
      companyRowsAffected: 1,
      promotionRowsAffected: 1,
    });
  });

  test('aborts BEFORE writing anything when a listing has conflicting server-resolved partner_id values', async () => {
    const engagementAnalyticsAggregationRepository = buildRepository({
      findListingPartnerIdConflicts: jest
        .fn()
        .mockResolvedValue([{ listingId: 42, partnerIdVariety: 2 }]),
    });
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

    await expect(service.aggregateDay('2026-06-15')).rejects.toThrow(
      InternalError,
    );
    expect(
      engagementAnalyticsAggregationRepository.upsertListingDaily,
    ).not.toHaveBeenCalled();
    expect(
      engagementAnalyticsAggregationRepository.upsertCompanyDaily,
    ).not.toHaveBeenCalled();
    expect(
      engagementAnalyticsAggregationRepository.upsertPromotionDaily,
    ).not.toHaveBeenCalled();
  });

  test('aborts BEFORE writing anything when a promotion has conflicting server-resolved partner_id values', async () => {
    const engagementAnalyticsAggregationRepository = buildRepository({
      findPromotionPartnerIdConflicts: jest
        .fn()
        .mockResolvedValue([{ promotionId: 7, partnerIdVariety: 2 }]),
    });
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

    await expect(service.aggregateDay('2026-06-15')).rejects.toThrow(
      /conflicting server-resolved partner_id/,
    );
    expect(
      engagementAnalyticsAggregationRepository.upsertListingDaily,
    ).not.toHaveBeenCalled();
  });
});

describe('EngagementAnalyticsAggregationService — aggregateRecentCompletedDays (brief §15/§16)', () => {
  test('recomputes the 3 most recently completed days, oldest first, never touching today', async () => {
    const daysAggregated = [];
    const engagementAnalyticsAggregationRepository = buildRepository({
      upsertListingDaily: jest.fn(async ({ day }) => {
        daysAggregated.push(day);
        return 1;
      }),
    });
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

    const results = await service.aggregateRecentCompletedDays();

    expect(
      engagementAnalyticsAggregationRepository.getRecentCompletedBusinessDates,
    ).toHaveBeenCalledWith(3);
    // Repository returns [yesterday, day-2, day-3] (newest-completed
    // first) — the service aggregates oldest-first.
    expect(daysAggregated).toEqual(['2026-09-16', '2026-09-17', '2026-09-18']);
    expect(daysAggregated).not.toContain('2026-09-19'); // today, never aggregated
    expect(results).toHaveLength(3);
  });
});

describe('EngagementAnalyticsAggregationService — runDailyMaintenance ordering (brief §21/§37)', () => {
  test('aggregates the recent completed days BEFORE either retention purge runs', async () => {
    const order = [];
    const engagementAnalyticsAggregationRepository = buildRepository({
      upsertListingDaily: jest.fn(async () => {
        order.push('aggregate');
        return 1;
      }),
      purgeRawEventsOlderThanRetentionWindow: jest.fn(async () => {
        order.push('purgeRaw');
        return 0;
      }),
      purgeAggregatesOlderThanRetentionWindow: jest.fn(async () => {
        order.push('purgeAggregates');
        return { listing: 0, company: 0, promotion: 0 };
      }),
    });
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });

    await service.runDailyMaintenance();

    // 3 aggregate calls (one per recomputed day) must all precede both purges.
    const firstPurgeIndex = order.findIndex((e) => e.startsWith('purge'));
    const lastAggregateIndex = order.lastIndexOf('aggregate');
    expect(lastAggregateIndex).toBeLessThan(firstPurgeIndex);
    // Raw purge before aggregate purge (brief §21's explicit ordering).
    expect(order.indexOf('purgeRaw')).toBeLessThan(
      order.indexOf('purgeAggregates'),
    );
  });

  test('is independent of ANALYTICS_COLLECTION_ENABLED — reads no config, no env var, in this module (brief §39)', async () => {
    const originalValue = process.env.ANALYTICS_COLLECTION_ENABLED;
    process.env.ANALYTICS_COLLECTION_ENABLED = 'false';
    try {
      const engagementAnalyticsAggregationRepository = buildRepository();
      const service = new EngagementAnalyticsAggregationService({
        engagementAnalyticsAggregationRepository,
      });
      const result = await service.runDailyMaintenance();
      expect(result.aggregation).toHaveLength(3);
      expect(
        engagementAnalyticsAggregationRepository.purgeRawEventsOlderThanRetentionWindow,
      ).toHaveBeenCalled();
      expect(
        engagementAnalyticsAggregationRepository.purgeAggregatesOlderThanRetentionWindow,
      ).toHaveBeenCalled();
    } finally {
      process.env.ANALYTICS_COLLECTION_ENABLED = originalValue;
    }
  });
});

describe('EngagementAnalyticsAggregationService — retention windows (brief §18/§20)', () => {
  test('purgeRawEvents uses the 90-day retention constant', async () => {
    const engagementAnalyticsAggregationRepository = buildRepository();
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });
    await service.purgeRawEvents();
    expect(
      engagementAnalyticsAggregationRepository.purgeRawEventsOlderThanRetentionWindow,
    ).toHaveBeenCalledWith({ windowDays: 90 });
  });

  test('purgeAggregates uses the 24-month retention constant', async () => {
    const engagementAnalyticsAggregationRepository = buildRepository();
    const service = new EngagementAnalyticsAggregationService({
      engagementAnalyticsAggregationRepository,
    });
    await service.purgeAggregates();
    expect(
      engagementAnalyticsAggregationRepository.purgeAggregatesOlderThanRetentionWindow,
    ).toHaveBeenCalledWith({ retentionMonths: 24 });
  });
});

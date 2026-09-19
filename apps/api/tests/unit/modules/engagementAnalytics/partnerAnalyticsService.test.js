import { describe, test, expect, jest } from '@jest/globals';

let PartnerAnalyticsService;
let AuthenticationError;
let AuthorizationError;
let NotFoundError;
let isPartnerOwnerMock;
let getPartnerEmployeeRoleCodeMock;

jest.unstable_mockModule(
  '../../../../src/infrastructure/database/repositories/partnerEmployeeRepository.js',
  () => ({
    isPartnerOwner: (...args) => isPartnerOwnerMock(...args),
    getPartnerEmployeeRoleCode: (...args) =>
      getPartnerEmployeeRoleCodeMock(...args),
  }),
);

beforeAll(async () => {
  ({ PartnerAnalyticsService } =
    await import('../../../../src/modules/engagementAnalytics/services/partnerAnalyticsService.js'));
  ({ AuthenticationError, AuthorizationError, NotFoundError } =
    await import('../../../../src/errors/AppError.js'));
});

function buildRepository(overrides = {}) {
  return {
    resolveBusinessDateRange: jest
      .fn()
      .mockResolvedValue({ fromDay: '2026-08-01', toDay: '2026-08-30' }),
    getListingRangeTotals: jest.fn().mockResolvedValue({
      impressionsCount: 0,
      viewsCount: 0,
      favoriteAddsCount: 0,
      favoriteRemovesCount: 0,
      bookingStartsCount: 0,
      bookingRequestsCount: 0,
      bookingConfirmationsCount: 0,
      searchImpressionsCount: 0,
      searchClicksCount: 0,
      promotionImpressionsCount: 0,
      promotionClicksCount: 0,
    }),
    getCompanyRangeTotals: jest.fn().mockResolvedValue({
      profileViewsCount: 0,
      listingClicksCount: 0,
      contactClicksCount: 0,
    }),
    getExactUniqueVisitors: jest.fn().mockResolvedValue(0),
    getListingDailySeriesForPartner: jest.fn().mockResolvedValue([]),
    getCompanyDailySeriesForPartner: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function buildServices(overrides = {}) {
  const partnerAnalyticsRepository = buildRepository(
    overrides.partnerAnalyticsRepository,
  );
  const listingService = {
    getListingForAnalytics: jest.fn().mockResolvedValue(null),
    ...overrides.listingService,
  };
  const advertisementService = {
    getById: jest.fn(),
    ...overrides.advertisementService,
  };
  const favoriteService = {
    countCurrentSavesForPartner: jest.fn().mockResolvedValue(0),
    countCurrentSavesGroupedByListingIds: jest
      .fn()
      .mockResolvedValue(new Map()),
    countCurrentSavesForListing: jest.fn().mockResolvedValue(0),
    ...overrides.favoriteService,
  };
  const service = new PartnerAnalyticsService({
    partnerAnalyticsRepository,
    listingService,
    advertisementService,
    favoriteService,
  });
  return {
    service,
    partnerAnalyticsRepository,
    listingService,
    advertisementService,
    favoriteService,
  };
}

const PRINCIPAL = { userId: 42, roles: ['VENDOR'] };

describe('PartnerAnalyticsService — workspace/capability access (brief §4/§26/§27)', () => {
  test('rejects with AuthenticationError when principal is missing', async () => {
    isPartnerOwnerMock = jest.fn();
    getPartnerEmployeeRoleCodeMock = jest.fn();
    const { service } = buildServices();
    await expect(
      service.getOverview(null, { partnerId: 7, rangeDays: 30 }),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  test('OWNER always passes, without consulting the role/capability lookup', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    getPartnerEmployeeRoleCodeMock = jest.fn();
    const { service } = buildServices();
    await expect(
      service.getOverview(PRINCIPAL, { partnerId: 7, rangeDays: 30 }),
    ).resolves.toBeDefined();
    expect(getPartnerEmployeeRoleCodeMock).not.toHaveBeenCalled();
  });

  test('a role granted VIEW_ANALYTICS (ANALYTICS_VIEWER) passes', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(false);
    getPartnerEmployeeRoleCodeMock = jest
      .fn()
      .mockResolvedValue('ANALYTICS_VIEWER');
    const { service } = buildServices();
    await expect(
      service.getOverview(PRINCIPAL, { partnerId: 7, rangeDays: 30 }),
    ).resolves.toBeDefined();
  });

  test('a role WITHOUT VIEW_ANALYTICS (EDITOR) is rejected with AuthorizationError', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(false);
    getPartnerEmployeeRoleCodeMock = jest.fn().mockResolvedValue('EDITOR');
    const { service } = buildServices();
    await expect(
      service.getOverview(PRINCIPAL, { partnerId: 7, rangeDays: 30 }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  test('no partner_employees membership at all is rejected', async () => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(false);
    getPartnerEmployeeRoleCodeMock = jest.fn().mockResolvedValue(null);
    const { service } = buildServices();
    await expect(
      service.getOverview(PRINCIPAL, { partnerId: 7, rangeDays: 30 }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('PartnerAnalyticsService — ratio calculation (brief §13/§36/§53)', () => {
  beforeEach(() => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    getPartnerEmployeeRoleCodeMock = jest.fn();
  });

  test('view_to_request_conversion / search_ctr / promotion_ctr are 0 when the denominator is 0 — never throws', async () => {
    const { service } = buildServices();
    const result = await service.getOverview(PRINCIPAL, {
      partnerId: 7,
      rangeDays: 30,
    });
    expect(result.view_to_request_conversion).toBe(0);
    expect(result.search_ctr).toBe(0);
    expect(result.promotion_ctr).toBe(0);
  });

  test('search_ctr is the weighted SUM ratio, rounded to at most 4 decimals', async () => {
    const { service } = buildServices({
      partnerAnalyticsRepository: {
        getListingRangeTotals: jest.fn().mockResolvedValue({
          impressionsCount: 0,
          viewsCount: 30,
          favoriteAddsCount: 0,
          favoriteRemovesCount: 0,
          bookingStartsCount: 0,
          bookingRequestsCount: 3,
          bookingConfirmationsCount: 0,
          searchImpressionsCount: 101,
          searchClicksCount: 21,
          promotionImpressionsCount: 200,
          promotionClicksCount: 30,
        }),
      },
    });
    const result = await service.getOverview(PRINCIPAL, {
      partnerId: 7,
      rangeDays: 30,
    });
    expect(result.search_ctr).toBeCloseTo(0.2079, 4);
    expect(result.promotion_ctr).toBe(0.15);
    expect(result.view_to_request_conversion).toBe(0.1); // 3 / 30
  });
});

describe('PartnerAnalyticsService — listing/promotion ownership masking (brief §22/§25/§57)', () => {
  beforeEach(() => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    getPartnerEmployeeRoleCodeMock = jest.fn();
  });

  test('a listing that getListingForAnalytics resolves to null (not owned, or soft-deleted) throws NotFoundError', async () => {
    const { service } = buildServices({
      listingService: {
        getListingForAnalytics: jest.fn().mockResolvedValue(null),
      },
    });
    await expect(
      service.getListingDetail(PRINCIPAL, {
        partnerId: 7,
        rangeDays: 30,
        listingId: 999,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('a promotion belonging to a different partner throws NotFoundError, never leaking existence', async () => {
    const { service } = buildServices({
      advertisementService: {
        getById: jest
          .fn()
          .mockResolvedValue({ id: 5, partnerId: 999, listingId: 1 }),
      },
    });
    await expect(
      service.getPromotionDetail(PRINCIPAL, {
        partnerId: 7,
        rangeDays: 30,
        promotionId: 5,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('PartnerAnalyticsService — zero-fill (brief §17/§40/§51)', () => {
  beforeEach(() => {
    isPartnerOwnerMock = jest.fn().mockResolvedValue(true);
    getPartnerEmployeeRoleCodeMock = jest.fn();
  });

  test('a zero-data partner still returns a fully zero-filled daily series spanning the whole range', async () => {
    const { service, partnerAnalyticsRepository } = buildServices({
      partnerAnalyticsRepository: {
        resolveBusinessDateRange: jest
          .fn()
          .mockResolvedValue({ fromDay: '2026-08-24', toDay: '2026-08-30' }),
      },
    });
    const result = await service.getOverview(PRINCIPAL, {
      partnerId: 7,
      rangeDays: 7,
    });
    expect(result.daily).toHaveLength(7);
    expect(result.daily.every((d) => d.impressions === 0)).toBe(true);
    expect(result.daily[0].day).toBe('2026-08-24');
    expect(result.daily[6].day).toBe('2026-08-30');
    expect(
      partnerAnalyticsRepository.getListingDailySeriesForPartner,
    ).toHaveBeenCalledWith({
      partnerId: 7,
      fromDay: '2026-08-24',
      toDay: '2026-08-30',
    });
  });
});

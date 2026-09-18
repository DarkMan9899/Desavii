/**
 * `ANALYTICS_COLLECTION_ENABLED` must be forced to `true` BEFORE
 * `config/index.js` is ever evaluated (`cleanEnv` reads `process.env`
 * once, at import time) — every static top-level import of a module that
 * transitively imports config is avoided in favor of a dynamic
 * `import()` inside `beforeAll`, the same established pattern
 * `paymentsDisabledGate.test.js` uses for `PAYMENTS_ENABLED`. Jest gives
 * each test file its own module registry, so this never leaks into
 * `engagementAnalyticsService.collectionDisabled.test.js`.
 */

import { describe, test, expect, jest, beforeAll } from '@jest/globals';

let EngagementAnalyticsService;
let NotFoundError;
let ValidationError;

beforeAll(async () => {
  process.env.ANALYTICS_COLLECTION_ENABLED = 'true';
  ({ EngagementAnalyticsService } =
    await import('../../../../src/modules/engagementAnalytics/services/engagementAnalyticsService.js'));
  ({ NotFoundError, ValidationError } =
    await import('../../../../src/errors/AppError.js'));
});

function buildService(overrides = {}) {
  const engagementAnalyticsRepository = {
    insertBatch: jest.fn().mockResolvedValue(undefined),
    ...overrides.engagementAnalyticsRepository,
  };
  const listingService = {
    getListing: jest.fn().mockResolvedValue({ id: 5, partnerId: 9 }),
    ...overrides.listingService,
  };
  const partnerService = {
    getPublicPartnerBySlug: jest
      .fn()
      .mockResolvedValue({ id: 9, slug: 'acme-hotels' }),
    ...overrides.partnerService,
  };
  const advertisementService = {
    getPublicPromotionContext: jest
      .fn()
      .mockResolvedValue({ id: 3, partnerId: 9, placement: 'home_featured' }),
    ...overrides.advertisementService,
  };
  // A2.1: no active partner_employees row by default (i.e. this
  // (userId, partnerId) pair is never internal unless a test overrides
  // it) — matches `getPartnerEmployeeRoleCode`'s real "no active
  // membership" return value.
  const getPartnerEmployeeRoleCode =
    overrides.getPartnerEmployeeRoleCode ?? jest.fn().mockResolvedValue(null);
  const service = new EngagementAnalyticsService({
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
    getPartnerEmployeeRoleCode,
  });
  return {
    service,
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
    getPartnerEmployeeRoleCode,
  };
}

const BASE_EVENT = {
  eventId: 'event-1',
  eventName: 'listing_viewed',
  sessionId: 'session-1',
  listingId: 5,
};

describe('EngagementAnalyticsService#ingestClientEvents', () => {
  test('resolves the target server-side and writes a row with server-resolved partnerId, never a client-supplied one', async () => {
    const { service, engagementAnalyticsRepository, listingService } =
      buildService();
    await service.ingestClientEvents({
      principal: null,
      events: [BASE_EVENT],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      referer: undefined,
    });
    expect(listingService.getListing).toHaveBeenCalledWith(null, 5);
    expect(engagementAnalyticsRepository.insertBatch).toHaveBeenCalledTimes(1);
    const [rows] = engagementAnalyticsRepository.insertBatch.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      eventName: 'listing_viewed',
      listingId: 5,
      partnerId: 9,
      deviceClass: 'desktop',
      trafficSource: 'direct',
    });
  });

  test('a nonexistent/unpublished listing normalizes to a generic ValidationError for the whole request, nothing written', async () => {
    const notFound = new NotFoundError('Listing not found.');
    const { service, engagementAnalyticsRepository } = buildService({
      listingService: { getListing: jest.fn().mockRejectedValue(notFound) },
    });
    await expect(
      service.ingestClientEvents({
        principal: null,
        events: [BASE_EVENT],
        userAgent: 'test',
        referer: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });

  test('one bad event in a batch rejects the WHOLE batch — all-or-nothing, nothing written', async () => {
    const { service, engagementAnalyticsRepository, listingService } =
      buildService();
    listingService.getListing.mockImplementation((principal, id) => {
      if (id === 5) return Promise.resolve({ id: 5, partnerId: 9 });
      return Promise.reject(new NotFoundError('Listing not found.'));
    });
    await expect(
      service.ingestClientEvents({
        principal: null,
        events: [
          BASE_EVENT,
          { ...BASE_EVENT, eventId: 'event-2', listingId: 6 },
        ],
        userAgent: 'test',
        referer: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });

  test('company_listing_click rejects when the listing does not actually belong to the claimed company slug', async () => {
    const {
      service,
      listingService,
      partnerService,
      engagementAnalyticsRepository,
    } = buildService({
      listingService: {
        getListing: jest.fn().mockResolvedValue({ id: 5, partnerId: 42 }),
      },
      partnerService: {
        getPublicPartnerBySlug: jest.fn().mockResolvedValue({ id: 9 }),
      },
    });
    await expect(
      service.ingestClientEvents({
        principal: null,
        events: [
          {
            eventId: 'e1',
            eventName: 'company_listing_click',
            sessionId: 's1',
            companySlug: 'acme-hotels',
            listingId: 5,
          },
        ],
        userAgent: 'test',
        referer: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(listingService.getListing).toHaveBeenCalled();
    expect(partnerService.getPublicPartnerBySlug).toHaveBeenCalled();
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });

  test('a promotion not belonging to the supplied listing is rejected generically', async () => {
    const { service, advertisementService, engagementAnalyticsRepository } =
      buildService({
        advertisementService: {
          getPublicPromotionContext: jest
            .fn()
            .mockRejectedValue(new NotFoundError('Promotion not found.')),
        },
      });
    await expect(
      service.ingestClientEvents({
        principal: null,
        events: [
          {
            eventId: 'e1',
            eventName: 'promotion_impression',
            sessionId: 's1',
            listingId: 5,
            promotionId: 3,
            placement: 'home_featured',
          },
        ],
        userAgent: 'test',
        referer: undefined,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(advertisementService.getPublicPromotionContext).toHaveBeenCalledWith(
      3,
      5,
    );
    expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
  });

  describe('semantic dedup key', () => {
    test('is attached for listing_impression, built from server-resolved context', async () => {
      const { service, engagementAnalyticsRepository } = buildService();
      await service.ingestClientEvents({
        principal: null,
        events: [
          {
            eventId: 'e1',
            eventName: 'listing_impression',
            sessionId: 's1',
            listingId: 5,
            placement: 'search_results',
          },
        ],
        userAgent: 'test',
        referer: undefined,
      });
      const [rows] = engagementAnalyticsRepository.insertBatch.mock.calls[0];
      expect(Buffer.isBuffer(rows[0].dedupKey)).toBe(true);
    });

    test('is null for an event with no semantic dedup rule (contact_click)', async () => {
      const { service, engagementAnalyticsRepository } = buildService();
      await service.ingestClientEvents({
        principal: null,
        events: [
          {
            eventId: 'e1',
            eventName: 'contact_click',
            sessionId: 's1',
            companySlug: 'acme-hotels',
            contactMethod: 'phone',
          },
        ],
        userAgent: 'test',
        referer: undefined,
      });
      const [rows] = engagementAnalyticsRepository.insertBatch.mock.calls[0];
      expect(rows[0].dedupKey).toBeNull();
    });
  });

  describe('internal-traffic filtering', () => {
    test('ADMIN principal traffic is silently filtered — no row written, still resolves', async () => {
      const { service, engagementAnalyticsRepository } = buildService();
      await expect(
        service.ingestClientEvents({
          principal: { userId: 1, roles: ['ADMIN'], partnerId: null },
          events: [BASE_EVENT],
          userAgent: 'test',
          referer: undefined,
        }),
      ).resolves.toBeUndefined();
      expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
    });

    test('SUPER_ADMIN principal traffic is silently filtered', async () => {
      const { service, engagementAnalyticsRepository } = buildService();
      await service.ingestClientEvents({
        principal: { userId: 1, roles: ['SUPER_ADMIN'], partnerId: null },
        events: [BASE_EVENT],
        userAgent: 'test',
        referer: undefined,
      });
      expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
    });

    test('a PARTNER principal with an active partner_employees row for the resolved target partner is filtered — never from a JWT claim', async () => {
      const {
        service,
        engagementAnalyticsRepository,
        getPartnerEmployeeRoleCode,
      } = buildService({
        getPartnerEmployeeRoleCode: jest.fn().mockResolvedValue('OWNER'),
      });
      await service.ingestClientEvents({
        // A2.1: principal.partnerId is never read — the real access
        // token hardcodes it null anyway (authenticationService.js
        // #issueTokenPair). Filtering must work with it absent.
        principal: { userId: 2, roles: ['CUSTOMER'], partnerId: null },
        events: [BASE_EVENT], // resolves to partnerId 9
        userAgent: 'test',
        referer: undefined,
      });
      expect(getPartnerEmployeeRoleCode).toHaveBeenCalledWith(2, 9);
      expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
    });

    test('a PARTNER principal with no active membership in the resolved target partner still counts', async () => {
      const { service, engagementAnalyticsRepository } = buildService({
        getPartnerEmployeeRoleCode: jest.fn().mockResolvedValue(null),
      });
      await service.ingestClientEvents({
        principal: { userId: 2, roles: ['CUSTOMER'], partnerId: null },
        events: [BASE_EVENT], // resolves to partnerId 9
        userAgent: 'test',
        referer: undefined,
      });
      expect(engagementAnalyticsRepository.insertBatch).toHaveBeenCalledTimes(
        1,
      );
    });

    test('CUSTOMER and anonymous traffic always counts, and never triggers a membership lookup', async () => {
      const {
        service,
        engagementAnalyticsRepository,
        getPartnerEmployeeRoleCode,
      } = buildService();
      await service.ingestClientEvents({
        principal: null,
        events: [BASE_EVENT],
        userAgent: 'test',
        referer: undefined,
      });
      expect(engagementAnalyticsRepository.insertBatch).toHaveBeenCalledTimes(
        1,
      );
      expect(getPartnerEmployeeRoleCode).not.toHaveBeenCalled();
    });

    test('ADMIN/SUPER_ADMIN filtering never triggers a membership lookup either', async () => {
      const { service, getPartnerEmployeeRoleCode } = buildService();
      await service.ingestClientEvents({
        principal: { userId: 1, roles: ['ADMIN'], partnerId: null },
        events: [BASE_EVENT],
        userAgent: 'test',
        referer: undefined,
      });
      expect(getPartnerEmployeeRoleCode).not.toHaveBeenCalled();
    });

    test('filtering is per-event within a batch — one internal event never suppresses a genuine one', async () => {
      const { service, engagementAnalyticsRepository, listingService } =
        buildService({
          getPartnerEmployeeRoleCode: jest
            .fn()
            .mockImplementation((userId, partnerId) =>
              Promise.resolve(partnerId === 9 ? 'OWNER' : null),
            ),
        });
      listingService.getListing.mockImplementation((principal, id) =>
        Promise.resolve({ id, partnerId: id === 5 ? 9 : 42 }),
      );
      await service.ingestClientEvents({
        principal: { userId: 2, roles: ['CUSTOMER'], partnerId: null },
        events: [
          BASE_EVENT, // listingId 5 -> partnerId 9 (member) -> filtered
          { ...BASE_EVENT, eventId: 'e2', listingId: 6 }, // partnerId 42 -> counts
        ],
        userAgent: 'test',
        referer: undefined,
      });
      const [rows] = engagementAnalyticsRepository.insertBatch.mock.calls[0];
      expect(rows).toHaveLength(1);
      expect(rows[0].listingId).toBe(6);
    });

    test('memoizes the membership lookup within one request — same (userId, partnerId) pair queried only once across the whole batch', async () => {
      const { service, getPartnerEmployeeRoleCode, listingService } =
        buildService({
          getPartnerEmployeeRoleCode: jest.fn().mockResolvedValue('EDITOR'),
        });
      listingService.getListing.mockResolvedValue({ id: 5, partnerId: 9 });
      await service.ingestClientEvents({
        principal: { userId: 2, roles: ['CUSTOMER'], partnerId: null },
        events: [
          BASE_EVENT,
          { ...BASE_EVENT, eventId: 'e2' },
          { ...BASE_EVENT, eventId: 'e3' },
        ],
        userAgent: 'test',
        referer: undefined,
      });
      expect(getPartnerEmployeeRoleCode).toHaveBeenCalledTimes(1);
    });

    test('a membership lookup failure fails CLOSED — the event is filtered, never thrown, never counted', async () => {
      const { service, engagementAnalyticsRepository } = buildService({
        getPartnerEmployeeRoleCode: jest
          .fn()
          .mockRejectedValue(new Error('connection reset')),
      });
      await expect(
        service.ingestClientEvents({
          principal: { userId: 2, roles: ['CUSTOMER'], partnerId: null },
          events: [BASE_EVENT],
          userAgent: 'test',
          referer: undefined,
        }),
      ).resolves.toBeUndefined();
      expect(engagementAnalyticsRepository.insertBatch).not.toHaveBeenCalled();
    });
  });
});

describe('EngagementAnalyticsService#recordServerEvent', () => {
  test('writes a server-generated event_id row with no session/visitor identity', async () => {
    const { service, engagementAnalyticsRepository } = buildService();
    await service.recordServerEvent({
      eventName: 'favorite_added',
      userId: 1,
      listingId: 5,
      partnerId: 9,
    });
    expect(engagementAnalyticsRepository.insertBatch).toHaveBeenCalledTimes(1);
    const [rows] = engagementAnalyticsRepository.insertBatch.mock.calls[0];
    expect(rows[0]).toMatchObject({
      eventName: 'favorite_added',
      userId: 1,
      listingId: 5,
      partnerId: 9,
      sessionId: null,
      anonymousVisitorId: null,
      dedupKey: null,
    });
    expect(typeof rows[0].eventId).toBe('string');
    expect(rows[0].eventId.length).toBeGreaterThan(0);
  });

  test('throws for an event name outside the server-authoritative set (defense against a wiring mistake)', async () => {
    const { service } = buildService();
    await expect(
      service.recordServerEvent({ eventName: 'listing_impression' }),
    ).rejects.toBeInstanceOf(TypeError);
  });

  test('vendor_registered/listing_created are not server-authoritative in A2 (reserved/unwired)', async () => {
    const { service } = buildService();
    await expect(
      service.recordServerEvent({ eventName: 'vendor_registered' }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      service.recordServerEvent({ eventName: 'listing_created' }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});

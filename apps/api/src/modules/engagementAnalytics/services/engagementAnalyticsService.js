/**
 * EngagementAnalyticsService — Step A2 (Ingestion + Server-Authoritative
 * Events). Two entry points:
 *
 *  - `ingestClientEvents` — the public, optionally-authenticated
 *    `POST /analytics/events` request path. Every target (listing_id,
 *    company_slug, promotion_id) is resolved SERVER-SIDE through the
 *    owning module's own public Service interface — a client-supplied
 *    id is only ever an input to that lookup, never trusted directly for
 *    authorization/attribution (BACKEND_ARCHITECTURE.md §4: never a
 *    second Repository over another module's own tables).
 *
 *  - `recordServerEvent` — called only by `engagementAnalyticsListener`
 *    (this module's own `DomainEventBus` subscriber, the ONLY place it
 *    reacts to another module's events, mirroring `notificationListener
 *    .js`'s established rule). Never called directly by another
 *    module's business Service.
 *
 * All-or-nothing target resolution (A0.1 §10/§34): if ANY event in a
 * client batch fails resolution, the WHOLE request is rejected (422,
 * nothing written) — this method never partially resolves a batch.
 * Every resolution failure (nonexistent, not public, mismatched
 * promotion/listing) is normalized to the exact same generic
 * `ValidationError` so this endpoint can never be used as an
 * enumeration oracle (A0.1 §34).
 */

import { randomUUID } from 'node:crypto';
import { ValidationError, NotFoundError } from '../../../errors/AppError.js';
import config from '../../../config/index.js';
import { getPartnerEmployeeRoleCode as defaultGetPartnerEmployeeRoleCode } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { getModuleLogger } from '../../../logging/logger.js';
import {
  computeDedupKey,
  classifyDeviceClass,
  classifyTrafficSource,
} from '../models/eventContext.js';
import { ANALYTICS_EVENTS } from '../constants/engagementAnalyticsConstants.js';

const log = getModuleLogger('engagementAnalytics');

const GENERIC_TARGET_ERROR = 'One or more events reference an invalid target.';

/**
 * Analytics event names a server-authoritative domain-event subscriber
 * is allowed to record — deliberately excludes `vendor_registered`/
 * `listing_created` (A2 explicitly leaves both reserved/unwired).
 */
const SERVER_AUTHORITATIVE_EVENT_NAMES = new Set([
  ANALYTICS_EVENTS.FAVORITE_ADDED,
  ANALYTICS_EVENTS.FAVORITE_REMOVED,
  ANALYTICS_EVENTS.BOOKING_STARTED,
  ANALYTICS_EVENTS.BOOKING_REQUEST_SUBMITTED,
  ANALYTICS_EVENTS.BOOKING_CONFIRMED,
  ANALYTICS_EVENTS.BOOKING_REJECTED,
  ANALYTICS_EVENTS.BOOKING_CANCELLED,
]);

/** ADMIN/SUPER_ADMIN client-observation traffic never counts (A0.1 §22 locked rule). */
const INTERNAL_ROLE_CODES = new Set(['ADMIN', 'SUPER_ADMIN']);

export class EngagementAnalyticsService {
  #engagementAnalyticsRepository;

  #listingService;

  #partnerService;

  #advertisementService;

  #getPartnerEmployeeRoleCode;

  constructor({
    engagementAnalyticsRepository,
    listingService,
    partnerService,
    advertisementService,
    getPartnerEmployeeRoleCode = defaultGetPartnerEmployeeRoleCode,
  }) {
    this.#engagementAnalyticsRepository = engagementAnalyticsRepository;
    this.#listingService = listingService;
    this.#partnerService = partnerService;
    this.#advertisementService = advertisementService;
    this.#getPartnerEmployeeRoleCode = getPartnerEmployeeRoleCode;
  }

  /**
   * Step A2.1 fix: self-traffic exclusion is decided from AUTHORITATIVE
   * current `partner_employees` membership (looked up fresh, per target
   * partner), never from a JWT claim. `authenticate.js`'s issued access
   * token hardcodes `partnerId: null` today — and even if it didn't, a
   * single user can hold ACTIVE membership in more than one partner
   * simultaneously (`partner_employees` has no unique constraint on
   * `user_id` alone, only on the soft-delete-safe `(partner_id, user_id)`
   * pair — confirmed in migration 0003) — so a single-valued token claim
   * could never correctly represent "internal to THIS target partner"
   * for a multi-partner account. `getPartnerEmployeeRoleCode` already
   * scopes to `deleted_at IS NULL` (former/removed membership never
   * counts as internal) and returns `null` for a partner the user has no
   * active relationship with at all (OWNER included — every OWNER row is
   * itself a `partner_employees` row, per `partnerService.js`'s own
   * `isPartnerOwner` precedent).
   *
   * True when `principal` represents traffic that must never count —
   * ADMIN/SUPER_ADMIN outright, or an active OWNER/employee of the
   * resolved target partner (browsing another partner's content still
   * counts). CUSTOMER and anonymous (no principal) traffic always
   * counts. `membershipCache` is a `Map<string, boolean>` scoped to one
   * `ingestClientEvents` call — memoizes the (userId, partnerId) lookup
   * so a 25-event batch never issues 25 identical queries (A2.1 §11).
   *
   * Fails CLOSED (brief §12): if the membership lookup itself throws, the
   * event is treated as internal (filtered, not stored) rather than risk
   * counting possibly-internal traffic as genuine — logged, never thrown
   * into the caller.
   */
  async #isInternalTraffic(principal, targetPartnerId, membershipCache) {
    if (!principal) return false;
    if (principal.roles?.some((role) => INTERNAL_ROLE_CODES.has(role))) {
      return true;
    }
    if (targetPartnerId == null) return false;

    const cacheKey = `${principal.userId}:${targetPartnerId}`;
    if (membershipCache.has(cacheKey)) {
      return membershipCache.get(cacheKey);
    }

    let isMember;
    try {
      const roleCode = await this.#getPartnerEmployeeRoleCode(
        principal.userId,
        targetPartnerId,
      );
      isMember = roleCode !== null;
    } catch (err) {
      log.warn(
        { err, userId: principal.userId, partnerId: targetPartnerId },
        'Partner membership lookup failed during analytics self-traffic filtering — filtering the event conservatively',
      );
      isMember = true;
    }

    membershipCache.set(cacheKey, isMember);
    return isMember;
  }

  /**
   * Resolves one event's target server-side. Throws `NotFoundError` for
   * any failure — always caught and re-thrown as the single generic
   * `ValidationError` by the caller, never surfaced directly.
   */
  async #resolveTarget(event) {
    switch (event.eventName) {
      case ANALYTICS_EVENTS.LISTING_IMPRESSION:
      case ANALYTICS_EVENTS.LISTING_VIEWED:
      case ANALYTICS_EVENTS.CONTACT_CLICK:
      case ANALYTICS_EVENTS.SEARCH_RESULT_CLICK: {
        // `getListing(null, ...)` deliberately forces the strict public-
        // visibility path regardless of who is actually authenticated on
        // THIS ingestion request — never the requester's own owner-
        // fallback (see `listingService.js#getListing`'s own doc comment).
        const listing = await this.#listingService.getListing(
          null,
          event.listingId,
        );
        return { listingId: listing.id, partnerId: listing.partnerId };
      }
      case ANALYTICS_EVENTS.PROMOTION_IMPRESSION:
      case ANALYTICS_EVENTS.PROMOTION_CLICKED: {
        const listing = await this.#listingService.getListing(
          null,
          event.listingId,
        );
        const promotion =
          await this.#advertisementService.getPublicPromotionContext(
            event.promotionId,
            listing.id,
          );
        return {
          listingId: listing.id,
          partnerId: promotion.partnerId,
          promotionId: promotion.id,
        };
      }
      case ANALYTICS_EVENTS.COMPANY_PROFILE_VIEW: {
        const partner = await this.#partnerService.getPublicPartnerBySlug(
          event.companySlug,
        );
        return { partnerId: partner.id };
      }
      case ANALYTICS_EVENTS.COMPANY_LISTING_CLICK: {
        const [partner, listing] = await Promise.all([
          this.#partnerService.getPublicPartnerBySlug(event.companySlug),
          this.#listingService.getListing(null, event.listingId),
        ]);
        // The listing must genuinely belong to the claimed company —
        // never trusted from the client pairing alone.
        if (listing.partnerId !== partner.id) {
          throw new NotFoundError('Listing not found.');
        }
        return { listingId: listing.id, partnerId: partner.id };
      }
      case ANALYTICS_EVENTS.SEARCH_IMPRESSION:
        // No listing/company/promotion target to resolve — a search
        // results page impression is self-contained.
        return {};
      default:
        // Unreachable: the validator already restricts eventName to the
        // client-ingestible allowlist.
        throw new NotFoundError('Unsupported event.');
    }
  }

  /**
   * @param {object} params
   * @param {object|null} params.principal - the resolved requester, or
   *   null for a fully anonymous request (`authenticate.js`'s populate-
   *   only middleware already ran; this endpoint never requires auth).
   * @param {Array<object>} params.events - already Layer-2-validated by
   *   `ingestEventsSchema`.
   * @param {string|undefined} params.userAgent
   * @param {string|undefined} params.referer
   */
  async ingestClientEvents({ principal, events, userAgent, referer }) {
    if (!config.engagementAnalytics.collectionEnabled) return;

    const deviceClass = classifyDeviceClass(userAgent);
    const trafficSource = classifyTrafficSource(referer, config.webAppUrl);

    let resolvedTargets;
    try {
      resolvedTargets = await Promise.all(
        events.map((event) => this.#resolveTarget(event)),
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new ValidationError(GENERIC_TARGET_ERROR);
      }
      throw err;
    }

    // Scoped to this single request/batch only — never persisted, never
    // shared across requests (A2.1 §11's "no persistent cache complexity").
    const membershipCache = new Map();

    const rows = [];
    for (const [index, event] of events.entries()) {
      const target = resolvedTargets[index];
      // eslint-disable-next-line no-await-in-loop -- sequential so the shared membershipCache is actually reused across events in this batch, not raced.
      const isInternal = await this.#isInternalTraffic(
        principal,
        target.partnerId ?? null,
        membershipCache,
      );
      // Silent per-event filter — never leaked in the response which
      // event was internal, and never affects any other event in the
      // same batch (A0.1 §22).
      if (!isInternal) {
        const dedupContext = {
          sessionId: event.sessionId,
          listingId: target.listingId ?? null,
          promotionId: target.promotionId ?? null,
          partnerId: target.partnerId ?? null,
          placement: event.placement ?? null,
        };

        rows.push({
          eventId: event.eventId,
          dedupKey: computeDedupKey(event.eventName, dedupContext),
          eventName: event.eventName,
          anonymousVisitorId: event.anonymousVisitorId ?? null,
          sessionId: event.sessionId,
          userId: principal?.userId ?? null,
          listingId: target.listingId ?? null,
          partnerId: target.partnerId ?? null,
          promotionId: target.promotionId ?? null,
          bookingId: null,
          placement: event.placement ?? null,
          position: event.position ?? null,
          categoryCode: event.categoryCode ?? null,
          queryText: event.queryText ?? null,
          resultCount: event.resultCount ?? null,
          locale: event.locale ?? null,
          deviceClass,
          trafficSource,
          contactMethod: event.contactMethod ?? null,
        });
      }
    }

    if (rows.length === 0) return;
    await this.#engagementAnalyticsRepository.insertBatch(rows);
  }

  /**
   * Server-authoritative writer — called only by
   * `engagementAnalyticsListener`'s `DomainEventBus` subscription
   * handlers. Never throws into the caller in practice: any rejection
   * here is absorbed by `DomainEventBus#publish`'s own
   * `Promise.allSettled` + log-and-continue guarantee, the same
   * guarantee every other subscriber (e.g. `notificationListener.js`)
   * already relies on — this method itself adds no extra try/catch on
   * top of that shared contract.
   *
   * @param {object} params
   * @param {string} params.eventName - one of `SERVER_AUTHORITATIVE_EVENT_NAMES`.
   * @param {number|null} [params.userId]
   * @param {number|null} [params.listingId]
   * @param {number|null} [params.partnerId]
   * @param {number|null} [params.bookingId]
   */
  async recordServerEvent({
    eventName,
    userId = null,
    listingId = null,
    partnerId = null,
    bookingId = null,
  }) {
    if (!config.engagementAnalytics.collectionEnabled) return;
    if (!SERVER_AUTHORITATIVE_EVENT_NAMES.has(eventName)) {
      throw new TypeError(
        `recordServerEvent: "${eventName}" is not a server-authoritative event.`,
      );
    }

    // Server-generated event_id for a server-authoritative event (A0.1
    // §8) — the client never supplies/observes this event at all.
    await this.#engagementAnalyticsRepository.insertBatch([
      {
        eventId: randomUUID(),
        dedupKey: null,
        eventName,
        anonymousVisitorId: null,
        sessionId: null,
        userId,
        listingId,
        partnerId,
        promotionId: null,
        bookingId,
        placement: null,
        position: null,
        categoryCode: null,
        queryText: null,
        resultCount: null,
        locale: null,
        deviceClass: null,
        trafficSource: null,
        contactMethod: null,
      },
    ]);
  }
}

export default EngagementAnalyticsService;

/**
 * AdvertisementService — Sprint E (TOP/Featured Listings + Promotion
 * Engine). Public-facing "Promotion" business logic on top of the
 * `advertisements` schema Sprint 5 already laid down (migration 0010) —
 * see `advertisementStatusTransitions.js` for the state machine every
 * transition here validates against, and `docs/SPRINT_5_DATABASE_
 * FOUNDATION.md` §5.2 for its diagram.
 *
 * Only two placements are wired this sprint (spec §6/§38 — "Do not
 * broaden Sprint E"): `HOMEPAGE_SECTION` (the brief's "Home" placement)
 * and `CATEGORY_TOP` (the brief's "Category" placement). The other five
 * seeded `ad_placement_types` (`HOMEPAGE_HERO`, `CITY_TOP`,
 * `SEARCH_SPONSORED`, `LISTING_BADGE`, `BANNER`) stay dormant, exactly
 * the same "seed the vocabulary, activate only what's in scope" pattern
 * D-2 already used for the calendar's connector types.
 *
 * Every write that changes visible state is centralized here (never a
 * controller flipping a status column directly, spec §11) so a future
 * payment webhook can call the exact same `activate`/`extend`/`cancel`
 * methods a manual Admin action calls today.
 */

import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../errors/AppError.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import {
  isValidAdvertisementStatusTransition,
  isTerminalAdvertisementStatus,
} from '../../../core/domain/advertisementStatusTransitions.js';
import { getModuleLogger } from '../../../logging/logger.js';

const log = getModuleLogger('advertising');

/** The only two placements Sprint E activates — see file header. */
export const PLACEMENT_CODES = Object.freeze({
  HOME: 'HOMEPAGE_SECTION',
  CATEGORY: 'CATEGORY_TOP',
});

function addDaysToDateString(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** `[aStart, aEnd]` overlaps `[bStart, bEnd]` — inclusive both ends, matching `advertisements.start_date`/`end_date`'s own day-inclusive semantics. */
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export class AdvertisementService {
  #advertisementRepository;

  #listingService;

  #searchService;

  #auditLogger;

  #eventBus;

  constructor({
    advertisementRepository,
    listingService,
    searchService,
    auditLogger,
    eventBus,
  }) {
    this.#advertisementRepository = advertisementRepository;
    this.#listingService = listingService;
    this.#searchService = searchService;
    this.#auditLogger = auditLogger;
    this.#eventBus = eventBus;
  }

  #assertPrincipal(principal) {
    if (!principal) throw new AuthenticationError();
  }

  async #loadPlacementOrThrow(placementCode) {
    if (!Object.values(PLACEMENT_CODES).includes(placementCode)) {
      throw new ValidationError('Unsupported promotion placement.', [
        { field: 'placementCode', issue: 'UNSUPPORTED_PLACEMENT' },
      ]);
    }
    const placement =
      await this.#advertisementRepository.findPlacementTypeByCode(
        placementCode,
      );
    if (!placement) {
      throw new ValidationError('Unknown promotion placement.', [
        { field: 'placementCode', issue: 'UNKNOWN_PLACEMENT' },
      ]);
    }
    return placement;
  }

  /** Admin form data: the two in-scope placements, each with its seeded product catalog (spec §10 — reuse existing pricing, never a fabricated checkout). */
  async getPlacementCatalog(principal) {
    this.#assertPrincipal(principal);
    const placements = await Promise.all(
      Object.values(PLACEMENT_CODES).map(async (code) => {
        const placement = await this.#loadPlacementOrThrow(code);
        const products =
          await this.#advertisementRepository.listProductsByPlacement(
            placement.id,
          );
        return {
          code,
          maxConcurrentSlots: placement.maxConcurrentSlots,
          products,
        };
      }),
    );
    return placements;
  }

  async #assertNoOverlap({
    listingId,
    placementTypeId,
    startDate,
    endDate,
    excludeId,
  }) {
    const open =
      await this.#advertisementRepository.listOpenForListingAndPlacement(
        listingId,
        placementTypeId,
      );
    const conflict = open.find(
      (ad) =>
        ad.id !== excludeId &&
        rangesOverlap(startDate, endDate, ad.startDate, ad.endDate),
    );
    if (conflict) {
      throw new ConflictError(
        'This listing already has an overlapping promotion request/period for this placement.',
        'PROMOTION_PERIOD_OVERLAP',
      );
    }
  }

  /**
   * Admin creates a promotion end-to-end (spec §12 — Admin chooses
   * placement/dates/manual payment state in one action; Sprint E has no
   * partner self-service request step). Walks the SAME state machine a
   * future payment-driven request would walk, one transition per step
   * inside one transaction, so every step is genuinely audit-logged —
   * never a row inserted directly at a terminal status.
   */
  async createPromotion(principal, input) {
    this.#assertPrincipal(principal);
    const {
      listingId,
      placementCode,
      categoryId,
      productId,
      customPriceAmount,
      customCurrencyCode,
      startDate,
      endDate: customEndDate,
      displayPriority = 0,
      markPaidNow = false,
      note,
    } = input;

    const listing = await this.#listingService.getListingAdminDetail(
      principal,
      listingId,
    );
    const placement = await this.#loadPlacementOrThrow(placementCode);

    if (placementCode === PLACEMENT_CODES.CATEGORY) {
      if (!categoryId) {
        throw new ValidationError('categoryId is required for Category Top.', [
          { field: 'categoryId', issue: 'REQUIRED' },
        ]);
      }
      if (!listing.categoryIds?.includes(categoryId)) {
        throw new ValidationError(
          'This listing does not belong to the given category.',
          [{ field: 'categoryId', issue: 'LISTING_NOT_IN_CATEGORY' }],
        );
      }
    }

    // Every promotion snapshots a real `ad_products` catalog row (spec
    // §10 — reuse existing pricing, never a fabricated parallel
    // checkout); `productId` is always required, never a bare custom
    // price with no catalog reference (`ad_products.id` is a NOT NULL FK
    // on `advertisements` — this mirrors that constraint deliberately,
    // not incidentally). Each placement's seeded "Custom Period" product
    // (`duration_days IS NULL`) is how Admin picks a genuinely
    // non-standard length — `endDate` becomes required only then;
    // `customPriceAmount`/`customCurrencyCode` optionally override that
    // product's own snapshotted rate on ANY product (a negotiated price),
    // never required.
    const product =
      await this.#advertisementRepository.findProductById(productId);
    if (
      !product ||
      product.placementTypeId !== placement.id ||
      !product.isActive
    ) {
      throw new ValidationError('Unknown or inactive promotion product.', [
        { field: 'productId', issue: 'INVALID_PRODUCT' },
      ]);
    }

    let { priceAmount } = product;
    let { currencyId } = product;
    if (customPriceAmount !== undefined || customCurrencyCode) {
      if (customPriceAmount === undefined || !customCurrencyCode) {
        throw new ValidationError(
          'A custom price override needs both customPriceAmount and customCurrencyCode.',
          [{ field: 'customPriceAmount', issue: 'REQUIRES_BOTH' }],
        );
      }
      const currency = await findCurrencyByCode(customCurrencyCode);
      if (!currency) {
        throw new ValidationError('Unknown currency code.', [
          { field: 'customCurrencyCode', issue: 'UNKNOWN_CURRENCY' },
        ]);
      }
      priceAmount = customPriceAmount;
      currencyId = currency.id;
    }

    const endDate =
      product.durationDays != null
        ? addDaysToDateString(startDate, product.durationDays - 1)
        : customEndDate;
    if (!endDate) {
      throw new ValidationError(
        'endDate is required when using a Custom Period product.',
        [{ field: 'endDate', issue: 'REQUIRED' }],
      );
    }
    if (endDate < startDate) {
      throw new ValidationError('endDate must not be before startDate.', [
        { field: 'endDate', issue: 'BEFORE_START' },
      ]);
    }

    await this.#assertNoOverlap({
      listingId,
      placementTypeId: placement.id,
      startDate,
      endDate,
    });

    const result = await withTransaction(async (connection) => {
      const requestSubmittedId =
        await this.#advertisementRepository.findStatusIdByCode(
          'REQUEST_SUBMITTED',
        );
      let ad = await this.#advertisementRepository.create(
        {
          listingId,
          partnerId: listing.partnerId,
          placementTypeId: placement.id,
          productId,
          statusId: requestSubmittedId,
          priceSnapshotAmount: priceAmount,
          currencyId,
          startDate,
          endDate,
          displayPriority,
          requestedBy: principal.userId,
          createdBy: principal.userId,
        },
        connection,
      );
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'advertisement.created',
          targetType: 'advertisement',
          targetId: ad.id,
          afterSnapshot: { listingId, placementCode, startDate, endDate, note },
        },
        connection,
      );

      ad = await this.#advanceStatus(ad, 'AWAITING_OFFLINE_PAYMENT', {
        principal,
        connection,
      });
      if (markPaidNow) {
        ad = await this.#advanceStatus(ad, 'PAID_MANUAL', {
          principal,
          connection,
          paymentMarkedPaidBy: principal.userId,
        });
        ad = await this.#advanceStatus(ad, 'APPROVED', {
          principal,
          connection,
          approvedBy: principal.userId,
        });
        const targetStatus =
          ad.startDate <= todayDateString() ? 'ACTIVE' : 'SCHEDULED';
        ad = await this.#advanceStatus(ad, targetStatus, {
          principal,
          connection,
        });
      }
      return ad;
    });

    if (result.statusCode === 'ACTIVE') {
      await this.#publish(EVENT_TYPES.ADVERTISEMENT_ACTIVATED, result);
    }
    return result;
  }

  async #advanceStatus(
    ad,
    toStatusCode,
    { principal, connection, approvedBy, paymentMarkedPaidBy },
  ) {
    if (!isValidAdvertisementStatusTransition(ad.statusCode, toStatusCode)) {
      throw new ConflictError(
        `Cannot move a promotion from ${ad.statusCode} to ${toStatusCode}.`,
        'INVALID_PROMOTION_TRANSITION',
      );
    }
    const toStatusId =
      await this.#advertisementRepository.findStatusIdByCode(toStatusCode);
    const updated = await this.#advertisementRepository.updateStatus(
      ad.id,
      {
        statusId: toStatusId,
        approvedBy,
        paymentMarkedPaidBy,
        updatedBy: principal.userId,
      },
      connection,
    );
    await this.#auditLogger.record(
      {
        actorId: principal.userId,
        action: 'advertisement.status_changed',
        targetType: 'advertisement',
        targetId: ad.id,
        beforeSnapshot: { status: ad.statusCode },
        afterSnapshot: { status: toStatusCode },
      },
      connection,
    );
    return updated;
  }

  async #getOwnedOrThrow(id) {
    const ad = await this.#advertisementRepository.findById(id);
    if (!ad) throw new NotFoundError('Promotion not found.');
    return ad;
  }

  /** `promotion.mark_paid` — AWAITING_OFFLINE_PAYMENT -> PAID_MANUAL (spec §10). */
  async markPaid(principal, id) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    const updated = await withTransaction((connection) =>
      this.#advanceStatus(ad, 'PAID_MANUAL', {
        principal,
        connection,
        paymentMarkedPaidBy: principal.userId,
      }),
    );
    return updated;
  }

  /** `promotion.approve` — PAID_MANUAL -> APPROVED -> (SCHEDULED|ACTIVE), server-decided by today vs. start_date. */
  async approve(principal, id) {
    this.#assertPrincipal(principal);
    let ad = await this.#getOwnedOrThrow(id);
    ad = await withTransaction(async (connection) => {
      let next = await this.#advanceStatus(ad, 'APPROVED', {
        principal,
        connection,
        approvedBy: principal.userId,
      });
      const targetStatus =
        next.startDate <= todayDateString() ? 'ACTIVE' : 'SCHEDULED';
      next = await this.#advanceStatus(next, targetStatus, {
        principal,
        connection,
      });
      return next;
    });
    if (ad.statusCode === 'ACTIVE') {
      await this.#publish(EVENT_TYPES.ADVERTISEMENT_ACTIVATED, ad);
    }
    return ad;
  }

  async reject(principal, id) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    const updated = await withTransaction((connection) =>
      this.#advanceStatus(ad, 'REJECTED', { principal, connection }),
    );
    await this.#publish(EVENT_TYPES.ADVERTISEMENT_REJECTED, updated);
    return updated;
  }

  /**
   * Ends/cancels a still-open promotion (spec §12) — CANCELLED is a
   * direct, legal next step from every non-terminal status EXCEPT
   * REQUEST_SUBMITTED (see `advertisementStatusTransitions.js`'s Sprint E
   * amendment), which is rejected instead, matching that status's own
   * REJECTED exit.
   */
  async cancel(principal, id) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    if (isTerminalAdvertisementStatus(ad.statusCode)) {
      throw new ConflictError(
        'This promotion has already ended and cannot be cancelled.',
        'PROMOTION_ALREADY_TERMINAL',
      );
    }
    const targetStatus =
      ad.statusCode === 'REQUEST_SUBMITTED' ? 'REJECTED' : 'CANCELLED';
    const updated = await withTransaction((connection) =>
      this.#advanceStatus(ad, targetStatus, { principal, connection }),
    );
    await this.#publish(
      targetStatus === 'REJECTED'
        ? EVENT_TYPES.ADVERTISEMENT_REJECTED
        : EVENT_TYPES.ADVERTISEMENT_CANCELLED,
      updated,
    );
    return updated;
  }

  /**
   * Pass 7B (brief §13/§14) — reversibly hides a still-visible-or-about-
   * to-be-visible promotion without ending it. Only legal from SCHEDULED/
   * ACTIVE (see `advertisementStatusTransitions.js`'s header) — a request
   * still awaiting payment/approval was never public in the first place,
   * so CANCEL (not pause) is the correct action there.
   */
  async pause(principal, id) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    const updated = await withTransaction((connection) =>
      this.#advanceStatus(ad, 'PAUSED', { principal, connection }),
    );
    return updated;
  }

  /** Resumes a paused promotion — server-decided target (ACTIVE|SCHEDULED) by today vs. start_date, the SAME rule `approve()` already uses. */
  async resume(principal, id) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    const targetStatus =
      ad.startDate <= todayDateString() ? 'ACTIVE' : 'SCHEDULED';
    const updated = await withTransaction((connection) =>
      this.#advanceStatus(ad, targetStatus, { principal, connection }),
    );
    if (updated.statusCode === 'ACTIVE') {
      await this.#publish(EVENT_TYPES.ADVERTISEMENT_ACTIVATED, updated);
    }
    return updated;
  }

  /** Extends the SAME row's end_date — never a duplicate row (spec §13/§27). Only meaningful for a still-open promotion. */
  async extend(principal, id, { endDate }) {
    this.#assertPrincipal(principal);
    const ad = await this.#getOwnedOrThrow(id);
    if (isTerminalAdvertisementStatus(ad.statusCode)) {
      throw new ConflictError(
        'This promotion has already ended and cannot be extended.',
        'PROMOTION_ALREADY_TERMINAL',
      );
    }
    if (endDate <= ad.endDate) {
      throw new ValidationError(
        'The new end date must be after the current end date.',
        [{ field: 'endDate', issue: 'NOT_AN_EXTENSION' }],
      );
    }
    await this.#assertNoOverlap({
      listingId: ad.listingId,
      placementTypeId: ad.placementTypeId,
      startDate: ad.startDate,
      endDate,
      excludeId: ad.id,
    });
    const updated = await this.#advertisementRepository.extend(id, {
      endDate,
      updatedBy: principal.userId,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'advertisement.extended',
      targetType: 'advertisement',
      targetId: id,
      beforeSnapshot: { endDate: ad.endDate },
      afterSnapshot: { endDate },
    });
    return updated;
  }

  async listForAdmin(principal, filters, paginationOpts) {
    this.#assertPrincipal(principal);
    return this.#advertisementRepository.listForAdmin(filters, paginationOpts);
  }

  async getById(principal, id) {
    this.#assertPrincipal(principal);
    return this.#getOwnedOrThrow(id);
  }

  async #publish(eventType, ad) {
    await this.#eventBus.publish(
      createDomainEvent({
        eventType,
        resourceType: 'advertisement',
        resourceId: ad.id,
        payload: {
          partnerId: ad.partnerId,
          listingId: ad.listingId,
          placementCode: ad.placementCode,
          endDate: ad.endDate,
        },
      }),
    );
  }

  /** Hydrates active promoted listing ids into the SAME card shape `SearchResultCard` already renders — reuses `SearchService`'s public interface, never a second Repository over `listings` (BACKEND_ARCHITECTURE.md §4). Re-sorted to the promotion-priority order the id list arrived in — an `IN (...)` query gives no ordering guarantee of its own. */
  async #hydrate(listingIds, locale) {
    if (listingIds.length === 0) return [];
    const listings = await this.#searchService.getListingsByIds(listingIds, {
      locale,
    });
    const byId = new Map(listings.map((listing) => [listing.id, listing]));
    return listingIds.map((id) => byId.get(id)).filter(Boolean);
  }

  /** Public: `GET /advertising/public/home-featured`. */
  async getPublicHomeFeatured(locale) {
    const placement = await this.#loadPlacementOrThrow(PLACEMENT_CODES.HOME);
    const ids =
      await this.#advertisementRepository.listActiveListingIdsByPlacement({
        placementCode: PLACEMENT_CODES.HOME,
        limit: placement.maxConcurrentSlots,
      });
    return this.#hydrate(ids, locale);
  }

  /** Public: `GET /advertising/public/category-top?categoryId=`. */
  async getPublicCategoryTop(categoryId, locale) {
    const placement = await this.#loadPlacementOrThrow(
      PLACEMENT_CODES.CATEGORY,
    );
    const ids =
      await this.#advertisementRepository.listActiveListingIdsByPlacement({
        placementCode: PLACEMENT_CODES.CATEGORY,
        categoryId,
        limit: placement.maxConcurrentSlots,
      });
    return this.#hydrate(ids, locale);
  }

  /**
   * Lifecycle sweep (spec §14/§15) — convenience status sync plus
   * threshold-gated reminders. Never the sole authority on public
   * visibility (the public queries above already re-derive that from
   * dates directly) — this only keeps the STORED status/Admin-visible
   * state, and outbound reminders, reasonably fresh between runs.
   */
  async runLifecycleSweep() {
    const [dueForActivation, dueForExpiry, due7d, due2d] = await Promise.all([
      this.#advertisementRepository.listDueForActivation(),
      this.#advertisementRepository.listDueForExpiry(),
      this.#advertisementRepository.listDueForReminder(7),
      this.#advertisementRepository.listDueForReminder(2),
    ]);

    // `listDueForActivation`/`listDueForExpiry` already scope to rows
    // whose STORED status genuinely needs to move (APPROVED/SCHEDULED ->
    // ACTIVE, or ACTIVE -> EXPIRED) — every row here is independent, so
    // these run in parallel rather than the sequential-for-loop shape the
    // other sweep jobs use for a single mutating resource; there is no
    // shared lock/ordering constraint across different advertisement rows.
    const [activeId, expiredId] = await Promise.all([
      this.#advertisementRepository.findStatusIdByCode('ACTIVE'),
      this.#advertisementRepository.findStatusIdByCode('EXPIRED'),
    ]);
    await Promise.all(
      dueForActivation.map(async (ad) => {
        await this.#advertisementRepository.updateStatus(ad.id, {
          statusId: activeId,
          updatedBy: null,
        });
        await this.#publish(EVENT_TYPES.ADVERTISEMENT_ACTIVATED, ad);
      }),
    );
    await Promise.all(
      dueForExpiry.map(async (ad) => {
        await this.#advertisementRepository.updateStatus(ad.id, {
          statusId: expiredId,
          updatedBy: null,
        });
        await this.#publish(EVENT_TYPES.ADVERTISEMENT_EXPIRED, ad);
      }),
    );

    const remind = async (ad, thresholdDays) => {
      await this.#advertisementRepository.markReminderSent(
        ad.id,
        thresholdDays,
      );
      await this.#eventBus.publish(
        createDomainEvent({
          eventType: EVENT_TYPES.ADVERTISEMENT_EXPIRING_SOON,
          resourceType: 'advertisement',
          resourceId: ad.id,
          payload: {
            partnerId: ad.partnerId,
            listingId: ad.listingId,
            placementCode: ad.placementCode,
            endDate: ad.endDate,
            thresholdDays,
          },
        }),
      );
    };
    await Promise.all([
      ...due7d.map((ad) => remind(ad, 7)),
      ...due2d.map((ad) => remind(ad, 2)),
    ]);

    const activated = dueForActivation.length;
    const expired = dueForExpiry.length;
    if (activated > 0 || expired > 0) {
      log.info(
        {
          activated,
          expired,
          reminders7d: due7d.length,
          reminders2d: due2d.length,
        },
        'Advertisement lifecycle sweep completed',
      );
    }
    return {
      activated,
      expired,
      reminders7d: due7d.length,
      reminders2d: due2d.length,
    };
  }
}

export default AdvertisementService;

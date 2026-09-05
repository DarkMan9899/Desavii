/**
 * AvailabilityService — public Service for the Availability & Calendar
 * Foundation module (Sprint 9, redesigned twice: first to build on
 * `bookable_units`/`availability_calendar` instead of `blackout_dates`,
 * then to make unit *existence* an explicit, inventory-agnostic decision
 * instead of an automatic side effect of writing a calendar entry).
 *
 * The `AvailabilityCheckService` slice of `BACKEND_ARCHITECTURE.md`'s
 * Module Catalog entry #15: owns `availability_calendar` read/write
 * directly, composes `BookableUnitService` (unit CRUD) and
 * `BlackoutService` (the complementary veto layer) rather than owning
 * their tables itself. Depends on `ListingService`'s public interface for
 * listing existence and visibility, exactly like Auth depends on
 * `UserService` — never a second Listings repository.
 *
 * **Availability is inventory-agnostic**: it never decides that a listing
 * *should* have a bookable unit, of what type, or how many. `registerUnit`/
 * `retireUnit` expose that capability, but only ever act in response to an
 * explicit caller request — today, a host calling this module's own API;
 * later, a per-type inventory module (Hotels, Tours, ...) calling the same
 * methods once it creates real inventory rows. `setAvailability` (the
 * calendar write path) *consumes* an existing `unitId` — it never creates
 * one, so a request against a unit that doesn't exist fails plainly rather
 * than silently provisioning one. Which listing types get one unit,
 * several, or none is a business rule that intentionally lives nowhere in
 * this file.
 *
 * The public `/availability` write path may only ever persist
 * `AVAILABLE`/`BLOCKED` calendar rows — `BOOKED`/`HELD` are reserved for
 * the Booking Engine and are rejected outright (`UNWRITABLE_STATUS`).
 * This is unchanged by Sprint 10: `reserveCapacity`/`releaseHold`/
 * `consumeHold` (below) never write `status_id` at all — capacity for a
 * held or booked date is tracked entirely through `quantity_available`,
 * so the write-guard this file already enforced needed no relaxation.
 * No `availability.*` permission key exists yet (`seeds/
 * 004_roles_and_permissions.js`), so every mutation and management list
 * are gated on `listing.update` (owner fallback) or `listing.moderate`
 * (admin-wide), mirroring `ListingService`'s own reuse of
 * `listing.update` for media management.
 *
 * **Sprint 10 addition**: `reserveCapacity`/`releaseHold`/`consumeHold`
 * are new, additive capabilities over `reservation_holds` (owned here,
 * same as the other three tables) and `availability_calendar.
 * quantity_available` — called only by the `booking-holds`/`bookings`
 * modules as a Service-to-Service dependency, never exposed as new HTTP
 * routes on `/availability`. Availability still never decides, on its
 * own initiative, that a unit should be held or booked — it only ever
 * acts on an explicit caller request, the same inventory-agnostic rule
 * `registerUnit` already established.
 */

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import {
  isPartnerOwner,
  getPartnerEmployeeRoleCode,
} from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import {
  enumerateDates,
  expandCalendarDays,
  isVetoedByBlackout,
} from '../../../core/domain/calendarExpansion.js';
import {
  roleHasCapability,
  PARTNER_CAPABILITIES,
} from '../../../core/domain/partnerCapabilities.js';
import { resolveConsumedRange } from '../../../core/domain/accommodationDateSemantics.js';
import { resolvePriceForDate } from '../../../core/domain/accommodationPriceResolution.js';
import {
  isVehicleUnitType,
  validateRentalInterval,
} from '../../../core/domain/rentalIntervalValidation.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { resolveLocaleIds } from '../../../infrastructure/database/repositories/languageRepository.js';
import {
  isAllowedMimeType,
  isWithinSizeLimit,
  classifyMimeType,
} from '../../media/validators/mediaConstraints.js';

const MANAGE_PERMISSION = 'listing.update';
const ADMIN_PERMISSION = 'listing.moderate';
const WRITABLE_STATUSES = Object.freeze(['AVAILABLE', 'BLOCKED']);
const PUBLIC_RANGES_LIMIT = 100;
const EXPIRY_SWEEP_BATCH_SIZE = 200;

// Phase 17 §29 — the fixed vocabulary `inventory_ledger.source_type` uses.
export const LEDGER_SOURCE_TYPES = Object.freeze({
  TRAVELHUB_HOLD: 'TRAVELHUB_HOLD',
  TRAVELHUB_BOOKING: 'TRAVELHUB_BOOKING',
  MANUAL_BLOCK: 'MANUAL_BLOCK',
  EXTERNAL_RESERVATION: 'EXTERNAL_RESERVATION',
  CONNECTOR_SYNC: 'CONNECTOR_SYNC',
  ADJUSTMENT: 'ADJUSTMENT',
});

// Phase 17 §11 — closed vocabulary `inventory_blocks.reason_code` uses.
export const BLOCK_REASON_CODES = Object.freeze([
  'MAINTENANCE',
  'OWNER_USE',
  'OPERATIONAL',
  'PRIVATE_EVENT',
  'STAFF_UNAVAILABLE',
  'VEHICLE_UNAVAILABLE',
  'WEATHER',
  'OTHER',
]);

// Phase 17 §10 — closed vocabulary `external_reservations.source_code` uses.
export const EXTERNAL_RESERVATION_SOURCE_CODES = Object.freeze([
  'PHONE',
  'WALK_IN',
  'PARTNER_WEBSITE',
  'BOOKING_COM',
  'EXPEDIA',
  'AIRBNB',
  'TRAVEL_AGENCY',
  'CONNECTOR',
  'OTHER',
]);

function assertWritableStatus(status) {
  if (!WRITABLE_STATUSES.includes(status)) {
    throw new ValidationError(
      'Only AVAILABLE or BLOCKED may be set through this endpoint — BOOKED/HELD are reserved for the Booking Engine.',
      [{ field: 'status', issue: 'UNWRITABLE_STATUS' }],
    );
  }
}

/** Groups hold rows sharing one (unit, date range) so their capacity is restored in one update per date, not one per row. */
function groupHoldsByRange(holds) {
  const groups = new Map();
  holds.forEach((hold) => {
    const key = `${hold.bookableUnitId}:${hold.dateFrom}:${hold.dateTo}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        bookableUnitId: hold.bookableUnitId,
        dateFrom: hold.dateFrom,
        dateTo: hold.dateTo,
        count: 1,
      });
    }
  });
  return [...groups.values()];
}

export class AvailabilityService {
  #availabilityCalendarRepository;

  #reservationHoldRepository;

  #bookableUnitService;

  #blackoutService;

  #listingService;

  #permissionResolver;

  #auditLogger;

  #inventoryLedgerRepository;

  #inventoryBlockRepository;

  #externalReservationRepository;

  #eventBus;

  #storageProvider;

  constructor({
    availabilityCalendarRepository,
    reservationHoldRepository,
    bookableUnitService,
    blackoutService,
    listingService,
    permissionResolver,
    auditLogger,
    inventoryLedgerRepository,
    inventoryBlockRepository,
    externalReservationRepository,
    eventBus = createNoOpEventBus(),
    storageProvider,
  }) {
    this.#availabilityCalendarRepository = availabilityCalendarRepository;
    this.#reservationHoldRepository = reservationHoldRepository;
    this.#bookableUnitService = bookableUnitService;
    this.#blackoutService = blackoutService;
    this.#listingService = listingService;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#inventoryLedgerRepository = inventoryLedgerRepository;
    this.#inventoryBlockRepository = inventoryBlockRepository;
    this.#externalReservationRepository = externalReservationRepository;
    this.#eventBus = eventBus;
    this.#storageProvider = storageProvider;
  }

  async #isOwnerOrHasPermission(principal, partnerId, permissionKey) {
    if (!principal) return false;
    const isOwner = await isPartnerOwner(principal.userId, partnerId);
    if (isOwner) return true;
    return this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
  }

  async #assertOwnerOrPermission(principal, partnerId, permissionKey) {
    if (!principal) throw new AuthenticationError();
    const allowed = await this.#isOwnerOrHasPermission(
      principal,
      partnerId,
      permissionKey,
    );
    if (!allowed) throw new AuthorizationError();
  }

  /** Loads the listing (`getListing`'s 404-masking applies) then asserts owner-or-`listing.update`. */
  async #loadListingForManagement(principal, listingId) {
    const listing = await this.#listingService.getListing(principal, listingId);
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      MANAGE_PERMISSION,
    );
    return listing;
  }

  /**
   * Phase 17 §14 capability gate: OWNER always passes; any other partner
   * employee passes only if their `partner_employee_roles` code grants
   * `capability` (`core/domain/partnerCapabilities.js`); a global-RBAC
   * `adminPermission` (e.g. `inventory.view_all`) is an Admin/Support
   * bypass, same "owner-or-global-permission" shape every other guard in
   * this file already uses — never rely on hiding a nav item alone.
   */
  async #assertPartnerCapability(
    principal,
    partnerId,
    capability,
    adminPermission,
  ) {
    if (!principal) throw new AuthenticationError();
    if (await isPartnerOwner(principal.userId, partnerId)) return;
    const roleCode = await getPartnerEmployeeRoleCode(
      principal.userId,
      partnerId,
    );
    if (roleHasCapability(roleCode, capability)) return;
    if (
      adminPermission &&
      (await this.#permissionResolver.hasPermission(
        principal.roles,
        adminPermission,
      ))
    ) {
      return;
    }
    throw new AuthorizationError();
  }

  /** Loads the unit's listing and asserts `capability` (Phase 17 methods use this instead of `#loadListingForManagement`'s owner/global-permission-only check). */
  async #loadUnitForCapability(principal, unitId, capability, adminPermission) {
    const unit = await this.#bookableUnitService.findById(unitId);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    const listing = await this.#listingService.getListing(
      principal,
      unit.listingId,
    );
    await this.#assertPartnerCapability(
      principal,
      listing.partnerId,
      capability,
      adminPermission,
    );
    return { unit, listing };
  }

  /** Records one `inventory_ledger` row for a single (unit, date) capacity change. Never throws on its own logging failure path — callers already run inside a transaction that would roll the write back anyway. */
  async #writeLedger(
    {
      bookableUnitId,
      date,
      sourceType,
      sourceId,
      delta,
      quantityBefore,
      quantityAfter,
      actorUserId,
      reason,
    },
    connection,
  ) {
    if (!this.#inventoryLedgerRepository) return;
    await this.#inventoryLedgerRepository.record(
      {
        bookableUnitId,
        date,
        sourceType,
        sourceId,
        delta,
        quantityBefore,
        quantityAfter,
        actorUserId,
        reason,
      },
      connection,
    );
  }

  async #assertListVisibility(principal, { listingId, partnerId }) {
    if (listingId !== undefined) {
      const listing = await this.#listingService.getListing(
        principal,
        listingId,
      );
      await this.#assertOwnerOrPermission(
        principal,
        listing.partnerId,
        MANAGE_PERMISSION,
      );
      return;
    }
    if (partnerId !== undefined) {
      await this.#assertOwnerOrPermission(
        principal,
        partnerId,
        ADMIN_PERMISSION,
      );
      return;
    }
    if (!principal) throw new AuthenticationError();
    const isAdmin = await this.#permissionResolver.hasPermission(
      principal.roles,
      ADMIN_PERMISSION,
    );
    if (!isAdmin) throw new AuthorizationError();
  }

  // --- bookable_units (inventory-agnostic capability: Availability owns the
  // table, but never decides on its own that a unit should exist — it is
  // only ever created in response to an explicit call, made today by the
  // host through this API, and in the future by a per-type inventory
  // module such as Hotels/Tours calling the exact same capability) ---

  async registerUnit(principal, input) {
    if (!principal) throw new AuthenticationError();
    const listing = await this.#loadListingForManagement(
      principal,
      input.listingId,
    );
    const basePriceCurrencyId = await this.#resolveCurrencyId(
      input.basePriceCurrency,
    );
    const unit = await this.#bookableUnitService.registerUnit({
      listingId: listing.id,
      bookableUnitTypeCode: input.bookableUnitType,
      capacity: input.capacity,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      unitLabel: input.unitLabel,
      maxGuests: input.maxGuests,
      bedConfiguration: input.bedConfiguration,
      basePriceAmount: input.basePriceAmount,
      basePriceCurrencyId,
      roomSizeSqm: input.roomSizeSqm,
      bathroomType: input.bathroomType,
      viewType: input.viewType,
      smokingPolicy: input.smokingPolicy,
      createdBy: principal.userId,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.registered',
      targetType: 'bookable_unit',
      targetId: unit.id,
      afterSnapshot: { listingId: listing.id, capacity: input.capacity },
    });
    return this.#enrichUnit(unit);
  }

  /**
   * P2.2A: partner-facing edit of an already-registered unit's label,
   * capacity, occupancy/bed structure, or base price — the same
   * owner-or-permission authorization `retireUnit` already uses (never
   * this Service inventing a second ownership check).
   */
  async updateUnit(principal, id, fields) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    const basePriceCurrencyId = await this.#resolveCurrencyId(
      fields.basePriceCurrency,
    );

    const updated = await this.#bookableUnitService.updateUnit(id, {
      unitLabel: fields.unitLabel,
      capacity: fields.capacity,
      maxGuests: fields.maxGuests,
      bedConfiguration: fields.bedConfiguration,
      basePriceAmount: fields.basePriceAmount,
      basePriceCurrencyId,
      roomSizeSqm: fields.roomSizeSqm,
      bathroomType: fields.bathroomType,
      viewType: fields.viewType,
      smokingPolicy: fields.smokingPolicy,
      updatedBy: principal.userId,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.updated',
      targetType: 'bookable_unit',
      targetId: id,
      afterSnapshot: fields,
    });
    return this.#enrichUnit(updated);
  }

  async retireUnit(principal, id) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);
    await this.#bookableUnitService.retireUnit(id, principal.userId);
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.retired',
      targetType: 'bookable_unit',
      targetId: id,
    });
  }

  /**
   * Internal, unauthorized read of a unit's own attributes (listingId,
   * bookableUnitTypeCode, capacity) — Sprint 10's `BookingService` uses
   * this to resolve which listing/partner/unit-type a hold's unit belongs
   * to, then performs its own ownership/visibility checks via
   * `ListingService`. Not exposed as an HTTP route; a cross-module Service
   * call only, same as `BookableUnitService` itself has no ownership
   * check (its caller is responsible for authorizing first).
   */
  async getUnitById(id) {
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    return unit;
  }

  async listUnits(principal, listingId) {
    await this.#loadListingForManagement(principal, listingId);
    const units =
      await this.#bookableUnitService.listUnitsForListing(listingId);
    return Promise.all(units.map((unit) => this.#enrichUnit(unit)));
  }

  /**
   * Sprint C-1: attaches the three new owner-facing room sub-resources
   * (multi-locale description, selected amenity ids, photo gallery) onto
   * an already-resolved unit — a small N extra reads (N = one hotel's
   * room-type count, never large) rather than a join fan-out, matching
   * this file's existing "compose smaller reads" style over `#writeLedger`
   * and the Phase 17 breakdown methods below.
   */
  async #enrichUnit(unit) {
    const [translations, amenityIds, media] = await Promise.all([
      this.#bookableUnitService.listTranslations(unit.id),
      this.#bookableUnitService.listAmenityIds(unit.id),
      this.#bookableUnitService.listMedia(unit.id),
    ]);
    return { ...unit, translations, amenityIds, media };
  }

  /**
   * Internal, unauthorized existence check — same precedent as
   * `getUnitById` above. Phase 5's `ListingService.publishListing` calls
   * this (via a late-bound checker set in `routes/v1.js`, never a direct
   * import) to require at least one bookable unit before publish;
   * `ListingService` cannot depend on this module directly since
   * `AvailabilityService` already depends on `ListingService`
   * (BACKEND_ARCHITECTURE.md §4 forbids the reverse import).
   */
  async hasBookableUnit(listingId) {
    const units =
      await this.#bookableUnitService.listUnitsForListing(listingId);
    return units.length > 0;
  }

  // --- Sprint C-1: room description, amenities, media — same
  // owner-or-`listing.update` ownership check every other unit mutation
  // above already uses, resolved via the unit's own listing. ---

  async setUnitDescription(principal, id, { languageCode, description }) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    const { localeId } = await resolveLocaleIds(languageCode);
    const translations = await this.#bookableUnitService.setDescription(
      id,
      localeId,
      description,
    );
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.description_updated',
      targetType: 'bookable_unit',
      targetId: id,
    });
    return this.#enrichUnit({ ...unit, translations });
  }

  async replaceUnitAmenities(principal, id, amenityIds) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    const resolvedAmenityIds = await this.#bookableUnitService.replaceAmenities(
      id,
      amenityIds,
    );
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.amenities_replaced',
      targetType: 'bookable_unit',
      targetId: id,
      afterSnapshot: { amenityIds: resolvedAmenityIds },
    });
    return this.#enrichUnit({ ...unit, amenityIds: resolvedAmenityIds });
  }

  async listUnitMedia(principal, id) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);
    return this.#bookableUnitService.listMedia(id);
  }

  /**
   * Room photo upload — mirrors `ListingService.attachMedia` exactly
   * (same MIME/size validation, same StorageProvider abstraction, same
   * "first photo becomes the cover" rule), scoped to
   * `mediable_type = 'bookable_unit'` instead of `'listing'`. Never trusts
   * a client-supplied unit id without resolving its listing and checking
   * ownership first — the same rule every other unit mutation here
   * already follows, load-bearing here specifically because a media
   * attach/remove is exactly the "attach to a resource I don't own" attack
   * this sprint's own security requirement calls out.
   */
  async attachUnitMedia(principal, id, buffer, mimeType) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    if (!isAllowedMimeType(mimeType)) {
      throw new ValidationError('Unsupported media type.');
    }
    if (!isWithinSizeLimit(mimeType, buffer.length)) {
      throw new ValidationError('Media file exceeds the maximum allowed size.');
    }

    const category = classifyMimeType(mimeType);
    const extension = mimeType.split('/')[1];
    const key = `bookable-units/${id}/${Date.now()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, buffer, {
      contentType: mimeType,
    });

    const existingMedia = await this.#bookableUnitService.listMedia(id);
    const media = await this.#bookableUnitService.attachMedia({
      bookableUnitId: id,
      mediaTypeCode: category.toUpperCase(),
      url,
      mimeType,
      fileSizeBytes: buffer.length,
      ownerUserId: principal.userId,
      position: existingMedia.length,
      isCover: existingMedia.length === 0,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.media_attached',
      targetType: 'bookable_unit',
      targetId: id,
      afterSnapshot: { mediaId: media.id },
    });
    return media;
  }

  async removeUnitMedia(principal, id, mediaId) {
    if (!principal) throw new AuthenticationError();
    const unit = await this.#bookableUnitService.findById(id);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    const media = await this.#bookableUnitService.findMediaById(mediaId);
    if (!media || media.mediableId !== id) {
      throw new NotFoundError('Media not found for this room.');
    }

    await this.#bookableUnitService.removeMedia(mediaId, principal.userId);
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'bookable_unit.media_removed',
      targetType: 'bookable_unit',
      targetId: id,
      afterSnapshot: { mediaId },
    });
  }

  // --- availability_calendar (the primary engine) ---

  /**
   * Consumes an existing `unitId` — it never creates one. If the unit
   * doesn't exist (or was never explicitly registered via `registerUnit`),
   * this fails plainly rather than provisioning one to make the request
   * succeed, keeping Availability inventory-agnostic.
   */
  async setAvailability(principal, input) {
    if (!principal) throw new AuthenticationError();
    const {
      unitId,
      dateFrom,
      dateTo,
      status = 'AVAILABLE',
      quantityAvailable,
      priceOverrideAmount,
      priceOverrideCurrency,
    } = input;
    assertWritableStatus(status);

    const unit = await this.#bookableUnitService.findById(unitId);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    const statusId =
      await this.#availabilityCalendarRepository.findStatusIdByCode(status);
    const dates = enumerateDates(dateFrom, dateTo);
    const priceOverrideCurrencyId = await this.#resolveCurrencyId(
      priceOverrideCurrency,
    );

    const result = await this.#availabilityCalendarRepository.upsertRange({
      bookableUnitId: unit.id,
      dates,
      statusId,
      quantityAvailable,
      priceOverrideAmount,
      priceOverrideCurrencyId,
    });
    // Targets the unit, not any single calendar row — this write spans a
    // whole date range, so there is no one row id to attribute it to.
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'availability_calendar.set',
      targetType: 'bookable_unit',
      targetId: unit.id,
      afterSnapshot: { dateFrom, dateTo, status, quantityAvailable },
    });
    return result;
  }

  /** Resolves a client-supplied currency code to its id, or `undefined` when none was supplied. */
  async #resolveCurrencyId(currencyCode) {
    if (currencyCode === undefined) return undefined;
    const currency = await findCurrencyByCode(currencyCode);
    if (!currency) {
      throw new ValidationError('Unknown currency code.', [
        { field: 'priceOverrideCurrency', issue: 'UNKNOWN_CURRENCY' },
      ]);
    }
    return currency.id;
  }

  async updateCalendarEntry(principal, id, fields) {
    if (!principal) throw new AuthenticationError();
    const existing = await this.#availabilityCalendarRepository.findById(id);
    if (!existing) throw new NotFoundError('Calendar entry not found.');
    const unit = await this.#bookableUnitService.findById(
      existing.bookableUnitId,
    );
    if (!unit) throw new NotFoundError('Calendar entry not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    let statusId;
    if (fields.status !== undefined) {
      assertWritableStatus(fields.status);
      statusId = await this.#availabilityCalendarRepository.findStatusIdByCode(
        fields.status,
      );
    }
    const priceOverrideCurrencyId = await this.#resolveCurrencyId(
      fields.priceOverrideCurrency,
    );

    const result = await this.#availabilityCalendarRepository.update(id, {
      statusId,
      quantityAvailable: fields.quantityAvailable,
      priceOverrideAmount: fields.priceOverrideAmount,
      priceOverrideCurrencyId,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'availability_calendar.updated',
      targetType: 'availability_calendar',
      targetId: id,
    });
    return result;
  }

  async removeCalendarEntry(principal, id) {
    if (!principal) throw new AuthenticationError();
    const existing = await this.#availabilityCalendarRepository.findById(id);
    if (!existing) throw new NotFoundError('Calendar entry not found.');
    const unit = await this.#bookableUnitService.findById(
      existing.bookableUnitId,
    );
    if (!unit) throw new NotFoundError('Calendar entry not found.');
    await this.#loadListingForManagement(principal, unit.listingId);

    await this.#availabilityCalendarRepository.remove(id);
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'availability_calendar.removed',
      targetType: 'availability_calendar',
      targetId: id,
    });
  }

  async listCalendarEntries(principal, filters = {}, paginationOpts = {}) {
    await this.#assertListVisibility(principal, filters);
    return this.#availabilityCalendarRepository.list(filters, paginationOpts);
  }

  // --- blackout_dates (the complementary veto layer) ---

  async createBlackout(principal, input) {
    if (!principal) throw new AuthenticationError();
    const listing = await this.#loadListingForManagement(
      principal,
      input.listingId,
    );
    const blackout = await this.#blackoutService.createRange({
      listingId: listing.id,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      reason: input.reason,
      createdBy: principal.userId,
    });
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'blackout.created',
      targetType: 'blackout_date',
      targetId: blackout.id,
      afterSnapshot: { dateFrom: input.dateFrom, dateTo: input.dateTo },
    });
    return blackout;
  }

  async updateBlackout(principal, id, fields) {
    if (!principal) throw new AuthenticationError();
    const existing = await this.#blackoutService.findById(id);
    if (!existing) throw new NotFoundError('Blocked date range not found.');
    await this.#loadListingForManagement(principal, existing.listingId);
    const result = await this.#blackoutService.updateRange(
      id,
      fields,
      principal.userId,
    );
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'blackout.updated',
      targetType: 'blackout_date',
      targetId: id,
    });
    return result;
  }

  async deleteBlackout(principal, id) {
    if (!principal) throw new AuthenticationError();
    const existing = await this.#blackoutService.findById(id);
    if (!existing) throw new NotFoundError('Blocked date range not found.');
    await this.#loadListingForManagement(principal, existing.listingId);
    await this.#blackoutService.deleteRange(id);
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'blackout.deleted',
      targetType: 'blackout_date',
      targetId: id,
    });
  }

  async listBlackouts(principal, filters = {}, paginationOpts = {}) {
    await this.#assertListVisibility(principal, filters);
    return this.#blackoutService.listRanges(filters, paginationOpts);
  }

  // --- public views ---

  /** Public: a listing's blocked ranges, no `reason`/`id` (DTO strips them). */
  async getPublicRanges(principal, listingId) {
    await this.#listingService.getListing(principal, listingId);
    return this.#blackoutService.getRangesForListing(
      listingId,
      PUBLIC_RANGES_LIMIT,
    );
  }

  /**
   * Public: a listing's bookable units (id/type/capacity only — no
   * ownership check, same precedent as `getPublicRanges` above). Phase 7's
   * Booking Flow uses this to resolve which unit(s) a customer can select
   * before requesting a hold; `toPublicBookableUnitResponse` (the DTO,
   * not this method) is what strips owner-facing fields.
   *
   * Sprint A (Time-Aware Booking Foundation) addition: an optional `date`
   * augments each unit with a per-date availability/price snapshot —
   * exactly what the customer-facing time-slot picker needs to know which
   * of a listing's several `TOUR_DEPARTURE`-style units (each one real
   * departure/session, see `accommodationDateSemantics.js`) actually has
   * capacity on the one date the customer already picked, before they
   * commit to a specific time. Deliberately reuses
   * `getPublicDailyAvailabilityStatus`'s own remaining-quantity/blackout
   * logic (one call per unit — the same small-N reuse this file's other
   * per-unit fan-outs already use, e.g. `getPublicAvailabilitySummary`)
   * and `resolvePriceForDate`'s own date-override -> unit-base ->
   * listing-fallback precedence (the exact same one `getCalendar`/
   * `bookingService.js#resolveItem` use) rather than duplicating either
   * calculation. Omitting `date` returns the exact same shape this method
   * always has — fully backward compatible with every existing caller
   * (Admin Inventory, the Partner listing-detail Bookable Units panel,
   * and this widget's own initial, date-less unit list).
   *
   * Sprint C-2 (Public Rooms / Choose Your Room): every unit is now run
   * through the same `#enrichUnit` every owner-facing path already uses,
   * attaching a HOTEL_ROOM's translations/amenityIds/media — small-N
   * reads (a hotel's own room-type count), same precedent as `listUnits`
   * above. `toPublicBookableUnitResponse` is still what decides which of
   * these fields actually leave the server.
   */
  async getPublicUnits(principal, listingId, { date } = {}) {
    const listing = await this.#listingService.getListing(principal, listingId);
    const rawUnits =
      await this.#bookableUnitService.listUnitsForListing(listingId);
    const units = await Promise.all(
      rawUnits.map((unit) => this.#enrichUnit(unit)),
    );
    if (date === undefined) return units;

    const [dayStatusesByUnit, priceRowsByUnit] = await Promise.all([
      Promise.all(
        units.map((unit) =>
          this.getPublicDailyAvailabilityStatus(principal, listingId, {
            from: date,
            to: date,
            unitId: unit.id,
          }),
        ),
      ),
      Promise.all(
        units.map((unit) =>
          this.#availabilityCalendarRepository.listPricesForUnit(unit.id, {
            from: date,
            to: date,
          }),
        ),
      ),
    ]);

    return units.map((unit, index) => {
      const [dayStatus] = dayStatusesByUnit[index];
      const [override] = priceRowsByUnit[index];
      const resolvedPrice = resolvePriceForDate({
        overrideAmount: override?.amount,
        overrideCurrencyCode: override?.currencyCode,
        unitBaseAmount: unit.basePriceAmount,
        unitBaseCurrencyCode: unit.basePriceCurrencyCode,
        listingBaseAmount: listing.pricing?.amount,
        listingBaseCurrencyCode: listing.pricing?.currencyCode,
      });
      return {
        ...unit,
        remainingForDate: dayStatus?.remaining ?? 0,
        priceForDateAmount: resolvedPrice?.amount ?? null,
        priceForDateCurrencyCode: resolvedPrice?.currencyCode ?? null,
      };
    });
  }

  /**
   * Public day-by-day calendar merging `availability_calendar` (default
   * `AVAILABLE` where no row exists) with the `blackout_dates` veto.
   *
   * Unit resolution never guesses: zero units registered -> the whole
   * span is blackout-only (every day defaults to `AVAILABLE` unless
   * vetoed); exactly one unit -> used unambiguously; more than one ->
   * the caller must pass `unitId` explicitly, since "which calendar do
   * you mean" is a real question once multiple units exist and
   * Availability has no inventory-type knowledge to answer it on its own.
   *
   * P2.2B fix: every day's price now resolves through the same
   * `resolvePriceForDate` precedence `bookingService.js#resolveItem` uses
   * to charge a booking (date override -> unit base price -> listing
   * fallback) — previously this only ever returned an explicit calendar
   * override, so a day resolvable purely via a unit's own base price or
   * the listing's fallback (i.e. any day without its own override, which
   * is the common case) silently came back with `price_amount: null`,
   * making `ListingReservationWidget`'s customer-facing estimate go blank
   * rather than merely differ from what booking creation would actually
   * charge. Reuses the listing object this method already fetches above
   * (previously discarded) and the unit object already resolved below
   * (previously narrowed to just its id) — no new query added.
   */
  async getCalendar(principal, listingId, from, to, unitId) {
    const listing = await this.#listingService.getListing(principal, listingId);

    let resolvedUnit;
    if (unitId === undefined) {
      const units =
        await this.#bookableUnitService.listUnitsForListing(listingId);
      if (units.length > 1) {
        throw new ValidationError(
          'This listing has more than one bookable unit; specify unitId.',
          [{ field: 'unitId', issue: 'AMBIGUOUS_UNIT' }],
        );
      }
      [resolvedUnit] = units;
    } else {
      resolvedUnit = await this.#bookableUnitService.findById(unitId);
      if (!resolvedUnit || resolvedUnit.listingId !== listingId) {
        throw new NotFoundError('Bookable unit not found for this listing.');
      }
    }
    const resolvedUnitId = resolvedUnit?.id;

    let calendarByDate = {};
    let overrideByDate = {};
    if (resolvedUnitId !== undefined) {
      const [rows, priceRows] = await Promise.all([
        this.#availabilityCalendarRepository.listForUnit(resolvedUnitId, {
          from,
          to,
        }),
        this.#availabilityCalendarRepository.listPricesForUnit(resolvedUnitId, {
          from,
          to,
        }),
      ]);
      calendarByDate = Object.fromEntries(
        rows.map((row) => [row.date, row.statusCode]),
      );
      overrideByDate = Object.fromEntries(
        priceRows.map((row) => [
          row.date,
          { amount: row.amount, currencyCode: row.currencyCode },
        ]),
      );
    }

    const blockedRanges = await this.#blackoutService.getActiveRangesForListing(
      listingId,
      {
        from,
        to,
      },
    );

    return expandCalendarDays(from, to, { calendarByDate, blockedRanges }).map(
      (day) => {
        const override = overrideByDate[day.date];
        const resolved = resolvedUnit
          ? resolvePriceForDate({
              overrideAmount: override?.amount,
              overrideCurrencyCode: override?.currencyCode,
              unitBaseAmount: resolvedUnit.basePriceAmount,
              unitBaseCurrencyCode: resolvedUnit.basePriceCurrencyCode,
              listingBaseAmount: listing.pricing?.amount,
              listingBaseCurrencyCode: listing.pricing?.currencyCode,
            })
          : null;
        return {
          ...day,
          priceAmount: resolved?.amount ?? null,
          priceCurrencyCode: resolved?.currencyCode ?? null,
        };
      },
    );
  }

  /**
   * Phase 17 §Listing Detail — a customer-safe availability summary, one
   * entry per bookable unit (or a single entry when `unitId` narrows to
   * one), never exposing raw internal numbers beyond the bounded
   * `LOW_STOCK_THRESHOLD` (applied downstream by
   * `toPublicAvailabilitySummaryResponse`). Reuses exactly the same
   * `quantity_available` COALESCE convention `getAvailabilityBreakdown`
   * already established (`availableByDate[date] ?? unit.capacity` — a
   * missing row means the unit's full static capacity, per
   * `availability_calendar`'s documented semantics) plus the blackout veto
   * `getCalendar` already applies, so this can never disagree with what
   * the authoritative engine would actually decide at hold-creation time.
   *
   * Phase 18 (availability-state-contradiction fix): `remaining` used to be
   * the MIN across *every* day in the window, including fully sold-out
   * ones — so a unit open for 28 of the next 30 days, with just 2 days
   * completely booked, collapsed to `remaining = 0` and reported itself as
   * flatly SOLD_OUT, directly contradicting the correct, same-pipeline
   * day-status count (`getPublicDailyAvailabilityStatus`) shown right next
   * to it on the page. The fix: `remaining` is now the MIN across only the
   * days that actually have stock (`> 0`); a unit is SOLD_OUT strictly
   * when *no* day in the window has any stock at all, not when merely one
   * does. This still lets a genuinely constrained unit (open every day,
   * but down to a handful of units per day) correctly bucket to LOW via
   * the existing `LOW_STOCK_THRESHOLD` rule — only the "one bad day
   * poisons the whole month" bug is fixed, not the real scarcity signal.
   */
  async getPublicAvailabilitySummary(
    principal,
    listingId,
    { from, to, unitId },
  ) {
    await this.#listingService.getListing(principal, listingId);

    let units;
    if (unitId !== undefined) {
      const unit = await this.#bookableUnitService.findById(unitId);
      if (!unit || unit.listingId !== listingId) {
        throw new NotFoundError('Bookable unit not found for this listing.');
      }
      units = [unit];
    } else {
      units = await this.#bookableUnitService.listUnitsForListing(listingId);
    }

    const blockedRanges = await this.#blackoutService.getActiveRangesForListing(
      listingId,
      { from, to },
    );
    const dates = enumerateDates(from, to);

    const summaries = await Promise.all(
      units.map(async (unit) => {
        const calendarRows =
          await this.#availabilityCalendarRepository.listForUnit(unit.id, {
            from,
            to,
          });
        const availableByDate = Object.fromEntries(
          calendarRows.map((row) => [row.date, row.quantityAvailable]),
        );
        const perDayRemaining = dates.map((date) =>
          isVetoedByBlackout(date, blockedRanges)
            ? 0
            : Math.max(0, availableByDate[date] ?? unit.capacity),
        );
        const bookableDays = perDayRemaining.filter(
          (dayRemaining) => dayRemaining > 0,
        );
        const remaining =
          bookableDays.length === 0 ? 0 : Math.min(...bookableDays);

        return {
          unitId: unit.id,
          bookableUnitTypeCode: unit.bookableUnitTypeCode,
          remaining,
        };
      }),
    );

    return summaries;
  }

  /**
   * Phase 18 (Premium Listing Detail — Availability UX fix). Phase 17's
   * `getPublicAvailabilitySummary` above collapses a whole date range to
   * ONE min-based status, which is right for a scarcity badge but wrong
   * for a date picker — the customer-facing `DatePicker` needs to know
   * WHICH individual days are sold out, not just "the worst day in this
   * range is sold out." This closes the exact gap Phase 17 documented:
   * the calendar's `disabledDates` were derived only from
   * `availability_calendar.statusCode`, structurally blind to manual
   * blocks/external reservations tracked purely through
   * `quantity_available`. Reuses the identical per-day remaining-quantity
   * computation `getPublicAvailabilitySummary` already established
   * (`availableByDate[date] ?? unit.capacity`, blackout veto) — just
   * returns one bucketed status per day instead of collapsing the range.
   * Same single-unit resolution convention `getCalendar` uses (unitId
   * required only when the listing has more than one unit).
   */
  async getPublicDailyAvailabilityStatus(
    principal,
    listingId,
    { from, to, unitId },
  ) {
    await this.#listingService.getListing(principal, listingId);

    let resolvedUnitId = unitId;
    let capacity;
    if (resolvedUnitId === undefined) {
      const units =
        await this.#bookableUnitService.listUnitsForListing(listingId);
      if (units.length > 1) {
        throw new ValidationError(
          'This listing has more than one bookable unit; specify unitId.',
          [{ field: 'unitId', issue: 'AMBIGUOUS_UNIT' }],
        );
      }
      resolvedUnitId = units[0]?.id;
      capacity = units[0]?.capacity ?? 1;
    } else {
      const unit = await this.#bookableUnitService.findById(resolvedUnitId);
      if (!unit || unit.listingId !== listingId) {
        throw new NotFoundError('Bookable unit not found for this listing.');
      }
      capacity = unit.capacity;
    }

    const dates = enumerateDates(from, to);
    if (resolvedUnitId === undefined) {
      return dates.map((date) => ({ date, remaining: 1 }));
    }

    const [calendarRows, blockedRanges] = await Promise.all([
      this.#availabilityCalendarRepository.listForUnit(resolvedUnitId, {
        from,
        to,
      }),
      this.#blackoutService.getActiveRangesForListing(listingId, {
        from,
        to,
      }),
    ]);
    const availableByDate = Object.fromEntries(
      calendarRows.map((row) => [row.date, row.quantityAvailable]),
    );

    return dates.map((date) => {
      const remaining = isVetoedByBlackout(date, blockedRanges)
        ? 0
        : (availableByDate[date] ?? capacity);
      return { date, remaining: Math.max(0, remaining) };
    });
  }

  // --- Sprint 10: capacity reservation (reservation_holds +
  // availability_calendar.quantity_available). Called only by the
  // booking-holds/bookings modules as a Service-to-Service dependency —
  // never exposed as new HTTP routes on /availability. These methods
  // never write availability_calendar.status_id: the public write-guard
  // above (AVAILABLE/BLOCKED only) is untouched. ---

  async #restoreCapacityForRange(
    {
      bookableUnitId,
      dateFrom,
      dateTo,
      restoreAmount,
      sourceType = LEDGER_SOURCE_TYPES.ADJUSTMENT,
      sourceId = null,
      actorUserId = null,
      reason = null,
    },
    connection,
  ) {
    const unit = await this.#bookableUnitService.findById(bookableUnitId);
    const availableStatusId =
      await this.#availabilityCalendarRepository.findStatusIdByCode(
        'AVAILABLE',
        connection,
      );
    const consumedRange = resolveConsumedRange(
      unit?.bookableUnitTypeCode,
      dateFrom,
      dateTo,
    );
    const dates = enumerateDates(consumedRange.dateFrom, consumedRange.dateTo);
    for (const date of dates) {
      // eslint-disable-next-line no-await-in-loop -- each date's lock+write must be sequential within one transaction.
      const row = await this.#availabilityCalendarRepository.lockForCapacity(
        {
          bookableUnitId,
          date,
          availableStatusId,
          defaultCapacity: unit?.capacity ?? 1,
        },
        connection,
      );
      const quantityAfter = row.quantityAvailable + restoreAmount;
      // eslint-disable-next-line no-await-in-loop
      await this.#availabilityCalendarRepository.update(
        row.id,
        { quantityAvailable: quantityAfter },
        connection,
      );
      // eslint-disable-next-line no-await-in-loop
      await this.#writeLedger(
        {
          bookableUnitId,
          date,
          sourceType,
          sourceId,
          delta: restoreAmount,
          quantityBefore: row.quantityAvailable,
          quantityAfter,
          actorUserId,
          reason,
        },
        connection,
      );
    }
  }

  /**
   * Grants a hold of `quantity` units of capacity for `[dateFrom, dateTo]`
   * on `unitId`: checks the blackout veto once for the whole range, then
   * locks and decrements `quantity_available` one date at a time (in
   * ascending date order, so concurrent requests acquire locks in a
   * consistent order and don't deadlock each other), all-or-nothing.
   * Must run inside the caller's transaction (`connection` is required).
   *
   * Sprint B (Car Rental Pickup/Return Interval): `startTime`/`endTime`
   * are the ONE case in this whole engine where a time value is ever
   * accepted from a client at all — a rental's pickup/return time has no
   * unit-level default to derive it from (unlike a Tour departure's fixed
   * `bookable_units.time_slot_start/end`), so the customer's choice must
   * be captured somewhere, and this is the single point it is validated
   * before being trusted. Every other bookable unit type either has no
   * time concept or derives it from the unit itself — passing a time for
   * a non-VEHICLE unit is silently ignored (never persisted), so this
   * can never become a second, parallel way to set a Tour's departure
   * time. The capacity/blackout check below is deliberately unchanged:
   * it still locks whole calendar DAYS (`resolveConsumedRange` already
   * treats VEHICLE as inclusive-of-the-return-day) — this sprint adds a
   * real, validated pickup/return time for persistence, display, and
   * chronology correctness, but does not change the day-granularity
   * capacity engine itself (see the approved Sprint B scope boundary:
   * that is the larger multi-source-calendar work, explicitly deferred).
   *
   * @returns {Promise<{holdIds: number[], unitId: number, dateFrom: string, dateTo: string, startTime: string|null, endTime: string|null, quantity: number, expiresAt: Date}>}
   */
  async reserveCapacity(
    {
      unitId,
      dateFrom,
      dateTo,
      startTime,
      endTime,
      quantity,
      expiresAt,
      userId,
    },
    connection,
  ) {
    const unit = await this.#bookableUnitService.findById(unitId);
    if (!unit) throw new NotFoundError('Bookable unit not found.');

    const isVehicle = isVehicleUnitType(unit.bookableUnitTypeCode);
    const resolvedStartTime = isVehicle ? (startTime ?? null) : null;
    const resolvedEndTime = isVehicle ? (endTime ?? null) : null;
    if (isVehicle) {
      const interval = validateRentalInterval({
        dateFrom,
        dateTo,
        startTime: resolvedStartTime,
        endTime: resolvedEndTime,
      });
      if (!interval.valid) {
        throw new ValidationError(
          'The requested return time must be after the pickup time.',
          [{ field: 'items', issue: interval.reason }],
        );
      }
    }

    const consumedRange = resolveConsumedRange(
      unit.bookableUnitTypeCode,
      dateFrom,
      dateTo,
    );
    const dates = enumerateDates(consumedRange.dateFrom, consumedRange.dateTo);
    const blockedRanges = await this.#blackoutService.getActiveRangesForListing(
      unit.listingId,
      { from: dateFrom, to: dateTo },
      connection,
    );
    if (dates.some((date) => isVetoedByBlackout(date, blockedRanges))) {
      throw new ConflictError(
        'One or more requested dates are blocked for this listing.',
        'BLACKOUT_DATE',
      );
    }

    const availableStatusId =
      await this.#availabilityCalendarRepository.findStatusIdByCode(
        'AVAILABLE',
        connection,
      );

    for (const date of dates) {
      // eslint-disable-next-line no-await-in-loop -- sequential lock+check+write per date, within one transaction.
      const row = await this.#availabilityCalendarRepository.lockForCapacity(
        {
          bookableUnitId: unit.id,
          date,
          availableStatusId,
          defaultCapacity: unit.capacity,
        },
        connection,
      );
      if (row.statusCode === 'BLOCKED') {
        throw new ConflictError(
          'One or more requested dates are blocked for this listing.',
          'BLACKOUT_DATE',
        );
      }
      if (row.quantityAvailable < quantity) {
        throw new ConflictError(
          'The requested quantity is not available for one or more requested dates.',
          'AVAILABILITY_CONFLICT',
        );
      }
      const quantityAfter = row.quantityAvailable - quantity;
      // eslint-disable-next-line no-await-in-loop
      await this.#availabilityCalendarRepository.update(
        row.id,
        { quantityAvailable: quantityAfter },
        connection,
      );
      // eslint-disable-next-line no-await-in-loop
      await this.#writeLedger(
        {
          bookableUnitId: unit.id,
          date,
          sourceType: LEDGER_SOURCE_TYPES.TRAVELHUB_HOLD,
          sourceId: null,
          delta: -quantity,
          quantityBefore: row.quantityAvailable,
          quantityAfter,
          actorUserId: userId,
          reason: 'Reservation hold created',
        },
        connection,
      );
    }

    const holdIds = await this.#reservationHoldRepository.createMany(
      {
        bookableUnitId: unit.id,
        userId,
        dateFrom,
        dateTo,
        startTime: resolvedStartTime,
        endTime: resolvedEndTime,
        expiresAt,
        count: quantity,
      },
      connection,
    );
    return {
      holdIds,
      unitId: unit.id,
      dateFrom,
      dateTo,
      startTime: resolvedStartTime,
      endTime: resolvedEndTime,
      quantity,
      expiresAt,
    };
  }

  /**
   * Releases holds the caller owns, restoring the capacity they consumed.
   * Must run inside the caller's transaction (`connection` is required).
   */
  async releaseHold({ holdIds, userId }, connection) {
    const holds = await this.#reservationHoldRepository.findActiveByIds(
      holdIds,
      userId,
      connection,
    );
    if (holds.length !== holdIds.length) {
      throw new ConflictError(
        'One or more holds are already expired, consumed, or do not belong to you.',
        'HOLD_EXPIRED',
      );
    }
    const groups = groupHoldsByRange(holds);
    for (const group of groups) {
      // eslint-disable-next-line no-await-in-loop
      await this.#restoreCapacityForRange(
        {
          ...group,
          restoreAmount: group.count,
          sourceType: LEDGER_SOURCE_TYPES.TRAVELHUB_HOLD,
          actorUserId: userId,
          reason: 'Reservation hold released by customer',
        },
        connection,
      );
    }
    await this.#reservationHoldRepository.deleteByIds(holdIds, connection);
  }

  /**
   * Consumes holds the caller owns — deletes them WITHOUT restoring
   * capacity, since it has now transferred to the booking the caller
   * (`BookingService`) is creating in the same transaction. Returns the
   * consumed hold rows so the caller can group them into `booking_items`
   * (quantity = how many rows shared one unit + date range).
   */
  async consumeHold({ holdIds, userId }, connection) {
    const holds = await this.#reservationHoldRepository.findActiveByIds(
      holdIds,
      userId,
      connection,
    );
    if (holds.length !== holdIds.length) {
      throw new ConflictError(
        'One or more holds are already expired, consumed, or do not belong to you.',
        'HOLD_EXPIRED',
      );
    }
    await this.#reservationHoldRepository.deleteByIds(holdIds, connection);
    return holds;
  }

  /** Self-service: the caller's own active (non-expired) holds. */
  async listActiveHoldsForUser(userId) {
    return this.#reservationHoldRepository.listActiveForUser(userId);
  }

  /**
   * Restores capacity a now-cancelled/rejected booking item had consumed
   * — called by `BookingService` when a `booking_item`'s date range is
   * still in the future (a past date range's capacity is moot; that
   * Service decides which items qualify, this method just performs the
   * restoration it's told to). Must run inside the caller's transaction.
   */
  async releaseBookedCapacity(
    {
      unitId,
      dateFrom,
      dateTo,
      quantity,
      bookingId = null,
      actorUserId = null,
    },
    connection,
  ) {
    await this.#restoreCapacityForRange(
      {
        bookableUnitId: unitId,
        dateFrom,
        dateTo,
        restoreAmount: quantity,
        sourceType: LEDGER_SOURCE_TYPES.TRAVELHUB_BOOKING,
        sourceId: bookingId,
        actorUserId,
        reason: 'Booking cancelled/rejected — capacity released',
      },
      connection,
    );
  }

  /**
   * The scheduled hold-expiry sweep's entry point (called by
   * `modules/booking-holds/jobs/holdExpirySweep.js`, never by an HTTP
   * route). Opens its own transaction per batch — this is a top-level
   * system operation, not a sub-call within a larger caller transaction.
   *
   * @returns {Promise<number>} how many expired hold rows were released
   */
  async releaseExpiredHoldsBatch(limit = EXPIRY_SWEEP_BATCH_SIZE) {
    return withTransaction(async (connection) => {
      const expired = await this.#reservationHoldRepository.findExpired(
        limit,
        connection,
      );
      if (expired.length === 0) return 0;

      const groups = groupHoldsByRange(expired);
      for (const group of groups) {
        // eslint-disable-next-line no-await-in-loop
        await this.#restoreCapacityForRange(
          {
            ...group,
            restoreAmount: group.count,
            sourceType: LEDGER_SOURCE_TYPES.TRAVELHUB_HOLD,
            reason: 'Reservation hold expired',
          },
          connection,
        );
      }
      await this.#reservationHoldRepository.deleteByIds(
        expired.map((hold) => hold.id),
        connection,
      );
      return expired.length;
    });
  }

  /**
   * Per-date `price_override_amount` for a range — the only pricing
   * source that exists until a real Pricing module ships (§6 of the
   * approved Sprint 10 proposal: no `base_price` on `listings`, deferred
   * since Sprint 7). Thin passthrough so `BookingService` never touches
   * `availability_calendar` directly, same cross-module rule as every
   * other Availability capability.
   */
  async getPricingForRange({ unitId, dateFrom, dateTo }, connection) {
    return this.#availabilityCalendarRepository.listPricesForUnit(
      unitId,
      { from: dateFrom, to: dateTo },
      connection,
    );
  }

  // --- Phase 17: manual blocks + external reservations. Both are a
  // "quantity-aware" consumption layer distinct from the coarse,
  // whole-day `blackout_dates` veto and from the simple AVAILABLE/
  // BLOCKED `setAvailability` write path — neither checks the blackout
  // veto nor the calendar row's own status (a manual block is itself a
  // reason capacity might be reduced; requiring it to also respect an
  // unrelated coarse veto would only make the two layers fight each
  // other). Both share this one all-or-nothing decrement loop, the same
  // ascending-date-order/single-lock-per-date shape `reserveCapacity`
  // already established, just without the blackout pre-check. ---

  async #consumeCapacityForRange(
    {
      bookableUnitId,
      dateFrom,
      dateTo,
      quantity,
      sourceType,
      sourceId,
      actorUserId,
      reason,
    },
    connection,
  ) {
    const unit = await this.#bookableUnitService.findById(bookableUnitId);
    if (!unit) throw new NotFoundError('Bookable unit not found.');
    const consumedRange = resolveConsumedRange(
      unit.bookableUnitTypeCode,
      dateFrom,
      dateTo,
    );
    const dates = enumerateDates(consumedRange.dateFrom, consumedRange.dateTo);
    const availableStatusId =
      await this.#availabilityCalendarRepository.findStatusIdByCode(
        'AVAILABLE',
        connection,
      );
    for (const date of dates) {
      // eslint-disable-next-line no-await-in-loop -- sequential lock+check+write per date, within one transaction (mirrors reserveCapacity).
      const row = await this.#availabilityCalendarRepository.lockForCapacity(
        {
          bookableUnitId,
          date,
          availableStatusId,
          defaultCapacity: unit.capacity,
        },
        connection,
      );
      if (row.quantityAvailable < quantity) {
        throw new ConflictError(
          'The requested quantity is not available for one or more requested dates.',
          'AVAILABILITY_CONFLICT',
        );
      }
      const quantityAfter = row.quantityAvailable - quantity;
      // eslint-disable-next-line no-await-in-loop
      await this.#availabilityCalendarRepository.update(
        row.id,
        { quantityAvailable: quantityAfter },
        connection,
      );
      // eslint-disable-next-line no-await-in-loop
      await this.#writeLedger(
        {
          bookableUnitId,
          date,
          sourceType,
          sourceId,
          delta: -quantity,
          quantityBefore: row.quantityAvailable,
          quantityAfter,
          actorUserId,
          reason,
        },
        connection,
      );
    }
    return unit;
  }

  /** Manual, quantity-aware capacity block — NOT a booking (Phase 17 §11). */
  async createManualBlock(principal, input) {
    const { unitId, dateFrom, dateTo, quantity, reasonCode, notes } = input;
    if (!BLOCK_REASON_CODES.includes(reasonCode)) {
      throw new ValidationError('Unknown block reason code.', [
        { field: 'reasonCode', issue: 'UNKNOWN_REASON_CODE' },
      ]);
    }
    const { unit, listing } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
      'inventory.manage_all',
    );

    const block = await withTransaction(async (connection) => {
      const created = await this.#inventoryBlockRepository.create(
        {
          bookableUnitId: unit.id,
          dateFrom,
          dateTo,
          quantity,
          reasonCode,
          notes,
          createdBy: principal.userId,
        },
        connection,
      );
      await this.#consumeCapacityForRange(
        {
          bookableUnitId: unit.id,
          dateFrom,
          dateTo,
          quantity,
          sourceType: LEDGER_SOURCE_TYPES.MANUAL_BLOCK,
          sourceId: created.id,
          actorUserId: principal.userId,
          reason: `Manual block: ${reasonCode}`,
        },
        connection,
      );
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'inventory_block.created',
          targetType: 'inventory_block',
          targetId: created.id,
          afterSnapshot: {
            unitId: unit.id,
            dateFrom,
            dateTo,
            quantity,
            reasonCode,
          },
        },
        connection,
      );
      return created;
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.INVENTORY_BLOCKED,
        actorId: principal.userId,
        resourceType: 'inventory_block',
        resourceId: block.id,
        payload: {
          bookableUnitId: unit.id,
          listingId: listing.id,
          partnerId: listing.partnerId,
          dateFrom,
          dateTo,
          quantity,
          reasonCode,
        },
      }),
    );
    return block;
  }

  async releaseManualBlock(principal, id) {
    const block = await this.#inventoryBlockRepository.findById(id);
    if (!block) throw new NotFoundError('Inventory block not found.');
    if (block.releasedAt) {
      throw new ConflictError(
        'This block has already been released.',
        'ALREADY_RELEASED',
      );
    }
    const { unit, listing } = await this.#loadUnitForCapability(
      principal,
      block.bookableUnitId,
      PARTNER_CAPABILITIES.MANAGE_MANUAL_BLOCKS,
      'inventory.manage_all',
    );

    await withTransaction(async (connection) => {
      await this.#restoreCapacityForRange(
        {
          bookableUnitId: unit.id,
          dateFrom: block.dateFrom,
          dateTo: block.dateTo,
          restoreAmount: block.quantity,
          sourceType: LEDGER_SOURCE_TYPES.MANUAL_BLOCK,
          sourceId: block.id,
          actorUserId: principal.userId,
          reason: 'Manual block released',
        },
        connection,
      );
      await this.#inventoryBlockRepository.release(
        id,
        principal.userId,
        connection,
      );
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'inventory_block.released',
          targetType: 'inventory_block',
          targetId: id,
        },
        connection,
      );
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.INVENTORY_UNBLOCKED,
        actorId: principal.userId,
        resourceType: 'inventory_block',
        resourceId: id,
        payload: {
          bookableUnitId: unit.id,
          listingId: listing.id,
          partnerId: listing.partnerId,
        },
      }),
    );
  }

  async listManualBlocks(principal, listingId) {
    const listing = await this.#listingService.getListing(principal, listingId);
    await this.#assertPartnerCapability(
      principal,
      listing.partnerId,
      PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
      'inventory.view_all',
    );
    const units =
      await this.#bookableUnitService.listUnitsForListing(listingId);
    return this.#inventoryBlockRepository.listForUnits(units.map((u) => u.id));
  }

  /**
   * A phone/walk-in/OTA reservation recorded by a human (spec §10). Keeps
   * required fields to the minimum that actually protects inventory —
   * unit + date range/slot + quantity — everything else (guest details,
   * external reference, notes) is optional, so a manager can secure the
   * inventory first and fill in details later or not at all.
   */
  async createExternalReservation(principal, input) {
    const {
      unitId,
      dateFrom,
      dateTo,
      quantity = 1,
      sourceCode,
      externalReference,
      guestName,
      guestPhone,
      guestEmail,
      notes,
    } = input;
    if (!EXTERNAL_RESERVATION_SOURCE_CODES.includes(sourceCode)) {
      throw new ValidationError('Unknown external reservation source code.', [
        { field: 'sourceCode', issue: 'UNKNOWN_SOURCE_CODE' },
      ]);
    }
    const { unit, listing } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
      'inventory.manage_all',
    );

    const reservation = await withTransaction(async (connection) => {
      const created = await this.#externalReservationRepository.create(
        {
          bookableUnitId: unit.id,
          dateFrom,
          dateTo,
          quantity,
          sourceCode,
          externalReference,
          guestName,
          guestPhone,
          guestEmail,
          notes,
          createdBy: principal.userId,
        },
        connection,
      );
      await this.#consumeCapacityForRange(
        {
          bookableUnitId: unit.id,
          dateFrom,
          dateTo,
          quantity,
          sourceType: LEDGER_SOURCE_TYPES.EXTERNAL_RESERVATION,
          sourceId: created.id,
          actorUserId: principal.userId,
          reason: `External reservation: ${sourceCode}`,
        },
        connection,
      );
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'external_reservation.created',
          targetType: 'external_reservation',
          targetId: created.id,
          afterSnapshot: {
            unitId: unit.id,
            dateFrom,
            dateTo,
            quantity,
            sourceCode,
          },
        },
        connection,
      );
      return created;
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.EXTERNAL_RESERVATION_CREATED,
        actorId: principal.userId,
        resourceType: 'external_reservation',
        resourceId: reservation.id,
        payload: {
          bookableUnitId: unit.id,
          listingId: listing.id,
          partnerId: listing.partnerId,
          dateFrom,
          dateTo,
          quantity,
          sourceCode,
        },
      }),
    );
    return reservation;
  }

  /**
   * CSV import's confirm step (Phase 17 §21) — the frontend has already
   * parsed/previewed/validated rows client-side; this is the one point
   * where they're actually written, each row re-validated and applied
   * through the exact same capacity path `createExternalReservation`
   * uses (never a shortcut around `#consumeCapacityForRange`). Rows are
   * independent — one row's `AVAILABILITY_CONFLICT` doesn't roll back
   * the others, since a partner importing 50 historical bookings wants
   * to know exactly which ones failed, not lose the whole batch.
   * Idempotent within a batch and across re-uploads via `externalReference`
   * (a CSV-supplied stable id): a row whose `(unitId, externalReference)`
   * already exists as an active reservation is skipped, not duplicated.
   */
  async bulkCreateExternalReservations(
    principal,
    { unitId, sourceCode, rows },
  ) {
    if (!EXTERNAL_RESERVATION_SOURCE_CODES.includes(sourceCode)) {
      throw new ValidationError('Unknown external reservation source code.', [
        { field: 'sourceCode', issue: 'UNKNOWN_SOURCE_CODE' },
      ]);
    }
    const { unit, listing } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
      'inventory.manage_all',
    );

    const results = [];
    for (const [index, row] of rows.entries()) {
      // eslint-disable-next-line no-await-in-loop -- rows are applied one at a time so a later row's failure never rolls back an earlier row's real capacity write.
      const result = await withTransaction(async (connection) => {
        if (row.externalReference) {
          const existing = await this.#externalReservationRepository
            .listActiveForUnit(
              unit.id,
              { from: row.dateFrom, to: row.dateTo },
              connection,
            )
            .then((rows_) =>
              rows_.find((r) => r.externalReference === row.externalReference),
            );
          if (existing) {
            return {
              index,
              status: 'SKIPPED_DUPLICATE',
              reservationId: existing.id,
            };
          }
        }
        try {
          const created = await this.#externalReservationRepository.create(
            {
              bookableUnitId: unit.id,
              dateFrom: row.dateFrom,
              dateTo: row.dateTo,
              quantity: row.quantity ?? 1,
              sourceCode,
              externalReference: row.externalReference,
              guestName: row.guestName,
              guestPhone: row.guestPhone,
              guestEmail: row.guestEmail,
              notes: row.notes,
              createdBy: principal.userId,
            },
            connection,
          );
          await this.#consumeCapacityForRange(
            {
              bookableUnitId: unit.id,
              dateFrom: row.dateFrom,
              dateTo: row.dateTo,
              quantity: row.quantity ?? 1,
              sourceType: LEDGER_SOURCE_TYPES.EXTERNAL_RESERVATION,
              sourceId: created.id,
              actorUserId: principal.userId,
              reason: `CSV import: ${sourceCode}`,
            },
            connection,
          );
          return { index, status: 'CREATED', reservationId: created.id };
        } catch (err) {
          if (err instanceof ConflictError) {
            return { index, status: 'FAILED', error: err.message };
          }
          throw err;
        }
      });
      results.push(result);
    }

    const createdCount = results.filter((r) => r.status === 'CREATED').length;
    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'external_reservation.bulk_imported',
      targetType: 'bookable_unit',
      targetId: unit.id,
      afterSnapshot: { rowCount: rows.length, createdCount },
    });
    if (createdCount > 0) {
      await this.#eventBus.publish(
        createDomainEvent({
          eventType: EVENT_TYPES.EXTERNAL_RESERVATION_CREATED,
          actorId: principal.userId,
          resourceType: 'bookable_unit',
          resourceId: unit.id,
          payload: {
            listingId: listing.id,
            partnerId: listing.partnerId,
            bulkImport: true,
            createdCount,
            rowCount: rows.length,
          },
        }),
      );
    }
    return results;
  }

  async cancelExternalReservation(principal, id) {
    const reservation = await this.#externalReservationRepository.findById(id);
    if (!reservation)
      throw new NotFoundError('External reservation not found.');
    if (reservation.cancelledAt) {
      throw new ConflictError(
        'This reservation is already cancelled.',
        'ALREADY_CANCELLED',
      );
    }
    const { unit, listing } = await this.#loadUnitForCapability(
      principal,
      reservation.bookableUnitId,
      PARTNER_CAPABILITIES.MANAGE_EXTERNAL_RESERVATIONS,
      'inventory.manage_all',
    );

    await withTransaction(async (connection) => {
      await this.#restoreCapacityForRange(
        {
          bookableUnitId: unit.id,
          dateFrom: reservation.dateFrom,
          dateTo: reservation.dateTo,
          restoreAmount: reservation.quantity,
          sourceType: LEDGER_SOURCE_TYPES.EXTERNAL_RESERVATION,
          sourceId: reservation.id,
          actorUserId: principal.userId,
          reason: 'External reservation cancelled',
        },
        connection,
      );
      await this.#externalReservationRepository.cancel(id, connection);
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'external_reservation.cancelled',
          targetType: 'external_reservation',
          targetId: id,
        },
        connection,
      );
    });

    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.EXTERNAL_RESERVATION_CANCELLED,
        actorId: principal.userId,
        resourceType: 'external_reservation',
        resourceId: id,
        payload: {
          bookableUnitId: unit.id,
          listingId: listing.id,
          partnerId: listing.partnerId,
        },
      }),
    );
  }

  async listExternalReservations(principal, listingId) {
    const listing = await this.#listingService.getListing(principal, listingId);
    await this.#assertPartnerCapability(
      principal,
      listing.partnerId,
      PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
      'inventory.view_all',
    );
    const units =
      await this.#bookableUnitService.listUnitsForListing(listingId);
    return this.#externalReservationRepository.listForUnits(
      units.map((u) => u.id),
    );
  }

  // --- Phase 17: system-level (no `principal`) capacity application for
  // connector syncs. Trusted-caller-only (`InventoryConnectionService`),
  // never exposed as an HTTP route — the connection itself is what was
  // already authenticated/authorized when a partner created/configured
  // it; each individual synced event is not a fresh user request. ---

  /**
   * Applies one connector-synced external event as occupancy, idempotent
   * via `(connectionId, externalEventUid)` — returns the existing row
   * unchanged (`created: false`) if this exact event was already
   * imported, so a re-run of the same feed never double-consumes
   * capacity (Phase 17 §25).
   */
  async applySystemExternalReservation(
    {
      unitId,
      dateFrom,
      dateTo,
      quantity = 1,
      connectionId,
      externalEventUid,
      externalReference,
      notes,
    },
    connection,
  ) {
    const existing =
      await this.#externalReservationRepository.findByConnectionAndUid(
        connectionId,
        externalEventUid,
        connection,
      );
    if (existing) return { reservation: existing, created: false };

    const created = await this.#externalReservationRepository.create(
      {
        bookableUnitId: unitId,
        dateFrom,
        dateTo,
        quantity,
        sourceCode: 'CONNECTOR',
        externalReference,
        notes,
        connectionId,
        externalEventUid,
        createdBy: null,
      },
      connection,
    );
    await this.#consumeCapacityForRange(
      {
        bookableUnitId: unitId,
        dateFrom,
        dateTo,
        quantity,
        sourceType: LEDGER_SOURCE_TYPES.CONNECTOR_SYNC,
        sourceId: created.id,
        reason: `Connector sync: ${externalEventUid}`,
      },
      connection,
    );
    return { reservation: created, created: true };
  }

  /** The connector-sync counterpart to `cancelExternalReservation` — releases capacity for an external event the source feed no longer reports. */
  async cancelSystemExternalReservation(reservationId, connection) {
    const reservation =
      await this.#externalReservationRepository.findById(reservationId);
    if (!reservation || reservation.cancelledAt) return;
    await this.#restoreCapacityForRange(
      {
        bookableUnitId: reservation.bookableUnitId,
        dateFrom: reservation.dateFrom,
        dateTo: reservation.dateTo,
        restoreAmount: reservation.quantity,
        sourceType: LEDGER_SOURCE_TYPES.CONNECTOR_SYNC,
        sourceId: reservation.id,
        reason: 'Connector sync — event removed from source feed',
      },
      connection,
    );
    await this.#externalReservationRepository.cancel(reservationId, connection);
  }

  /** The append-only "why is this unavailable" trail for one unit (Phase 17 §29). */
  /**
   * Phase 17 §Admin Inventory — the raw active-hold rows for one unit
   * overlapping a date span (id/dateFrom/dateTo/expiresAt/userId), the
   * same source `getAvailabilityBreakdown`'s `held` column already
   * counts but never lists individually. Same owner-or-`inventory.view_all`
   * gate as every other diagnostic read on this unit.
   */
  async listActiveHoldsForUnit(principal, unitId, { from, to }) {
    const { unit } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
      'inventory.view_all',
    );
    return this.#reservationHoldRepository.listActiveForUnit(unit.id, {
      from,
      to,
    });
  }

  async getInventoryLedger(principal, unitId, { from, to }) {
    const { unit } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
      'inventory.view_all',
    );
    return this.#inventoryLedgerRepository.listForUnit(unit.id, { from, to });
  }

  /**
   * Per-day capacity breakdown for one unit (Phase 17 §13's grid-cell
   * detail: total/confirmed/holds/external/manual/available). "Confirmed
   * TravelHub bookings" is deliberately computed as the REMAINDER
   * (`total - available - held - external - manual`) rather than by
   * querying `bookings`/`booking_items` directly — Availability may not
   * own a second Repository over another module's tables
   * (BACKEND_ARCHITECTURE.md §4), and `quantity_available` already nets
   * out every source exactly, so the remainder is exact by construction,
   * not an approximation.
   */
  async getAvailabilityBreakdown(principal, unitId, { from, to }) {
    const { unit } = await this.#loadUnitForCapability(
      principal,
      unitId,
      PARTNER_CAPABILITIES.VIEW_AVAILABILITY,
      'inventory.view_all',
    );
    const dates = enumerateDates(from, to);
    const [calendarRows, blockRows, externalRows, holds] = await Promise.all([
      this.#availabilityCalendarRepository.listForUnit(unit.id, { from, to }),
      this.#inventoryBlockRepository.listActiveForUnit(unit.id, { from, to }),
      this.#externalReservationRepository.listActiveForUnit(unit.id, {
        from,
        to,
      }),
      this.#reservationHoldRepository.listActiveForUnit(unit.id, { from, to }),
    ]);
    const availableByDate = Object.fromEntries(
      calendarRows.map((row) => [row.date, row.quantityAvailable]),
    );

    // A hold/block/external-reservation row's `dateFrom`/`dateTo` is the
    // guest-facing request range (e.g. "check-in Aug 10, check-out Aug
    // 12") — display-only. Which days actually had capacity decremented
    // is the checkout-exclusive-adjusted range for accommodation units
    // (see `accommodationDateSemantics.js`), the SAME range
    // `reserveCapacity`/`#consumeCapacityForRange` actually locked and
    // wrote to `availability_calendar`. Re-deriving it here keeps this
    // breakdown honest against `available` (read straight off that same
    // table) instead of re-counting the raw stored range.
    const overlapsConsumedRange = (row, date) => {
      const consumed = resolveConsumedRange(
        unit.bookableUnitTypeCode,
        row.dateFrom,
        row.dateTo,
      );
      return consumed.dateFrom <= date && consumed.dateTo >= date;
    };
    const sumOverlapping = (rows, date, quantityField = 'quantity') =>
      rows
        .filter((row) => overlapsConsumedRange(row, date))
        .reduce((sum, row) => sum + row[quantityField], 0);

    return dates.map((date) => {
      const total = unit.capacity;
      const available = availableByDate[date] ?? total;
      const manual = sumOverlapping(blockRows, date);
      const external = sumOverlapping(externalRows, date);
      const held = holds.filter((hold) =>
        overlapsConsumedRange(hold, date),
      ).length;
      const confirmed = Math.max(
        0,
        total - available - manual - external - held,
      );
      return { date, total, available, confirmed, held, external, manual };
    });
  }
}

export default AvailabilityService;

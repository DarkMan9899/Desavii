/**
 * BookingService — public Service for the Bookings module (Sprint 10,
 * Module Catalog #18, deliberately scoped down from
 * `BACKEND_ARCHITECTURE.md`'s aspirational entry — no Payments/Refunds/
 * Wallet dependency, since none of those modules or their tables exist
 * yet; see the approved Sprint 10 proposal §1/§7 for the documented gap).
 *
 * The only Service permitted to write `bookings.status_id` (mirrors
 * `BACKEND_ARCHITECTURE.md` Ch.26's "no module other than bookings/
 * booking-holds mutates status directly," scoped down to just `bookings`
 * owning it here since this sprint merges the confirm-transition into
 * this one Service rather than a separate `ConfirmBookingHoldUseCase`).
 *
 * Depends on `AvailabilityService`'s public interface for everything
 * touching `bookable_units`/`availability_calendar`/`reservation_holds`
 * (`consumeHold`, `getUnitById`, `getPricingForRange`,
 * `releaseBookedCapacity`) — never a second Repository over those tables,
 * same cross-module rule Sprint 9 established. Depends on
 * `ListingService` only to resolve a listing's `partnerId`.
 *
 * **Booking creation never trusts client-supplied price, capacity, or
 * availability** (BACKEND_ARCHITECTURE.md §13) — every item's price is
 * resolved server-side from `availability_calendar.price_override_amount`
 * (the only pricing source that exists until a real Pricing module
 * ships), and every item's capacity was already re-verified, under lock,
 * when its hold was granted.
 */

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { isManagerAssignedToPartner } from '../../../infrastructure/database/repositories/managerAssignmentRepository.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { Money } from '../../../core/domain/money.js';
import { enumerateDates } from '../../../core/domain/calendarExpansion.js';
import { resolveConsumedRange } from '../../../core/domain/accommodationDateSemantics.js';
import { resolvePriceForDate } from '../../../core/domain/accommodationPriceResolution.js';
import { resolveBookingTypeCode } from '../../../core/domain/bookableUnitTypeToBookingType.js';
import { isVehicleUnitType } from '../../../core/domain/rentalIntervalValidation.js';
import { isValidBookingStatusTransition } from '../../../core/domain/bookingStatusTransitions.js';
import { generateBookingReference } from '../../../core/domain/bookingReference.js';
import {
  CANCELLATION_REFUND_ACTIONS,
  resolveCancellationRefundAction,
} from '../../../core/domain/cancellationRefundPolicy.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import { getModuleLogger } from '../../../logging/logger.js';

const log = getModuleLogger('bookings');

const VIEW_ALL_PERMISSION = 'booking.view_all';
const CONFIRM_PERMISSION = 'booking.confirm';
const REJECT_PERMISSION = 'booking.reject';
const CANCEL_ANY_PERMISSION = 'booking.cancel_any';
// Launch-blocker remediation (P0-B): deliberately reuses PaymentService's
// own `payment.refund` permission rather than minting a new one — a
// partner deciding "no refund is owed" is an equally sensitive,
// money-adjacent judgment call as a partner issuing one, and admin-only/
// no-owner-fallback for the same reason (see paymentService.js's
// REFUND_PERMISSION comment).
const REFUND_REVIEW_PERMISSION = 'payment.refund';
const MAX_REFERENCE_ATTEMPTS = 5;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sprint B (Car Rental Pickup/Return Interval) — `listing_locations` is
 * 1:1 per listing (migration 0005: `UNIQUE(listing_id)`), so this
 * platform has no multi-location-per-listing model; a rental's pickup
 * and return are always the listing's own single registered location
 * (same-location return only). Mirrors the exact `[cityName, countryName]`
 * join the public listing page itself already uses
 * (`ListingHero.jsx`/`ListingLocationSection.jsx`), so a booking's
 * snapshotted location reads identically to how the customer saw it.
 */
function formatListingLocationLabel(location) {
  if (!location) return null;
  return (
    [location.cityName, location.countryName].filter(Boolean).join(', ') || null
  );
}

export class BookingService {
  #bookingRepository;

  #availabilityService;

  #listingService;

  #partnerService;

  #permissionResolver;

  #auditLogger;

  #eventBus;

  #paymentService;

  constructor({
    bookingRepository,
    availabilityService,
    listingService,
    partnerService = null,
    permissionResolver,
    auditLogger,
    eventBus = createNoOpEventBus(),
  }) {
    this.#bookingRepository = bookingRepository;
    this.#availabilityService = availabilityService;
    this.#listingService = listingService;
    this.#partnerService = partnerService;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#eventBus = eventBus;
  }

  /**
   * P0.2 (Master Roadmap) — late-bound, same reason as `AvailabilityService`/
   * `InventoryConnectionService`'s identical `setAvailabilityService`
   * precedent: `PaymentService`'s own constructor already depends on
   * `BookingService` (`recordPaymentOutcome`), so `v1.js` must construct
   * Bookings before Payments — this breaks that ordering without a
   * circular import. Optional on purpose: a test/harness that never
   * constructs a PaymentService (most of this module's own unit tests)
   * still works, `cancelBooking` just skips the refund-policy step below.
   */
  setPaymentService(paymentService) {
    this.#paymentService = paymentService;
  }

  async #isOwnerOrHasPermission(principal, partnerId, permissionKey) {
    if (!principal) return false;
    const isOwner = await isPartnerOwner(principal.userId, partnerId);
    if (isOwner) return true;
    // Sprint F: a Manager assigned to this company gets read-only booking
    // VISIBILITY only (`VIEW_ALL_PERMISSION`) — never confirm/reject/
    // cancel_any, which stay owner/admin-only. Checked fresh, per request,
    // against `manager_companies`, never trusted from the JWT.
    if (
      permissionKey === VIEW_ALL_PERMISSION &&
      principal.roles.includes('MANAGER')
    ) {
      const isAssignedManager = await isManagerAssignedToPartner(
        principal.userId,
        partnerId,
      );
      if (isAssignedManager) return true;
    }
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

  /**
   * Resolves one request item's holds into a priced, unit/listing-
   * consistent line: consumes the item's `holdIds` (deleting them,
   * transferring their capacity to this booking), verifies they all
   * share one unit + date range, and sums that range's per-date price
   * into a single `unit_price_amount` (the price for ONE unit of
   * capacity across the whole range; `quantity` multiplies separately).
   *
   * Phase 21 fix: `availability_calendar.price_override_amount` is a
   * per-date *override* a partner may optionally set (peak pricing,
   * etc.) — it was never meant to be the only pricing source a listing
   * can ever have, but nothing filled in a default when no override
   * existed, so a listing that only ever set its base `listing_pricing`
   * rate (the "per night" price shown everywhere on its own detail page
   * and search cards) could never actually be booked: every date fell
   * through to `PRICING_INCOMPLETE`. Any date missing an explicit
   * override now falls back to the listing's base price — still fully
   * server-resolved (never client-supplied), still throws
   * `PRICING_INCOMPLETE` for a date with neither an override nor a base
   * price to fall back to.
   *
   * P2.2A adds one more rung between those two: the bookable UNIT's own
   * `base_price_amount` (a real per-room-type base rate — Standard Room
   * and Deluxe Suite can now genuinely differ in price without a partner
   * populating a calendar override for every date). Full precedence,
   * per date: date-specific unit override -> unit base price -> listing
   * base price fallback. A unit created before this slice has no base
   * price (`NULL`, untouched by the migration) and transparently falls
   * through to the listing price exactly as it did before this change —
   * no legacy unit's resolved price changes.
   *
   * P2.2B: the actual rung-by-rung decision now lives in the shared
   * `resolvePriceForDate` (`core/domain/accommodationPriceResolution.js`)
   * — `availabilityService.js#getCalendar` (the customer-facing estimate
   * `ListingReservationWidget` reads) calls the exact same function, so
   * the estimate a customer sees can never silently diverge from what
   * this method actually charges.
   */
  async #resolveItem(item, userId, connection, principal) {
    const holds = await this.#availabilityService.consumeHold(
      { holdIds: item.holdIds, userId },
      connection,
    );
    const [firstHold] = holds;
    const consistent = holds.every(
      (hold) =>
        hold.bookableUnitId === firstHold.bookableUnitId &&
        hold.dateFrom === firstHold.dateFrom &&
        hold.dateTo === firstHold.dateTo,
    );
    if (!consistent) {
      throw new ValidationError(
        'All holdIds within one booking item must share the same unit and date range.',
        [{ field: 'items', issue: 'INCONSISTENT_HOLD_GROUP' }],
      );
    }

    const unit = await this.#availabilityService.getUnitById(
      firstHold.bookableUnitId,
    );
    const isVehicle = isVehicleUnitType(unit.bookableUnitTypeCode);

    const quantity = holds.length;

    // P2.2B guest-capacity enforcement — the real, authoritative gate;
    // the client's own pre-submit check (ListingReservationWidget) is UX
    // only. `guestCount` is optional (existing callers, and any item
    // where the customer never entered one, are left unenforced — never
    // blocking a request that doesn't claim a guest count at all).
    // A unit with `maxGuests === null` (a legacy unit, or any
    // non-accommodation type that never populates it) has no truthful
    // capacity to check against, so no limit is invented for it either —
    // this mirrors `#resolveItem`'s own "a legacy unit's resolved price
    // is unchanged" precedent for `basePriceAmount` above.
    if (
      item.guestCount !== undefined &&
      unit.maxGuests !== null &&
      unit.maxGuests !== undefined
    ) {
      const allowedGuests = unit.maxGuests * quantity;
      if (item.guestCount > allowedGuests) {
        throw new ValidationError(
          `Guest count (${item.guestCount}) exceeds this unit's capacity of ${allowedGuests} (${unit.maxGuests} guest(s) x ${quantity} unit(s)).`,
          [{ field: 'items', issue: 'GUEST_CAPACITY_EXCEEDED' }],
        );
      }
    }

    // Prices (and the capacity `reserveCapacity` already consumed for
    // this hold) cover only the actually-occupied range — for lodging
    // (HOTEL_ROOM/PROPERTY_UNIT) that's checkout-exclusive nights, not
    // the full [dateFrom, dateTo] the guest picked. See
    // `accommodationDateSemantics.js`.
    const consumedRange = resolveConsumedRange(
      unit.bookableUnitTypeCode,
      firstHold.dateFrom,
      firstHold.dateTo,
    );
    const prices = await this.#availabilityService.getPricingForRange(
      {
        unitId: firstHold.bookableUnitId,
        dateFrom: consumedRange.dateFrom,
        dateTo: consumedRange.dateTo,
      },
      connection,
    );
    const dates = enumerateDates(consumedRange.dateFrom, consumedRange.dateTo);
    const overrideByDate = new Map(prices.map((price) => [price.date, price]));

    // Rung 3 needs the listing's own flat price — fetched once up front
    // (same eager-fetch shape `availabilityService.js#getCalendar` uses
    // for the identical precedence chain, P2.2B) rather than only when a
    // date turns out to need it; simpler control flow, and `getListing`
    // is cheap next to the per-date work already happening here.
    const listing = await this.#listingService.getListing(
      principal,
      unit.listingId,
    );
    const listingBasePrice = listing.pricing;

    const resolvedPrices = dates.map((date) => {
      const override = overrideByDate.get(date);
      const resolved = resolvePriceForDate({
        overrideAmount: override?.amount,
        overrideCurrencyCode: override?.currencyCode,
        unitBaseAmount: unit.basePriceAmount,
        unitBaseCurrencyCode: unit.basePriceCurrencyCode,
        listingBaseAmount: listingBasePrice?.amount,
        listingBaseCurrencyCode: listingBasePrice?.currencyCode,
      });
      if (!resolved) {
        throw new ValidationError(
          'One or more requested dates has no price set for this unit.',
          [{ field: 'items', issue: 'PRICING_INCOMPLETE' }],
        );
      }
      return resolved;
    });
    const { currencyCode } = resolvedPrices[0];
    if (resolvedPrices.some((price) => price.currencyCode !== currencyCode)) {
      throw new ValidationError(
        'All dates within one booking item must share the same currency.',
        [{ field: 'items', issue: 'PRICING_CURRENCY_MISMATCH' }],
      );
    }

    let unitPrice = Money.zero(currencyCode);
    resolvedPrices.forEach((price) => {
      unitPrice = unitPrice.add(
        Money.fromDecimalString(String(price.amount), currencyCode),
      );
    });

    return {
      bookableUnitId: firstHold.bookableUnitId,
      // P2.2E: snapshotted onto `booking_items.unit_label_snapshot` at
      // creation time (see `createBooking` below) so a later rename of
      // this unit can never retroactively change what this booking
      // displays.
      unitLabel: unit.unitLabel,
      // Sprint A (Time-Aware Booking Foundation): the unit's own
      // authoritative `time_slot_start`/`time_slot_end` (display-only
      // `TIME` columns — see `bookableUnitTypes.js`), snapshotted the same
      // way `unitLabel` already is, right below. Never derived from
      // anything the client sent — the client only ever supplies
      // `bookableUnitId`, so a time-slot booking's exact time is exactly
      // as tamper-proof as its price already was.
      //
      // Sprint B (Car Rental Pickup/Return Interval): a VEHICLE unit has
      // no `time_slot_start/end` of its own (no partner-authored default
      // exists to derive it from) — its pickup/return time is a genuine
      // customer choice, already validated once at hold-creation
      // (`AvailabilityService#reserveCapacity`) and read back here off
      // the consumed hold, never re-trusted from fresh client input at
      // booking-creation time (`item` is never read for this).
      timeSlotStart: isVehicle ? firstHold.startTime : unit.timeSlotStart,
      timeSlotEnd: isVehicle ? firstHold.endTime : unit.timeSlotEnd,
      // Same-location-return-only model (see `formatListingLocationLabel`)
      // — both snapshots are the listing's own location today, never
      // client-supplied, so there is nothing here for a client to tamper.
      pickupLocationSnapshot: isVehicle
        ? formatListingLocationLabel(listing.location)
        : null,
      returnLocationSnapshot: isVehicle
        ? formatListingLocationLabel(listing.location)
        : null,
      dateFrom: firstHold.dateFrom,
      dateTo: firstHold.dateTo,
      quantity,
      unitPrice,
      currencyCode,
      listingId: unit.listingId,
      bookableUnitTypeCode: unit.bookableUnitTypeCode,
      guests: item.guests ?? [],
    };
  }

  /**
   * Converts one or more already-granted holds into a real, auditable
   * booking. All items must resolve to the same listing (schema-enforced:
   * `bookings.listing_id`/`partner_id` are singular columns) and the same
   * bookable unit type (so `booking_type_id`, also a singular column,
   * stays well-defined).
   */
  async createBooking(
    principal,
    { items, customerNotes, guestContactSnapshot },
  ) {
    if (!principal) throw new AuthenticationError();

    const booking = await withTransaction(async (connection) => {
      const resolvedItems = [];
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop -- each item's holds are consumed sequentially within one transaction.
        const resolved = await this.#resolveItem(
          item,
          principal.userId,
          connection,
          principal,
        );
        resolvedItems.push(resolved);
      }

      const [first] = resolvedItems;
      resolvedItems.forEach((resolved) => {
        if (resolved.listingId !== first.listingId) {
          throw new ValidationError(
            'All items in one booking must belong to the same listing.',
            [{ field: 'items', issue: 'MULTI_LISTING_BOOKING' }],
          );
        }
        if (resolved.bookableUnitTypeCode !== first.bookableUnitTypeCode) {
          throw new ValidationError(
            'All items in one booking must share the same bookable unit type.',
            [{ field: 'items', issue: 'MIXED_UNIT_TYPES' }],
          );
        }
        if (resolved.currencyCode !== first.currencyCode) {
          throw new ValidationError(
            'All items in one booking must share the same currency.',
            [{ field: 'items', issue: 'PRICING_CURRENCY_MISMATCH' }],
          );
        }
      });

      const listing = await this.#listingService.getListing(
        principal,
        first.listingId,
      );

      let subtotal = Money.zero(first.currencyCode);
      resolvedItems.forEach((resolved) => {
        subtotal = subtotal.add(resolved.unitPrice.multiply(resolved.quantity));
      });

      const currency = await findCurrencyByCode(first.currencyCode, connection);
      const bookingTypeCode = resolveBookingTypeCode(
        first.bookableUnitTypeCode,
      );
      const [bookingTypeId, statusId, paymentStatusId] = await Promise.all([
        this.#bookingRepository.findBookingTypeIdByCode(
          bookingTypeCode,
          connection,
        ),
        this.#bookingRepository.findStatusIdByCode(
          'PENDING_VENDOR',
          connection,
        ),
        this.#bookingRepository.findPaymentStatusIdByCode(
          'NOT_REQUIRED_ON_PLATFORM',
          connection,
        ),
      ]);

      let createdBooking;
      for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop -- a duplicate reference is only known after the insert attempt.
          createdBooking = await this.#bookingRepository.createBooking(
            {
              bookingReference: generateBookingReference(),
              customerUserId: principal.userId,
              partnerId: listing.partnerId,
              listingId: first.listingId,
              bookingTypeId,
              statusId,
              customerNotes,
              guestContactSnapshot,
              currencyId: currency.id,
              subtotalAmount: subtotal.toDecimalString(),
              totalAmount: subtotal.toDecimalString(),
              paymentStatusId,
              requestedAt: new Date(),
              createdBy: principal.userId,
            },
            connection,
          );
          break;
        } catch (err) {
          const isLastAttempt = attempt === MAX_REFERENCE_ATTEMPTS - 1;
          if (err.code !== 'CONFLICT' || isLastAttempt) throw err;
        }
      }

      for (const resolved of resolvedItems) {
        // eslint-disable-next-line no-await-in-loop
        const bookingItemId = await this.#bookingRepository.createBookingItem(
          {
            bookingId: createdBooking.id,
            bookableUnitId: resolved.bookableUnitId,
            unitLabelSnapshot: resolved.unitLabel,
            dateFrom: resolved.dateFrom,
            dateTo: resolved.dateTo,
            startTime: resolved.timeSlotStart,
            endTime: resolved.timeSlotEnd,
            pickupLocationSnapshot: resolved.pickupLocationSnapshot,
            returnLocationSnapshot: resolved.returnLocationSnapshot,
            quantity: resolved.quantity,
            unitPriceAmount: resolved.unitPrice.toDecimalString(),
          },
          connection,
        );
        for (const guest of resolved.guests) {
          // eslint-disable-next-line no-await-in-loop
          await this.#bookingRepository.createBookingGuest(
            {
              bookingItemId,
              fullName: guest.fullName,
              documentNumber: guest.documentNumber,
            },
            connection,
          );
        }
      }

      await this.#bookingRepository.createStatusHistory(
        {
          bookingId: createdBooking.id,
          fromStatusId: null,
          toStatusId: statusId,
          changedBy: principal.userId,
        },
        connection,
      );

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'booking.created',
          targetType: 'booking',
          targetId: createdBooking.id,
          afterSnapshot: {
            listingId: first.listingId,
            totalAmount: subtotal.toDecimalString(),
          },
        },
        connection,
      );

      return this.#hydrate(createdBooking, connection);
    });

    // Published after the transaction commits (Scope decision #10) — a
    // notification/email failure can never roll back or block a booking.
    await this.#eventBus.publish(
      createDomainEvent({
        eventType: EVENT_TYPES.BOOKING_CREATED,
        actorId: principal.userId,
        resourceType: 'booking',
        resourceId: booking.id,
        payload: {
          bookingReference: booking.bookingReference,
          listingId: booking.listingId,
          partnerId: booking.partnerId,
          customerUserId: booking.customerUserId,
          totalAmount: booking.totalAmount,
        },
      }),
    );

    return booking;
  }

  async #hydrate(booking, connection) {
    const items = await this.#bookingRepository.findItemsForBooking(
      booking.id,
      connection,
    );
    const guests = await this.#bookingRepository.findGuestsForBookingItems(
      items.map((item) => item.id),
      connection,
    );
    // Resolves who a customer can message about this booking (the
    // partner's owner/primary user — see `partnerService.getOwnerUserId`,
    // already used server-side by the notifications listener). Read-only,
    // display-only enrichment on the single-booking shape, never the list
    // summary — matches `mysqlSearchRepository.js`'s "join purely to
    // enrich a response" convention, just via a Service call instead of a
    // repository join since `partners` is a different module's table.
    const partnerOwnerUserId = this.#partnerService
      ? await this.#partnerService.getOwnerUserId(booking.partnerId)
      : null;
    return {
      ...booking,
      partnerOwnerUserId,
      items: items.map((item) => ({
        ...item,
        guests: guests.filter((guest) => guest.bookingItemId === item.id),
      })),
    };
  }

  /** 404-masked: visible to the booking's own customer, the listing's partner owner/staff, or `booking.view_all`. */
  async getBooking(principal, id) {
    const booking = await this.#bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking not found.');
    if (!principal) throw new NotFoundError('Booking not found.');

    const isCustomer = booking.customerUserId === principal.userId;
    if (!isCustomer) {
      const allowed = await this.#isOwnerOrHasPermission(
        principal,
        booking.partnerId,
        VIEW_ALL_PERMISSION,
      );
      if (!allowed) throw new NotFoundError('Booking not found.');
    }
    return this.#hydrate(booking);
  }

  /**
   * Stage 11.4 (Admin Platform — Booking Operations): `GET /bookings/:id/history`
   * — same 404-masked visibility rule as `getBooking` (the history of a
   * booking you can't see doesn't exist, as far as the caller knows).
   * Surfaces `booking_status_history` (written by every `#applyTransition`
   * call since Sprint 10, never read anywhere until now).
   */
  async getStatusHistory(principal, id) {
    const booking = await this.#bookingRepository.findById(id);
    if (!booking) throw new NotFoundError('Booking not found.');
    if (!principal) throw new NotFoundError('Booking not found.');

    const isCustomer = booking.customerUserId === principal.userId;
    if (!isCustomer) {
      const allowed = await this.#isOwnerOrHasPermission(
        principal,
        booking.partnerId,
        VIEW_ALL_PERMISSION,
      );
      if (!allowed) throw new NotFoundError('Booking not found.');
    }
    return this.#bookingRepository.findStatusHistoryForBooking(id);
  }

  /**
   * Visibility: an explicit `partnerId` filter requires owner-or-
   * `booking.view_all` for that partner; an explicit `viewAll` flag
   * requires the platform-wide `booking.view_all` permission; otherwise
   * defaults to the caller's own bookings as a customer (the common
   * "My Trips" case, self-service, no permission needed).
   */
  async listBookings(principal, filters = {}, paginationOpts = {}) {
    if (!principal) throw new AuthenticationError();
    const {
      partnerId,
      viewAll,
      status,
      customerUserId,
      refundStatus,
      unitId,
      from,
      to,
    } = filters;

    if (partnerId !== undefined) {
      await this.#assertOwnerOrPermission(
        principal,
        partnerId,
        VIEW_ALL_PERMISSION,
      );
      // Sprint D-2: `unitId`/`from`/`to` only ever narrow WITHIN this
      // already-ownership-checked partner's own bookings (the repository
      // still ANDs `b.partner_id = ?`) — never a way to discover another
      // partner's bookings by guessing a unit id.
      return this.#bookingRepository.list(
        {
          partnerId,
          statusCode: status,
          refundStatus,
          includeNames: true,
          unitId,
          dateFrom: from,
          dateTo: to,
        },
        paginationOpts,
      );
    }
    // Phase 11 Admin Platform: an admin looking up one specific
    // customer's booking history (e.g. from the User Management detail
    // page) — requires the same platform-wide permission `viewAll` does,
    // since it's equally "not my own bookings."
    if (customerUserId !== undefined) {
      const isAdmin = await this.#permissionResolver.hasPermission(
        principal.roles,
        VIEW_ALL_PERMISSION,
      );
      if (!isAdmin) throw new AuthorizationError();
      return this.#bookingRepository.list(
        {
          customerUserId,
          statusCode: status,
          refundStatus,
          includeNames: true,
        },
        paginationOpts,
      );
    }
    if (viewAll) {
      const isAdmin = await this.#permissionResolver.hasPermission(
        principal.roles,
        VIEW_ALL_PERMISSION,
      );
      if (!isAdmin) throw new AuthorizationError();
      return this.#bookingRepository.list(
        { statusCode: status, refundStatus, includeNames: true },
        paginationOpts,
      );
    }
    return this.#bookingRepository.list(
      { customerUserId: principal.userId, statusCode: status, refundStatus },
      paginationOpts,
    );
  }

  /**
   * Shared status-transition machinery: validates the transition against
   * the existing domain state machine, writes the new status + one
   * timestamp column + a `booking_status_history` row, and — when
   * `restoreCapacity` is set — returns each future-dated item's capacity
   * to `availability_calendar`. Runs inside the caller's transaction.
   */
  async #applyTransition(
    booking,
    toStatusCode,
    { changedBy, timestampField, cancellationReason, restoreCapacity = false },
    connection,
  ) {
    if (!isValidBookingStatusTransition(booking.statusCode, toStatusCode)) {
      throw new ConflictError(
        `Cannot transition a booking from ${booking.statusCode} to ${toStatusCode}.`,
        'INVALID_BOOKING_TRANSITION',
      );
    }

    const toStatusId = await this.#bookingRepository.findStatusIdByCode(
      toStatusCode,
      connection,
    );
    await this.#bookingRepository.updateStatus(
      booking.id,
      {
        statusId: toStatusId,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
        ...(cancellationReason !== undefined ? { cancellationReason } : {}),
      },
      connection,
    );
    await this.#bookingRepository.createStatusHistory(
      {
        bookingId: booking.id,
        fromStatusId: booking.statusId,
        toStatusId,
        changedBy,
      },
      connection,
    );

    // Single choke point for every status-transition method below
    // (confirm/reject/cancel/complete/no-show/expire) — one audit call
    // here covers all of them, rather than duplicating it six times.
    // `changedBy` is null for the automated SLA sweep (`expireStaleBookings`),
    // which `AuditLogger.record` explicitly allows for system actions.
    await this.#auditLogger.record(
      {
        actorId: changedBy,
        action: 'booking.status_changed',
        targetType: 'booking',
        targetId: booking.id,
        beforeSnapshot: { status: booking.statusCode },
        afterSnapshot: { status: toStatusCode },
      },
      connection,
    );

    if (restoreCapacity) {
      const items = await this.#bookingRepository.findItemsForBooking(
        booking.id,
        connection,
      );
      const today = todayDateString();
      for (const item of items) {
        if (item.dateTo >= today) {
          // eslint-disable-next-line no-await-in-loop
          await this.#availabilityService.releaseBookedCapacity(
            {
              unitId: item.bookableUnitId,
              dateFrom: item.dateFrom,
              dateTo: item.dateTo,
              quantity: item.quantity,
              bookingId: booking.id,
              actorUserId: changedBy,
            },
            connection,
          );
        }
      }
    }

    return this.#hydrate(
      await this.#bookingRepository.findById(booking.id, connection),
      connection,
    );
  }

  /** Shared publish step for confirm/reject/cancel/complete — always after the transaction has committed. */
  async #publishBookingEvent(eventType, principal, booking) {
    await this.#eventBus.publish(
      createDomainEvent({
        eventType,
        actorId: principal.userId,
        resourceType: 'booking',
        resourceId: booking.id,
        payload: {
          bookingReference: booking.bookingReference,
          partnerId: booking.partnerId,
          customerUserId: booking.customerUserId,
        },
      }),
    );
  }

  async confirmBooking(principal, id) {
    if (!principal) throw new AuthenticationError();
    const booking = await withTransaction(async (connection) => {
      const locked = await this.#bookingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Booking not found.');
      await this.#assertOwnerOrPermission(
        principal,
        locked.partnerId,
        CONFIRM_PERMISSION,
      );
      return this.#applyTransition(
        locked,
        'CONFIRMED',
        { changedBy: principal.userId, timestampField: 'confirmedAt' },
        connection,
      );
    });
    await this.#publishBookingEvent(
      EVENT_TYPES.BOOKING_CONFIRMED,
      principal,
      booking,
    );
    // Manual-capture booking payment flow: capturing money is a separate
    // unit of work from the status transition above (the same "own
    // transaction, never held open across a call into another module"
    // rule as `#resolvePaymentForCancelledBooking`), so it runs only after
    // the confirmation has already committed.
    await this.#capturePaymentForConfirmedBooking(booking);
    return booking;
  }

  async #capturePaymentForConfirmedBooking(booking) {
    if (!this.#paymentService) return;
    const authorizedPayment =
      await this.#paymentService.getAuthorizedPaymentForBookingSystemInternal(
        booking.id,
      );
    if (!authorizedPayment) return;
    try {
      await this.#paymentService.capturePaymentForBookingSystemInternal(
        authorizedPayment.id,
      );
    } catch (err) {
      // The booking is already CONFIRMED — that decision is not rolled
      // back by a capture failure. The payment itself stays AUTHORIZED
      // (safe to retry; see `PaymentService#executeCaptureOrVoid`'s own
      // comment), so this is a queryable, recoverable operational state,
      // not silently lost money.
      log.error(
        { err, bookingId: booking.id, paymentId: authorizedPayment.id },
        'Payment capture failed on booking confirmation',
      );
    }
  }

  async rejectBooking(principal, id, { reason } = {}) {
    if (!principal) throw new AuthenticationError();
    const booking = await withTransaction(async (connection) => {
      const locked = await this.#bookingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Booking not found.');
      await this.#assertOwnerOrPermission(
        principal,
        locked.partnerId,
        REJECT_PERMISSION,
      );
      return this.#applyTransition(
        locked,
        'REJECTED',
        {
          changedBy: principal.userId,
          timestampField: 'rejectedAt',
          cancellationReason: reason,
          restoreCapacity: true,
        },
        connection,
      );
    });
    await this.#publishBookingEvent(
      EVENT_TYPES.BOOKING_REJECTED,
      principal,
      booking,
    );
    // Manual-capture booking payment flow: releasing the customer's
    // authorization is a separate unit of work from the status transition
    // above, run only after the rejection has already committed — same
    // reasoning as `#capturePaymentForConfirmedBooking`.
    await this.#voidAuthorizedPaymentForBooking(
      booking,
      'Payment void failed on booking rejection',
    );
    return booking;
  }

  /**
   * Shared by `rejectBooking` and `#resolvePaymentForCancelledBooking`:
   * releases an `AUTHORIZED`-but-not-yet-captured payment for a booking, if
   * one exists (each caller resolves its own, since one needs the lookup
   * result to decide whether to fall through to refund-policy logic). A
   * void failure never rolls back the booking decision that already
   * committed (`rejectBooking`'s/`cancelBooking`'s own transaction) — the
   * payment simply stays `AUTHORIZED`, a queryable, recoverable
   * operational state, never silently lost money.
   */
  async #voidAuthorizedPaymentForBooking(booking, logMessage) {
    if (!this.#paymentService) return;
    const authorizedPayment =
      await this.#paymentService.getAuthorizedPaymentForBookingSystemInternal(
        booking.id,
      );
    if (!authorizedPayment) return;
    await this.#executePaymentVoid(booking, authorizedPayment, logMessage);
  }

  async #executePaymentVoid(booking, authorizedPayment, logMessage) {
    try {
      await this.#paymentService.voidPaymentForBookingSystemInternal(
        authorizedPayment.id,
      );
    } catch (err) {
      log.error(
        { err, bookingId: booking.id, paymentId: authorizedPayment.id },
        logMessage,
      );
    }
  }

  /**
   * Self-service for the booking's own customer (`CANCELLED_BY_CUSTOMER`,
   * no permission needed) or the listing's partner owner/staff/
   * `booking.cancel_any` admin (`CANCELLED_BY_VENDOR`) — one endpoint,
   * the terminal status resolved from the caller's own identity.
   */
  async cancelBooking(principal, id, { reason } = {}) {
    if (!principal) throw new AuthenticationError();
    let cancelledByRole;
    const booking = await withTransaction(async (connection) => {
      const locked = await this.#bookingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Booking not found.');

      const isCustomer = locked.customerUserId === principal.userId;
      const isVendorSide =
        !isCustomer &&
        (await this.#isOwnerOrHasPermission(
          principal,
          locked.partnerId,
          CANCEL_ANY_PERMISSION,
        ));
      if (!isCustomer && !isVendorSide) throw new AuthorizationError();
      cancelledByRole = isCustomer ? 'CUSTOMER' : 'VENDOR';

      return this.#applyTransition(
        locked,
        isCustomer ? 'CANCELLED_BY_CUSTOMER' : 'CANCELLED_BY_VENDOR',
        {
          changedBy: principal.userId,
          timestampField: 'cancelledAt',
          cancellationReason: reason,
          restoreCapacity: true,
        },
        connection,
      );
    });
    await this.#publishBookingEvent(
      EVENT_TYPES.BOOKING_CANCELLED,
      principal,
      booking,
    );
    // P0.2 (Master Roadmap): a refund is a separate unit of work from the
    // status transition above (PaymentService opens its own transaction —
    // this codebase's own rule against holding one transaction open
    // across a call into another module, see transaction.js's header
    // comment), so it runs after the cancellation has already committed.
    // A refund outcome — success, failure, or "needs a human" — must
    // never be silent; `resolvePaymentForCancelledBooking` always leaves
    // `bookings.refund_status` in a well-defined, queryable state.
    await this.#resolvePaymentForCancelledBooking(booking, cancelledByRole);
    return this.#bookingRepository.findById(booking.id);
  }

  /**
   * Manual-capture booking payment flow: a booking can be cancelled by
   * its customer (or the vendor, via `booking.cancel_any`) BEFORE the
   * vendor has ever confirmed/rejected it — at that point the payment is
   * still `AUTHORIZED`, not yet captured, so there is no money to refund
   * at all, only an authorization to release. That case is handled first
   * and is mutually exclusive with the refund-policy branch below (a
   * booking has at most one non-terminal payment at a time —
   * `findActiveForBooking`'s own guard).
   */
  async #resolvePaymentForCancelledBooking(booking, cancelledByRole) {
    if (!this.#paymentService) return;

    const authorizedPayment =
      await this.#paymentService.getAuthorizedPaymentForBookingSystemInternal(
        booking.id,
      );
    if (authorizedPayment) {
      await this.#executePaymentVoid(
        booking,
        authorizedPayment,
        'Payment void failed on booking cancellation',
      );
      return;
    }

    const refundablePayment =
      await this.#paymentService.getRefundablePaymentForBookingSystemInternal(
        booking.id,
      );
    const action = resolveCancellationRefundAction({
      cancelledByRole,
      refundablePayment,
    });

    if (action === CANCELLATION_REFUND_ACTIONS.NO_REFUND_DUE) {
      return;
    }

    if (action === CANCELLATION_REFUND_ACTIONS.REQUIRES_MANUAL_REVIEW) {
      await this.#bookingRepository.updateRefundStatus(
        booking.id,
        'REQUIRES_MANUAL_REVIEW',
      );
      await this.#eventBus.publish(
        createDomainEvent({
          eventType: EVENT_TYPES.REFUND_REVIEW_REQUIRED,
          actorId: null,
          resourceType: 'booking',
          resourceId: booking.id,
          payload: {
            bookingReference: booking.bookingReference,
            partnerId: booking.partnerId,
            customerUserId: booking.customerUserId,
            paymentId: refundablePayment.id,
          },
        }),
      );
      return;
    }

    // AUTO_REFUND_FULL — a vendor/admin cancelled a paid booking; the
    // customer didn't choose this, so this is not held pending a human
    // decision. The refundable balance (captured minus any prior partial
    // refund) mirrors exactly what `PaymentService#createRefund` itself
    // computes for the admin-triggered path — never invented here, and
    // never plain float arithmetic on a decimal string (Money exists
    // specifically to rule that class of bug out).
    const captured = Money.fromDecimalString(
      refundablePayment.capturedAmount,
      refundablePayment.currencyCode,
    );
    const alreadyRefunded = Money.fromDecimalString(
      refundablePayment.refundedAmount ?? '0.00',
      refundablePayment.currencyCode,
    );
    const refundableAmount = captured
      .subtract(alreadyRefunded)
      .toDecimalString();
    try {
      await this.#paymentService.issueSystemRefund(refundablePayment.id, {
        amount: refundableAmount,
        reason: 'Automatic refund — booking cancelled by the vendor.',
        idempotencyKey: `auto-refund:booking:${booking.id}`,
      });
      await this.#bookingRepository.updateRefundStatus(
        booking.id,
        'AUTO_REFUNDED',
      );
    } catch (err) {
      log.error(
        { err, bookingId: booking.id, paymentId: refundablePayment.id },
        'Automatic refund failed on vendor-side booking cancellation',
      );
      await this.#bookingRepository.updateRefundStatus(
        booking.id,
        'REFUND_FAILED',
      );
    }
  }

  /** No dedicated `booking.complete`/`booking.no_show` permission is seeded; reuses `booking.confirm` (owner-fallback still applies), same reuse-when-none-fits precedent as Sprint 9's `listing.update`/`listing.moderate`. */
  async completeBooking(principal, id) {
    if (!principal) throw new AuthenticationError();
    const booking = await withTransaction(async (connection) => {
      const locked = await this.#bookingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Booking not found.');
      await this.#assertOwnerOrPermission(
        principal,
        locked.partnerId,
        CONFIRM_PERMISSION,
      );
      return this.#applyTransition(
        locked,
        'COMPLETED',
        { changedBy: principal.userId, timestampField: 'completedAt' },
        connection,
      );
    });
    await this.#publishBookingEvent(
      EVENT_TYPES.BOOKING_COMPLETED,
      principal,
      booking,
    );
    return booking;
  }

  /**
   * Stripe go-live preflight (manual-capture async-authorization case) —
   * a plain, no-principal read of `bookings.status_id`'s own code, so
   * `PaymentService`'s webhook handler can decide whether a just-completed
   * Stripe authorization should be captured (booking already CONFIRMED)
   * or voided (booking already REJECTED/cancelled) without needing a
   * second Repository over `bookings` (same cross-module rule every other
   * `*SystemInternal` method on this class already follows). Never
   * exposed via any HTTP route.
   */
  async getBookingStatusSystemInternal(bookingId) {
    const booking = await this.#bookingRepository.findById(bookingId);
    return booking?.statusCode ?? null;
  }

  /**
   * Phase 16 (Payment Infrastructure) — the ONE narrow integration point
   * between the new Payments module and Bookings: writes only
   * `bookings.payment_status_id`, the coarse booking-facing payment
   * summary column that has existed since Sprint 5 for exactly this
   * purpose. `bookings.status_id` (the vendor-confirmation workflow) is
   * completely untouched by online payment outcomes — this method never
   * calls `#applyTransition`. `BookingService` still exclusively owns the
   * write (mirrors the class header's "no module other than bookings
   * mutates status directly" rule); `PaymentService` calls this the same
   * way Reviews/AI already depend on Booking's public Service interface,
   * never a second Repository over `bookings`. No principal is required —
   * payment truth is established server-side by `PaymentService`/the
   * provider, never by a caller's claim, so this is system-callable by
   * design. Accepts the caller's transaction `connection` so a payment's
   * status write and this booking update commit atomically together.
   */
  async recordPaymentOutcome(
    bookingId,
    paymentStatusCode,
    { connection } = {},
  ) {
    const paymentStatusId =
      await this.#bookingRepository.findPaymentStatusIdByCode(
        paymentStatusCode,
        connection,
      );
    if (!paymentStatusId) {
      throw new ValidationError(
        `Unknown payment status code "${paymentStatusCode}".`,
      );
    }
    await this.#bookingRepository.updatePaymentStatus(
      bookingId,
      paymentStatusId,
      connection,
    );
  }

  /**
   * Launch-blocker remediation (P0-B) — the manual-refund-review
   * counterpart to `recordPaymentOutcome` immediately above: same
   * system-callable, no-principal, connection-accepting shape, called
   * only from `PaymentService#executeRefund`'s success branch, after a
   * refund has genuinely succeeded with the provider. Conditional by
   * construction (`transitionRefundStatus`'s WHERE clause) — a booking
   * that was never `REQUIRES_MANUAL_REVIEW` (an unrelated refund) is left
   * untouched, and a second, duplicate call safely no-ops.
   */
  async resolveManualReviewRefundSystemInternal(
    bookingId,
    { connection } = {},
  ) {
    return this.#bookingRepository.transitionRefundStatus(
      bookingId,
      { fromStatus: 'REQUIRES_MANUAL_REVIEW', toStatus: 'MANUALLY_REFUNDED' },
      connection,
    );
  }

  /**
   * Launch-blocker remediation (P0-B) — the admin action for closing a
   * `REQUIRES_MANUAL_REVIEW` booking without issuing a refund (the policy
   * says non-refundable, or the matter was resolved out-of-band). Moves
   * no money and creates no refund/payment record — it only writes
   * `bookings.refund_status` plus an audit trail. Only valid coming from
   * `REQUIRES_MANUAL_REVIEW`; already being at `RESOLVED_NO_REFUND` is
   * treated as a safe, idempotent no-op (no duplicate audit entry) so a
   * retried/double-clicked request can never error or double-write. Any
   * other current state is a genuine conflict (e.g. it was already
   * refunded, or was never awaiting review) and is rejected loudly rather
   * than silently reinterpreted.
   */
  async resolveRefundReviewWithoutRefund(principal, id, { reason } = {}) {
    if (!principal) throw new AuthenticationError();
    const canResolve = await this.#permissionResolver.hasPermission(
      principal.roles,
      REFUND_REVIEW_PERMISSION,
    );
    if (!canResolve) throw new AuthorizationError();

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason) {
      throw new ValidationError(
        'A reason is required to resolve a refund review without a refund.',
        [{ field: 'reason', issue: 'REQUIRED' }],
      );
    }

    return withTransaction(async (connection) => {
      const locked = await this.#bookingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Booking not found.');

      if (locked.refundStatus === 'RESOLVED_NO_REFUND') {
        return locked;
      }
      if (locked.refundStatus !== 'REQUIRES_MANUAL_REVIEW') {
        throw new ConflictError(
          `Cannot resolve refund review for a booking whose refund_status is ${locked.refundStatus}.`,
          'REFUND_REVIEW_NOT_PENDING',
        );
      }

      await this.#bookingRepository.transitionRefundStatus(
        id,
        {
          fromStatus: 'REQUIRES_MANUAL_REVIEW',
          toStatus: 'RESOLVED_NO_REFUND',
        },
        connection,
      );
      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'booking.refund_review_resolved',
          targetType: 'booking',
          targetId: id,
          beforeSnapshot: { refundStatus: 'REQUIRES_MANUAL_REVIEW' },
          afterSnapshot: {
            refundStatus: 'RESOLVED_NO_REFUND',
            outcome: 'RESOLVED_NO_REFUND',
            reason: trimmedReason,
          },
        },
        connection,
      );

      return this.#bookingRepository.findById(id, connection);
    });
  }

  async markNoShow(principal, id) {
    if (!principal) throw new AuthenticationError();
    return withTransaction(async (connection) => {
      const booking = await this.#bookingRepository.lockById(id, connection);
      if (!booking) throw new NotFoundError('Booking not found.');
      await this.#assertOwnerOrPermission(
        principal,
        booking.partnerId,
        CONFIRM_PERMISSION,
      );
      return this.#applyTransition(
        booking,
        'NO_SHOW',
        { changedBy: principal.userId },
        connection,
      );
    });
  }

  /**
   * The scheduled `PENDING_VENDOR` SLA sweep's entry point (called by
   * `jobs/pendingVendorSlaSweep.js`, never by an HTTP route) — separate
   * from the much-shorter reservation-hold TTL sweep in the
   * `booking-holds` module; this one operates on already-created
   * bookings, not pre-booking holds.
   *
   * @returns {Promise<number>} how many bookings were auto-expired
   */
  async expireStaleBookings(slaHours, limit = 100) {
    return withTransaction(async (connection) => {
      const stale = await this.#bookingRepository.findPendingVendorPastSla(
        slaHours,
        limit,
        connection,
      );
      for (const booking of stale) {
        // eslint-disable-next-line no-await-in-loop
        await this.#applyTransition(
          booking,
          'EXPIRED',
          { changedBy: null, restoreCapacity: true },
          connection,
        );
      }
      return stale.length;
    });
  }
}

export default BookingService;

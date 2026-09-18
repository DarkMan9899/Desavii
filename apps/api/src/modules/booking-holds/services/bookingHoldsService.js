/**
 * BookingHoldsService — public Service for the Booking-Holds module
 * (Sprint 10, Module Catalog #17, deliberately scoped down from
 * `BACKEND_ARCHITECTURE.md`'s aspirational entry — no Pricing/Payments/
 * `DistributedLockManager` dependency, since none of those exist yet;
 * see the approved Sprint 10 proposal §1/§13 for the documented gap).
 *
 * Owns no table of its own — `reservation_holds` stays owned by
 * Availability (same as its other three tables), and this Service is a
 * pure caller of `AvailabilityService`'s public capacity-reservation
 * capability (`reserveCapacity`/`releaseHold`/`listActiveHoldsForUser`),
 * exactly the cross-module Service-dependency rule Sprint 9 established
 * for `AvailabilityService -> ListingService`. This module never touches
 * `availability_calendar`/`bookable_units`/`blackout_dates` directly.
 *
 * A hold has no status column — its lifecycle is entirely "exists,"
 * "consumed" (deleted by `BookingService` converting it into a booking,
 * elsewhere), "released" (deleted here, explicit customer action), or
 * "expired" (deleted by the scheduled sweep, `jobs/holdExpirySweep.js`).
 */

import { AuthenticationError } from '../../../errors/AppError.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import config from '../../../config/index.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';

export class BookingHoldsService {
  #availabilityService;

  #eventBus;

  constructor({ availabilityService, eventBus = createNoOpEventBus() }) {
    this.#availabilityService = availabilityService;
    this.#eventBus = eventBus;
  }

  /**
   * Grants a hold for every requested item in one transaction — if any
   * item's capacity/blackout check fails, none of the items are held
   * (§13 of the approved proposal: all-or-nothing per request).
   */
  async createHolds(principal, { items }) {
    if (!principal) throw new AuthenticationError();

    const expiresAt = new Date(
      Date.now() + config.booking.holdDurationMinutes * 60_000,
    );

    const outcome = await withTransaction(async (connection) => {
      const results = [];
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop -- each item's hold must be granted within the same all-or-nothing transaction.
        const result = await this.#availabilityService.reserveCapacity(
          {
            unitId: item.bookableUnitId,
            dateFrom: item.dateFrom,
            dateTo: item.dateTo,
            // Sprint B (Car Rental Pickup/Return Interval) — silently
            // ignored by `reserveCapacity` for every non-VEHICLE unit
            // type, so this is never a way to set a Tour's departure time.
            startTime: item.startTime,
            endTime: item.endTime,
            quantity: item.quantity,
            expiresAt,
            userId: principal.userId,
          },
          connection,
        );
        results.push(result);
      }
      return { items: results, expiresAt };
    });

    // Step A2 (Engagement Analytics): published after the transaction
    // commits, never inside it — same "a notification/analytics failure
    // can never roll back or block a booking" rule `BookingService`
    // already applies to its own domain events. One event per held item
    // (each carries its own server-resolved listing_id/partner_id).
    await Promise.all(
      outcome.items.map((item) =>
        this.#eventBus.publish(
          createDomainEvent({
            eventType: EVENT_TYPES.BOOKING_HOLD_CREATED,
            actorId: principal.userId,
            resourceType: 'listing',
            resourceId: item.listingId,
            payload: { listingId: item.listingId, partnerId: item.partnerId },
          }),
        ),
      ),
    );

    return outcome;
  }

  /** Self-service: the caller's own active (non-expired) holds. */
  async listHolds(principal) {
    if (!principal) throw new AuthenticationError();
    return this.#availabilityService.listActiveHoldsForUser(principal.userId);
  }

  /** Releases the caller's own holds, restoring the capacity they consumed. */
  async releaseHolds(principal, holdIds) {
    if (!principal) throw new AuthenticationError();
    await withTransaction((connection) =>
      this.#availabilityService.releaseHold(
        { holdIds, userId: principal.userId },
        connection,
      ),
    );
  }
}

export default BookingHoldsService;

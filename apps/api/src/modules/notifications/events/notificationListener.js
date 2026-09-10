/**
 * NotificationListener — Phase 13.
 *
 * Registers this module's `DomainEventBus` subscriptions. This is the
 * ONLY place the Notifications module reacts to another module's
 * events — business services never call `notificationService` directly
 * (Scope decision #1/#2). A future module (Analytics, Payments,
 * Messaging, AI) subscribes to the exact same events the exact same
 * way, independently — `registerNotificationListeners` never has to
 * change, and neither does any existing subscriber, when that happens.
 *
 * Recipient resolution reads the routing data (`partnerId`,
 * `customerUserId`) each business service already put on the event's
 * `payload` at publish time — never a raw repository read of its own.
 * `partnerService.getOwnerUserId` is the one exception, an existing
 * cross-module Service method (not a repository), used because "which
 * user represents this partner org" isn't data any event payload
 * carries directly.
 */

import { EVENT_TYPES } from '../../../core/events/eventTypes.js';

const PRIORITY = Object.freeze({
  LOW: 'LOW',
  NORMAL: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
});

export function registerNotificationListeners({
  eventBus,
  notificationService,
  partnerService,
  conversationService,
  userService,
}) {
  async function notify(
    event,
    { recipientUserId, categoryCode, priorityCode, payload },
  ) {
    if (!recipientUserId) return;
    await notificationService.createNotification({
      recipientUserId,
      eventId: event.eventId,
      eventType: event.eventType,
      categoryCode,
      priorityCode,
      actorId: event.actorId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      payload,
    });
  }

  async function notifyPartnerOwner(
    event,
    { categoryCode, priorityCode, payload },
  ) {
    const recipientUserId = await partnerService.getOwnerUserId(
      event.payload.partnerId,
    );
    await notify(event, {
      recipientUserId,
      categoryCode,
      priorityCode,
      payload,
    });
  }

  eventBus.subscribe(EVENT_TYPES.BOOKING_CREATED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'BOOKING',
      priorityCode: PRIORITY.HIGH,
      payload: {
        bookingReference: event.payload.bookingReference,
        listingId: event.payload.listingId,
        totalAmount: event.payload.totalAmount,
      },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_CONFIRMED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'BOOKING',
      priorityCode: PRIORITY.HIGH,
      payload: { bookingReference: event.payload.bookingReference },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.BOOKING_REJECTED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'BOOKING',
      priorityCode: PRIORITY.HIGH,
      payload: { bookingReference: event.payload.bookingReference },
    }),
  );

  // The recipient is whichever side did NOT initiate the cancellation —
  // the actor already knows about their own action.
  eventBus.subscribe(EVENT_TYPES.BOOKING_CANCELLED, async (event) => {
    const cancelledByCustomer = event.actorId === event.payload.customerUserId;
    const recipientUserId = cancelledByCustomer
      ? await partnerService.getOwnerUserId(event.payload.partnerId)
      : event.payload.customerUserId;
    await notify(event, {
      recipientUserId,
      categoryCode: 'BOOKING',
      priorityCode: PRIORITY.NORMAL,
      payload: { bookingReference: event.payload.bookingReference },
    });
  });

  eventBus.subscribe(EVENT_TYPES.BOOKING_COMPLETED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'BOOKING',
      priorityCode: PRIORITY.LOW,
      payload: { bookingReference: event.payload.bookingReference },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.REVIEW_SUBMITTED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'REVIEW',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        rating: event.payload.rating,
      },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.FAVORITE_ADDED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'FAVORITE',
      priorityCode: PRIORITY.LOW,
      payload: { listingId: event.payload.listingId },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.PARTNER_APPROVED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.HIGH,
      payload: { partnerName: event.payload.partnerName },
    }),
  );

  // P1.2 (Master Roadmap) — the two other real outcomes of an
  // application review; previously only approval notified the
  // applicant at all.
  eventBus.subscribe(EVENT_TYPES.PARTNER_REJECTED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.HIGH,
      payload: { partnerName: event.payload.partnerName },
    }),
  );
  eventBus.subscribe(EVENT_TYPES.PARTNER_NEEDS_CHANGES, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.HIGH,
      payload: {
        partnerName: event.payload.partnerName,
        reviewNote: event.payload.reviewNote,
      },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.LISTING_APPROVED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'LISTING',
      priorityCode: PRIORITY.NORMAL,
      payload: { listingId: event.payload.listingId, slug: event.payload.slug },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.LISTING_REJECTED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'LISTING',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        slug: event.payload.slug,
        notes: event.payload.notes,
      },
    }),
  );

  // Phase 14 (Messaging): the FIRST real proof that this module can
  // subscribe to a second business module's events without Messaging
  // knowing anything about Notifications — `conversationService` is used
  // read-only, exactly the way `partnerService.getOwnerUserId` already
  // is, to resolve "who else is in this conversation" (data no event
  // payload carries directly). Every OTHER participant is notified; the
  // sender already knows they sent it.
  eventBus.subscribe(EVENT_TYPES.MESSAGE_SENT, async (event) => {
    const participantUserIds = await conversationService.listParticipants(
      event.payload.conversationId,
    );
    const recipientUserIds = participantUserIds.filter(
      (userId) => userId !== event.actorId,
    );
    await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        notify(event, {
          recipientUserId,
          categoryCode: 'MESSAGE',
          priorityCode: PRIORITY.NORMAL,
          payload: {
            conversationId: event.payload.conversationId,
            messageId: event.payload.messageId,
          },
        }),
      ),
    );
  });

  // Phase 16 (Payment Infrastructure): the third proof that this module
  // subscribes to another business module's events without knowing
  // anything about Payments — `paymentService`/`PaymentService` have zero
  // references to `notificationService` anywhere. Both the customer and
  // the partner learn a payment succeeded (money changed hands on both
  // sides of the booking); only the customer is notified of a failure or
  // a refund (the partner's payable-balance page already reflects a
  // refund's effect, no separate alert needed there).
  eventBus.subscribe(EVENT_TYPES.PAYMENT_SUCCEEDED, async (event) => {
    await Promise.all([
      notify(event, {
        recipientUserId: event.payload.customerUserId,
        categoryCode: 'PAYMENT',
        priorityCode: PRIORITY.HIGH,
        payload: {
          paymentReference: event.payload.paymentReference,
          bookingId: event.payload.bookingId,
          totalAmount: event.payload.totalAmount,
          currency: event.payload.currency,
        },
      }),
      notifyPartnerOwner(event, {
        categoryCode: 'PAYMENT',
        priorityCode: PRIORITY.HIGH,
        payload: {
          paymentReference: event.payload.paymentReference,
          bookingId: event.payload.bookingId,
          totalAmount: event.payload.totalAmount,
          currency: event.payload.currency,
        },
      }),
    ]);
  });

  eventBus.subscribe(EVENT_TYPES.PAYMENT_FAILED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'PAYMENT',
      priorityCode: PRIORITY.HIGH,
      payload: {
        paymentReference: event.payload.paymentReference,
        bookingId: event.payload.bookingId,
        failureCode: event.payload.failureCode,
      },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.REFUND_SUCCEEDED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'PAYMENT',
      priorityCode: PRIORITY.HIGH,
      payload: {
        refundReference: event.payload.refundReference,
        bookingId: event.payload.bookingId,
        amount: event.payload.amount,
        currency: event.payload.currency,
      },
    }),
  );

  // Phase 17 (Inventory & Connectivity): only the events a partner
  // genuinely needs to act on are subscribed here — a failed sync, a
  // detected conflict, or a sync recovering from a prior failure.
  // `INVENTORY_SYNC_COMPLETED` (routine success) and the per-hold/
  // per-block events are deliberately NOT subscribed, per the explicit
  // "no spam on routine success" requirement — a partner who just
  // clicked "Block" or "Sync now" already knows the outcome from the
  // UI's own response, and a 30-second hold expiry is far too
  // high-frequency to notify on individually. `#executeSync` itself
  // (inventoryConnectionService.js) already de-duplicates repeat
  // failures of an already-broken connection before ever publishing
  // `INVENTORY_SYNC_FAILED`, so no additional filtering belongs here.
  eventBus.subscribe(EVENT_TYPES.INVENTORY_SYNC_FAILED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.HIGH,
      payload: {
        connectionName: event.payload.connectionName,
        error: event.payload.error,
      },
    }),
  );

  eventBus.subscribe(EVENT_TYPES.INVENTORY_SYNC_CONFLICT, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        connectionName: event.payload.connectionName,
        conflictsCount: event.payload.conflicts?.length ?? 0,
      },
    }),
  );

  // Published only on the actual ERROR -> working transition
  // (inventoryConnectionService.js's `#executeSync`) — never on a
  // routine success, so this stays a genuinely new, actionable signal
  // rather than more noise on top of the failure notification above.
  eventBus.subscribe(EVENT_TYPES.INVENTORY_SYNC_RECOVERED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        connectionName: event.payload.connectionName,
      },
    }),
  );

  // P1.4 (Master Roadmap): the new employee, not the inviter/owner — the
  // invitation email itself was already sent directly (see
  // `partnerStaffService.js`), so this is the "you're in" welcome signal
  // once acceptance actually created their `partner_employees` row.
  eventBus.subscribe(EVENT_TYPES.PARTNER_STAFF_ADDED, (event) =>
    notify(event, {
      recipientUserId: event.payload.newEmployeeUserId,
      categoryCode: 'PARTNER',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        partnerName: event.payload.partnerName,
        roleName: event.payload.roleName,
      },
    }),
  );

  // P1.5 (Master Roadmap, Review Trust & Safety): the review's own
  // author — see `eventTypes.js`'s comment for why only this one outcome
  // is notification-worthy.
  eventBus.subscribe(EVENT_TYPES.REVIEW_REJECTED, (event) =>
    notify(event, {
      recipientUserId: event.payload.customerUserId,
      categoryCode: 'REVIEW',
      priorityCode: PRIORITY.NORMAL,
      payload: { notes: event.payload.notes },
    }),
  );

  // Fans out to every MODERATOR/ADMIN/SUPER_ADMIN, not the review's
  // author — same `listUserIdsByRole` audience-resolution `admin
  // .announcement`'s own controller already uses, just reached from a
  // domain event instead of a direct admin action.
  eventBus.subscribe(EVENT_TYPES.REVIEW_REPORTED, async (event) => {
    const recipientUserIds = await userService.listUserIdsByRole([
      'MODERATOR',
      'ADMIN',
      'SUPER_ADMIN',
    ]);
    await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        notify(event, {
          recipientUserId,
          categoryCode: 'ADMIN',
          priorityCode: PRIORITY.NORMAL,
          payload: {
            reviewId: event.payload.reviewId,
            reasonName: event.payload.reasonName,
          },
        }),
      ),
    );
  });

  // Sprint G — public Contact form. Same ADMIN/SUPER_ADMIN audience
  // pattern as REVIEW_REPORTED above (no MODERATOR — contact inquiries
  // aren't a moderation concern). The submitter is anonymous, so this
  // is the only notification the event triggers.
  eventBus.subscribe(EVENT_TYPES.CONTACT_INQUIRY_SUBMITTED, async (event) => {
    const recipientUserIds = await userService.listUserIdsByRole([
      'ADMIN',
      'SUPER_ADMIN',
    ]);
    await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        notify(event, {
          recipientUserId,
          categoryCode: 'ADMIN',
          priorityCode: PRIORITY.NORMAL,
          payload: {
            inquiryId: event.payload.inquiryId,
            typeCode: event.payload.typeCode,
            subject: event.payload.subject,
          },
        }),
      ),
    );
  });

  // Launch-blocker remediation (P0-B): a customer's cancellation left a
  // paid booking's `refund_status = REQUIRES_MANUAL_REVIEW` with nobody
  // ever alerted — same MODERATOR/ADMIN/SUPER_ADMIN fan-out as
  // REVIEW_REPORTED above, HIGH priority since this concerns money.
  // `resourceType: 'booking'`/`resourceId` on the event (see
  // `bookingService.js#resolveRefundForCancelledBooking`) already routes
  // through the existing booking-detail notification deep link with no
  // further wiring needed.
  eventBus.subscribe(EVENT_TYPES.REFUND_REVIEW_REQUIRED, async (event) => {
    const recipientUserIds = await userService.listUserIdsByRole([
      'MODERATOR',
      'ADMIN',
      'SUPER_ADMIN',
    ]);
    await Promise.all(
      recipientUserIds.map((recipientUserId) =>
        notify(event, {
          recipientUserId,
          categoryCode: 'ADMIN',
          priorityCode: PRIORITY.HIGH,
          payload: {
            bookingReference: event.payload.bookingReference,
            partnerId: event.payload.partnerId,
            paymentId: event.payload.paymentId,
          },
        }),
      ),
    );
  });

  // Sprint E (TOP/Featured Listings + Promotion Engine) — the listing's
  // partner owner, resolved the same `partnerService.getOwnerUserId` way
  // every other partner-facing notification above already is.
  // `ADVERTISEMENT_EXPIRING_SOON` covers BOTH the 7-day and 2-day
  // reminders (`payload.thresholdDays`) — one subscription, since the
  // recipient/category/dedup logic is identical for both; only the copy
  // (rendered client-side from `thresholdDays`) differs.
  eventBus.subscribe(EVENT_TYPES.ADVERTISEMENT_ACTIVATED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PROMOTION',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        placementCode: event.payload.placementCode,
        endDate: event.payload.endDate,
      },
    }),
  );
  eventBus.subscribe(EVENT_TYPES.ADVERTISEMENT_EXPIRING_SOON, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PROMOTION',
      priorityCode: PRIORITY.HIGH,
      payload: {
        listingId: event.payload.listingId,
        placementCode: event.payload.placementCode,
        endDate: event.payload.endDate,
        thresholdDays: event.payload.thresholdDays,
      },
    }),
  );
  eventBus.subscribe(EVENT_TYPES.ADVERTISEMENT_EXPIRED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PROMOTION',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        placementCode: event.payload.placementCode,
        endDate: event.payload.endDate,
      },
    }),
  );
  eventBus.subscribe(EVENT_TYPES.ADVERTISEMENT_CANCELLED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PROMOTION',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        placementCode: event.payload.placementCode,
      },
    }),
  );
  eventBus.subscribe(EVENT_TYPES.ADVERTISEMENT_REJECTED, (event) =>
    notifyPartnerOwner(event, {
      categoryCode: 'PROMOTION',
      priorityCode: PRIORITY.NORMAL,
      payload: {
        listingId: event.payload.listingId,
        placementCode: event.payload.placementCode,
      },
    }),
  );
}

export default registerNotificationListeners;

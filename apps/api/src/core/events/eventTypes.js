/**
 * Domain event type constants (Phase 13 — Notifications).
 *
 * Naming convention every future publisher MUST follow so subscribers can
 * keep matching on stable strings across modules/deployments:
 *   "<resourceType>.<pastTenseVerb>", e.g. "booking.created".
 *
 * Only event types with a REAL publisher wired this phase are defined
 * here — no speculative `PAYMENT_*`/`MESSAGE_*`/`AI_*` constants. Adding
 * a future event type is a one-line addition to this file; it never
 * requires touching `DomainEventBus` or any existing subscriber.
 */

export const EVENT_TYPES = Object.freeze({
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_REJECTED: 'booking.rejected',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_COMPLETED: 'booking.completed',
  REVIEW_SUBMITTED: 'review.submitted',
  FAVORITE_ADDED: 'favorite.added',
  PARTNER_APPROVED: 'partner.approved',
  // P1.2 (Master Roadmap) — the two other real outcomes of a partner
  // application review, previously unpublished (only approval notified
  // the applicant; a rejection or a request for changes left them with
  // no signal beyond checking the application page themselves).
  PARTNER_REJECTED: 'partner.rejected',
  PARTNER_NEEDS_CHANGES: 'partner.needs_changes',
  LISTING_APPROVED: 'listing.approved',
  LISTING_REJECTED: 'listing.rejected',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_ARCHIVED: 'conversation.archived',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_READ: 'message.read',
  ATTACHMENT_UPLOADED: 'attachment.uploaded',
  // Phase 16 (Payment Infrastructure). `PAYMENT_PROCESSING` is the one
  // deliberate exception to the strict past-tense-verb convention above —
  // it names an ongoing state, not a completed action, matching how
  // `payment_intent_statuses.PROCESSING` itself is named.
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_PROCESSING: 'payment.processing',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_CANCELLED: 'payment.cancelled',
  REFUND_CREATED: 'refund.created',
  REFUND_SUCCEEDED: 'refund.succeeded',
  REFUND_FAILED: 'refund.failed',
  // P0.2 (Master Roadmap) — published by BookingService#cancelBooking
  // when a customer cancels a paid booking: cancellationRefundPolicy.js
  // deliberately does not auto-refund a customer-initiated cancellation
  // (that requires a real, not-invented, per-listing policy this app
  // doesn't have yet), but the system must never leave this silent —
  // this is the queryable signal an admin surface/notification listener
  // can act on. `bookings.refund_status = 'REQUIRES_MANUAL_REVIEW'` is
  // the persisted source of truth either way, independent of whether
  // anything currently subscribes to this event.
  REFUND_REVIEW_REQUIRED: 'refund.review_required',
  // Phase 17 (Inventory, Availability & Connectivity).
  INVENTORY_BLOCKED: 'inventory.blocked',
  INVENTORY_UNBLOCKED: 'inventory.unblocked',
  EXTERNAL_RESERVATION_CREATED: 'external_reservation.created',
  EXTERNAL_RESERVATION_CANCELLED: 'external_reservation.cancelled',
  INVENTORY_HOLD_EXPIRED: 'inventory.hold_expired',
  INVENTORY_SYNC_COMPLETED: 'inventory.sync_completed',
  INVENTORY_SYNC_FAILED: 'inventory.sync_failed',
  INVENTORY_SYNC_CONFLICT: 'inventory.sync_conflict',
  // Published only when a sync succeeds immediately after the connection
  // was in ERROR — never on routine back-to-back successes — so a
  // partner learns their broken sync started working again without
  // being spammed on every scheduled run (see notificationListener.js's
  // "no spam on routine success" comment for INVENTORY_SYNC_COMPLETED).
  INVENTORY_SYNC_RECOVERED: 'inventory.sync_recovered',
  // P1.4 (Master Roadmap) — published once an invited user accepts and
  // becomes a real `partner_employees` row (never at invite-send time,
  // when there may not even be a `users` row yet to notify in-app).
  PARTNER_STAFF_ADDED: 'partner.staff_added',
  // P1.5 (Master Roadmap, Review Trust & Safety). Reviews are
  // auto-approved on submission (see mysqlReviewRepository.js's own
  // comment), so an admin moderation action is only notification-worthy
  // on the one outcome that actually changes something the author can
  // see — hiding an already-live review. There is no
  // REVIEW_APPROVED/REVIEW_FLAGGED equivalent: re-approving or flagging
  // is either a no-op from the author's side or an interim state, same
  // reasoning `partnerService.js#updateModerationStatus` already applies
  // (that method publishes no event at all).
  REVIEW_REJECTED: 'review.rejected',
  // Notifies moderators/admins, not the review's author — see
  // `notificationListener.js`'s own subscription.
  REVIEW_REPORTED: 'review.reported',
  // Sprint E (TOP/Featured Listings + Promotion Engine) — the partner
  // owner is notified on the outcomes that change what they can see
  // publicly: their promotion going live, an upcoming expiry (payload
  // carries `thresholdDays: 7 | 2` — one event type, not two, since the
  // recipient/copy/dedup logic is identical, only the threshold differs),
  // and the terminal states (expired/cancelled/rejected).
  ADVERTISEMENT_ACTIVATED: 'advertisement.activated',
  ADVERTISEMENT_EXPIRING_SOON: 'advertisement.expiring_soon',
  ADVERTISEMENT_EXPIRED: 'advertisement.expired',
  ADVERTISEMENT_CANCELLED: 'advertisement.cancelled',
  ADVERTISEMENT_REJECTED: 'advertisement.rejected',
  // Sprint G — public Contact form. Notifies ADMIN/SUPER_ADMIN, the same
  // audience/pattern as REVIEW_REPORTED above; the submitter is
  // anonymous (no account, nothing to notify them through).
  CONTACT_INQUIRY_SUBMITTED: 'contact.inquiry_submitted',
});

export default EVENT_TYPES;

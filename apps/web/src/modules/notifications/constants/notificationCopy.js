/**
 * Notification copy registry — the single source of truth mapping a
 * notification's `event_type` + `payload` to an i18n key + interpolation
 * params. This is why the backend stores no rendered text at all (Phase
 * 4.2's "i18n owns all labels" rule): the frontend is the only place
 * that decides what a notification says.
 *
 * `admin.announcement` is the one exception — an admin composed that
 * text directly at authoring time (there is no server-side i18n
 * renderer, Phase 13's documented limitation), so it's rendered as-is
 * rather than looked up by key.
 */

const REGISTRY = {
  'booking.created': (payload) => ({
    key: 'notifications.copy.bookingCreated',
    params: { reference: payload.bookingReference },
  }),
  'booking.confirmed': (payload) => ({
    key: 'notifications.copy.bookingConfirmed',
    params: { reference: payload.bookingReference },
  }),
  'booking.rejected': (payload) => ({
    key: 'notifications.copy.bookingRejected',
    params: { reference: payload.bookingReference },
  }),
  'booking.cancelled': (payload) => ({
    key: 'notifications.copy.bookingCancelled',
    params: { reference: payload.bookingReference },
  }),
  'booking.completed': (payload) => ({
    key: 'notifications.copy.bookingCompleted',
    params: { reference: payload.bookingReference },
  }),
  'review.submitted': (payload) => ({
    key: 'notifications.copy.reviewSubmitted',
    params: { rating: payload.rating },
  }),
  // Sent to the review's author when a moderator removes an already-live
  // review (apps/api/src/core/events/eventTypes.js's REVIEW_REJECTED) —
  // mirrors the short, notes-free in-app style `listing.rejected` already
  // uses below (the full reason is in the email, per emailTemplates.js).
  'review.rejected': () => ({
    key: 'notifications.copy.reviewRejected',
    params: {},
  }),
  // apps/api/src/core/events/eventTypes.js's MESSAGE_SENT — the payload
  // carries `conversationId`/`messageId`/`body` only (no sender name), so
  // this stays generic like `favorite.added` rather than interpolating.
  'message.sent': () => ({
    key: 'notifications.copy.messageReceived',
    params: {},
  }),
  'favorite.added': () => ({
    key: 'notifications.copy.favoriteAdded',
    params: {},
  }),
  'partner.approved': (payload) => ({
    key: 'notifications.copy.partnerApproved',
    params: { partnerName: payload.partnerName },
  }),
  // P1.2 (Master Roadmap) — the two other real review outcomes.
  'partner.rejected': (payload) => ({
    key: 'notifications.copy.partnerRejected',
    params: { partnerName: payload.partnerName },
  }),
  'partner.needs_changes': (payload) => ({
    key: 'notifications.copy.partnerNeedsChanges',
    params: { partnerName: payload.partnerName },
  }),
  'listing.approved': () => ({
    key: 'notifications.copy.listingApproved',
    params: {},
  }),
  'listing.rejected': (payload) => ({
    key: 'notifications.copy.listingRejected',
    params: { notes: payload.notes ?? '' },
  }),
  // apps/api/.../notificationListener.js's `EVENT_TYPES.PAYMENT_SUCCEEDED`
  // subscription — fans out to both the customer and the partner owner,
  // each receiving this same notification shape from their own side.
  'payment.succeeded': (payload) => ({
    key: 'notifications.copy.paymentSucceeded',
    params: { reference: payload.paymentReference },
  }),
  'payment.failed': (payload) => ({
    key: 'notifications.copy.paymentFailed',
    params: { reference: payload.paymentReference },
  }),
  'refund.succeeded': (payload) => ({
    key: 'notifications.copy.refundSucceeded',
    params: { reference: payload.refundReference },
  }),
  // Partner-only (inventoryConnectionService.js's sync job) — a stable,
  // partner-authored `connectionName`, never a raw connector id.
  'inventory.sync_failed': (payload) => ({
    key: 'notifications.copy.inventorySyncFailed',
    params: { connectionName: payload.connectionName },
  }),
  'inventory.sync_conflict': (payload) => ({
    key: 'notifications.copy.inventorySyncConflict',
    params: {
      connectionName: payload.connectionName,
      count: payload.conflictsCount,
    },
  }),
  // Only published on the actual ERROR -> working transition (never on
  // routine back-to-back successes) — see inventoryConnectionService.js.
  'inventory.sync_recovered': (payload) => ({
    key: 'notifications.copy.inventorySyncRecovered',
    params: { connectionName: payload.connectionName },
  }),
  'partner.staff_added': (payload) => ({
    key: 'notifications.copy.partnerStaffAdded',
    params: { partnerName: payload.partnerName },
  }),
  // MODERATOR/ADMIN/SUPER_ADMIN fan-out only (eventTypes.js's own
  // comment) — never reaches a customer or partner surface, but the copy
  // still needs to exist so it never falls through to the raw-code
  // fallback for whichever admin/moderator receives it.
  'review.reported': () => ({
    key: 'notifications.copy.reviewReported',
    params: {},
  }),
  'refund.review_required': (payload) => ({
    key: 'notifications.copy.refundReviewRequired',
    params: { reference: payload.bookingReference },
  }),
  // Sprint E (TOP/Featured Listings + Promotion Engine) — always sent to
  // the listing's partner owner (notificationListener.js's
  // `notifyPartnerOwner`). The placement (Home vs. Category) picks a
  // DIFFERENT i18n key per event rather than interpolating a translated
  // placement name into one shared string — simpler and more naturally
  // localizable than nesting a second translation lookup inside the
  // first (HY/RU grammar can differ per placement with no interpolation
  // gymnastics needed).
  'advertisement.activated': (payload) => ({
    key:
      payload.placementCode === 'HOMEPAGE_SECTION'
        ? 'notifications.copy.advertisementActivatedHome'
        : 'notifications.copy.advertisementActivatedCategory',
    params: { endDate: payload.endDate },
  }),
  // Covers BOTH the 7-day and 2-day reminder — `payload.thresholdDays`
  // picks the exact wording (spec §15/§16: wording must never claim
  // online renewal/payment is available, since payments stay manual).
  'advertisement.expiring_soon': (payload) => ({
    key:
      payload.placementCode === 'HOMEPAGE_SECTION'
        ? 'notifications.copy.advertisementExpiringSoonHome'
        : 'notifications.copy.advertisementExpiringSoonCategory',
    params: { endDate: payload.endDate, thresholdDays: payload.thresholdDays },
  }),
  'advertisement.expired': (payload) => ({
    key:
      payload.placementCode === 'HOMEPAGE_SECTION'
        ? 'notifications.copy.advertisementExpiredHome'
        : 'notifications.copy.advertisementExpiredCategory',
    params: {},
  }),
  'advertisement.cancelled': (payload) => ({
    key:
      payload.placementCode === 'HOMEPAGE_SECTION'
        ? 'notifications.copy.advertisementCancelledHome'
        : 'notifications.copy.advertisementCancelledCategory',
    params: {},
  }),
  'advertisement.rejected': (payload) => ({
    key:
      payload.placementCode === 'HOMEPAGE_SECTION'
        ? 'notifications.copy.advertisementRejectedHome'
        : 'notifications.copy.advertisementRejectedCategory',
    params: {},
  }),
};

/** @returns {{ isAnnouncement: true, title: string, body: string } | { isAnnouncement: false, key: string, params: object }} */
export function getNotificationCopy(eventType, payload = {}) {
  if (eventType === 'admin.announcement') {
    return {
      isAnnouncement: true,
      title: payload.title ?? '',
      body: payload.body ?? '',
    };
  }
  const resolve = REGISTRY[eventType];
  if (!resolve) {
    // Deliberately does NOT interpolate `eventType` into the rendered
    // string — an event this frontend doesn't recognize (a future
    // backend addition, or a stale client) must still read as a normal
    // notification, never leak an internal identifier like
    // `booking.some_new_event` to the user.
    return {
      isAnnouncement: false,
      key: 'notifications.copy.generic',
      params: {},
    };
  }
  return { isAnnouncement: false, ...resolve(payload) };
}

export default getNotificationCopy;

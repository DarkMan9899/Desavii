/**
 * Analytics event contract (Sprint 5 §13).
 *
 * Provider-independent: these names and payload shapes describe *what
 * happened* on the platform, never *how a specific vendor wants it
 * framed* — no business Service imports a GA4 (or any other) SDK
 * directly; every event is emitted through this shared contract, and a
 * future analytics adapter (src/infrastructure/, a later sprint) is the
 * only place that knows about a concrete provider at all.
 *
 * Payload shapes are JSDoc `@typedef`s only — this package has no
 * runtime dependencies (it is a contract, not a client), per this
 * package's own stated convention (see index.js).
 */

/**
 * @typedef {object} SearchPerformedPayload
 * @property {string} query
 * @property {string} [listingType]
 * @property {number} [resultCount]
 */

/**
 * @typedef {object} FilterAppliedPayload
 * @property {string} filterKey
 * @property {string|number|boolean} filterValue
 */

/**
 * @typedef {object} ListingImpressionPayload
 * @property {number} listingId
 * @property {string} [surface] - e.g. "search_results", "homepage_featured"
 * @property {number} [position]
 */

/**
 * @typedef {object} ListingViewedPayload
 * @property {number} listingId
 */

/**
 * @typedef {object} FavoritePayload
 * @property {number} listingId
 */

/**
 * @typedef {object} BookingStartedPayload
 * @property {number} listingId
 */

/**
 * @typedef {object} BookingRequestSubmittedPayload
 * @property {number} bookingId
 * @property {number} listingId
 */

/**
 * @typedef {object} BookingConfirmedPayload
 * @property {number} bookingId
 */

/**
 * @typedef {object} BookingRejectedPayload
 * @property {number} bookingId
 * @property {string} [reason]
 */

/**
 * @typedef {object} BookingCancelledPayload
 * @property {number} bookingId
 * @property {'customer'|'vendor'} cancelledBy
 */

/**
 * @typedef {object} PromotionPayload
 * @property {number} advertisementId
 * @property {string} placementType
 */

/**
 * @typedef {object} ContactClickPayload
 * @property {number} listingId
 * @property {number} [partnerId]
 * @property {string} contactMethod - e.g. "phone", "email", "website",
 *   "whatsapp", "instagram" — never the actual phone/email/URL value.
 */

/**
 * @typedef {object} CompanyProfileViewPayload
 * @property {number} partnerId
 */

/**
 * @typedef {object} CompanyListingClickPayload
 * @property {number} partnerId
 * @property {number} listingId
 */

/**
 * @typedef {object} SearchImpressionPayload
 * @property {string} [query]
 * @property {string} [categoryCode]
 * @property {number} resultCount
 */

/**
 * @typedef {object} SearchResultClickPayload
 * @property {number} listingId
 * @property {number} position
 */

/**
 * @typedef {object} VendorRegisteredPayload
 * @property {number} partnerId
 */

/**
 * @typedef {object} ListingCreatedPayload
 * @property {number} listingId
 * @property {string} listingType
 */

const ANALYTICS_EVENTS = Object.freeze({
  SEARCH_PERFORMED: 'search_performed',
  FILTER_APPLIED: 'filter_applied',
  LISTING_IMPRESSION: 'listing_impression',
  LISTING_VIEWED: 'listing_viewed',
  FAVORITE_ADDED: 'favorite_added',
  FAVORITE_REMOVED: 'favorite_removed',
  BOOKING_STARTED: 'booking_started',
  BOOKING_REQUEST_SUBMITTED: 'booking_request_submitted',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_REJECTED: 'booking_rejected',
  BOOKING_CANCELLED: 'booking_cancelled',
  PROMOTION_IMPRESSION: 'promotion_impression',
  PROMOTION_CLICKED: 'promotion_clicked',
  CONTACT_CLICK: 'contact_click',
  COMPANY_PROFILE_VIEW: 'company_profile_view',
  COMPANY_LISTING_CLICK: 'company_listing_click',
  SEARCH_IMPRESSION: 'search_impression',
  SEARCH_RESULT_CLICK: 'search_result_click',
  VENDOR_REGISTERED: 'vendor_registered',
  LISTING_CREATED: 'listing_created',
});

module.exports = { ANALYTICS_EVENTS };

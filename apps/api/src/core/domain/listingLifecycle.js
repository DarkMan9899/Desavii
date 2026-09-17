/**
 * Listing publication lifecycle — Listing Lifetime / Renewal, Step B2
 * (schema/domain foundation only; see the Step B1 audit for the full
 * design). Pure domain logic, mirrors `listingStatusTransitions.js`'s
 * shape.
 *
 * Per the B1 audit's locked decision: expiration is a SEPARATE lifecycle
 * dimension from `status_id`/`moderation_status_id`, never a new
 * `listing_statuses` code and never folded into `moderation_status_id`. A
 * listing that expired without renewal is represented as `status_id =
 * UNPUBLISHED` (the existing status — no new one) plus `frozen_at IS NOT
 * NULL`, distinguishing it from a manual unpublish (`frozen_at IS NULL`).
 * These helpers exist so no future module (Partner dashboard, Admin,
 * public-visibility filtering) re-derives that distinction independently —
 * this file is the single source of truth for it.
 *
 * Takes a listing domain object shaped like `mysqlListingRepository.js`'s
 * `toListingDomain` output (camelCase: `frozenAt`, `expiresAt`, `deletedAt`,
 * etc.) — never a raw DB row.
 */

/**
 * Step B3 — the LOCKED product decision (approved options: 30/90/180/365
 * days, default 90, no custom day count): the one canonical source of
 * truth for every layer that needs it (`listingValidators.js`'s publish
 * schema references this list indirectly via `ListingService`, never a
 * second copy of the numbers). A manipulated client sending anything
 * outside this exact set (17, 60, 91, 366, 0, a negative number, non-
 * numeric input) must be rejected — see `isValidPublicationPeriodDays`.
 */
export const PUBLICATION_PERIOD_DAYS_OPTIONS = Object.freeze([
  30, 90, 180, 365,
]);

/** The wizard's pre-selected option for a listing entering its first publication cycle — a UI default only, never assumed by the backend when a request omits the field outright (see `ListingService#checkPublishReadiness`'s `PUBLICATION_PERIOD_REQUIRED` issue). */
export const DEFAULT_PUBLICATION_PERIOD_DAYS = 90;

/** @param {unknown} days @returns {boolean} true only for an exact member of `PUBLICATION_PERIOD_DAYS_OPTIONS` — never a range check, since custom day counts are explicitly disallowed. */
export function isValidPublicationPeriodDays(days) {
  return PUBLICATION_PERIOD_DAYS_OPTIONS.includes(days);
}

/**
 * The canonical "expired, not merely manually unpublished" signal. A
 * soft-deleted listing is never considered frozen — once `deletedAt` is
 * set, the listing has left the lifecycle entirely (Step B7's retention
 * purge), and "frozen" no longer means anything for it.
 */
export function isFrozen(listing) {
  return listing.frozenAt != null && listing.deletedAt == null;
}

/** Whether this listing currently has a publication-expiry assigned at all — false for every pre-Step-B3 listing and any listing whose partner never selected a publication period. */
export function hasPublicationExpiry(listing) {
  return listing.expiresAt != null;
}

/** Whether this listing participates in the publication lifecycle at all (an expiry was ever assigned, or it has already been frozen) — false for the entire pre-Step-B3 catalog, useful for future code that needs to treat "never opted into the lifecycle" as distinct from "opted in and currently active." */
export function isLifecycleManaged(listing) {
  return listing.expiresAt != null || listing.frozenAt != null;
}

export default {
  PUBLICATION_PERIOD_DAYS_OPTIONS,
  DEFAULT_PUBLICATION_PERIOD_DAYS,
  isValidPublicationPeriodDays,
  isFrozen,
  hasPublicationExpiry,
  isLifecycleManaged,
};

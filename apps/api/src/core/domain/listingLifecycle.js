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
  isFrozen,
  hasPublicationExpiry,
  isLifecycleManaged,
};

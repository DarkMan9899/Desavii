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

/**
 * Step B4 — true when this listing's publication period has run out,
 * whether or not the hourly expiry sweep (`modules/listings/jobs/
 * listingExpirySweep.js`) has already processed it. Deliberately does NOT
 * wait for `frozen_at` alone: public visibility must never depend solely on
 * scheduler timing (a PUBLISHED row whose `expires_at` already passed but
 * hasn't been swept yet is still "expired" for every purpose this function
 * is used for).
 *
 * Step B6.5 — `now` is a REQUIRED parameter, never an internal `new Date()`
 * read. `listing.expiresAt` is a DATETIME column value that came through
 * mysql2 (`ListingRepository#findById`), and this pool has no explicit
 * `timezone` option set — mysql2's default parses a DATETIME string using
 * the connection's LOCAL timezone, not UTC, even though every write to this
 * column uses `UTC_TIMESTAMP(3)` (the exact same root cause
 * `infrastructure/database/dateFormat.js` already documents for `DATE`
 * columns, just for a full timestamp instead of a calendar day). Comparing
 * that mysql2-parsed value against a plain JS `new Date()` mixes two
 * different time frames whenever the server's local UTC offset is nonzero —
 * on this platform's own Asia/Yerevan (UTC+4) host, ANY listing expiring
 * within roughly the next 4 hours could be misclassified as already
 * expired. The fix is never a manual offset correction (fragile, and this
 * app already has DST-naive/host-portable code elsewhere) — `now` must
 * itself be sourced from the SAME mysql2 connection (`ListingRepository
 * #findDbNow`), so both sides of the comparison go through the identical
 * parsing path and the distortion cancels out exactly, the same "read the
 * bound from the DB itself" principle this codebase's own lifecycle tests
 * already rely on. Passing a real, correct JS `Date` (e.g. in a unit test
 * building an ISO-string fixture, which mysql2 never touches) is equally
 * correct, since a `Date` object's internal instant is unambiguous — the
 * bug only exists at the mysql2 round trip, never within a single,
 * internally-consistent comparison.
 * @param {{expiresAt: string|Date|null, frozenAt: string|Date|null, deletedAt: string|Date|null}} listing
 * @param {Date} now
 */
export function hasLifecycleExpired(listing, now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError(
      'hasLifecycleExpired requires a valid "now" Date — never an implicit new Date() read (Step B6.5).',
    );
  }
  if (isFrozen(listing)) return true;
  return listing.expiresAt != null && new Date(listing.expiresAt) <= now;
}

/**
 * Step B4 — the canonical "currently publicly visible" predicate for a
 * fully-hydrated listing domain object, mirroring `infrastructure/database`
 * repositories' own SQL-side equivalent (`listingVisibilitySql.js`'s
 * `scopePubliclyVisibleListing`) exactly. Used by the handful of call sites
 * that already have a listing object in hand rather than composing a fresh
 * SQL WHERE clause (e.g. `ListingService#getListing`'s public-detail gate).
 * Does not consider `deletedAt` — every caller here only ever reaches a
 * non-deleted row in the first place (soft-delete scoping already happened
 * at the repository read).
 *
 * Step B6.5 — `now` is required and forwarded verbatim to
 * `hasLifecycleExpired`; see that function's own doc comment for why.
 * @param {Date} now
 */
export function isPubliclyVisible(listing, now) {
  return (
    listing.statusCode === 'PUBLISHED' && !hasLifecycleExpired(listing, now)
  );
}

export default {
  PUBLICATION_PERIOD_DAYS_OPTIONS,
  DEFAULT_PUBLICATION_PERIOD_DAYS,
  isValidPublicationPeriodDays,
  isFrozen,
  hasPublicationExpiry,
  isLifecycleManaged,
  hasLifecycleExpired,
  isPubliclyVisible,
};

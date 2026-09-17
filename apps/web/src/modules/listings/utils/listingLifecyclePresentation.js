/**
 * listingLifecyclePresentation — pure derivation of a Partner-facing
 * lifecycle presentation state from a listing's raw wire fields
 * (`status`, `expires_at`, `frozen_at` — the same snake_case shape
 * `openingHoursStatus.js` already establishes the convention for). One
 * shared helper so no component independently re-derives "is this
 * expiring soon" (Listing Lifetime / Renewal, Step B5, brief §15).
 *
 * These are PRESENTATION states only — never a new `listing_statuses`
 * DB code (brief §15's own explicit rule) — and are for DISPLAY/UI-
 * eligibility only. The actual Renew request is validated authoritatively
 * server-side (`ListingService#renewListing`); `now` is always injectable
 * so every function here is deterministic and unit-testable without
 * real-time waiting, and the viewer's own clock deciding "expiring soon"
 * a little early or late has no security consequence (brief §17).
 */

export const LISTING_LIFECYCLE_STATES = Object.freeze({
  /** Never entered the publication-expiry lifecycle at all (`expires_at` was never assigned — every pre-Step-B3 listing, or a DRAFT). */
  LEGACY: 'LEGACY',
  /** PUBLISHED, not frozen, `expires_at` comfortably in the future. */
  ACTIVE: 'ACTIVE',
  /** PUBLISHED, not frozen, `expires_at` within the "expiring soon" threshold but not yet passed. */
  EXPIRING_SOON: 'EXPIRING_SOON',
  /** Frozen by the expiry sweep, OR `expires_at` has already passed even if the sweep hasn't run yet — presented identically, matching `hasLifecycleExpired`'s own backend rule (never a raw negative-day counter). */
  EXPIRED_FROZEN: 'EXPIRED_FROZEN',
});

/** Brief §16's recommended threshold — aligned with B6's future T-2-day reminder. */
export const EXPIRING_SOON_THRESHOLD_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{status: string, expires_at: string|null, frozen_at: string|null}} listing
 * @param {Date} [now]
 * @returns {keyof typeof LISTING_LIFECYCLE_STATES}
 */
export function resolveListingLifecycleState(listing, now = new Date()) {
  const { status, expires_at: expiresAt, frozen_at: frozenAt } = listing;

  if (frozenAt != null) return LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN;
  if (expiresAt == null) return LISTING_LIFECYCLE_STATES.LEGACY;
  // A manually-UNPUBLISHED (never frozen) or DRAFT/ARCHIVED listing that
  // happens to still carry an old `expires_at` from a prior publication
  // cycle has no lifecycle URGENCY to show — brief §21's explicit rule:
  // never confuse a manual unpublish with an expired/frozen one. Ordinary
  // Publish (not Renew) is its recovery path, so this stays quiet exactly
  // like LEGACY rather than misrepresenting it as expired.
  if (status !== 'PUBLISHED') return LISTING_LIFECYCLE_STATES.LEGACY;

  const expiresAtMs = new Date(expiresAt).getTime();
  if (expiresAtMs <= now.getTime()) {
    // PUBLISHED but already past expires_at — the hourly sweep hasn't
    // reached it yet. Presented exactly like a frozen listing: the
    // partner never sees a stale "still active" countdown or a negative
    // number.
    return LISTING_LIFECYCLE_STATES.EXPIRED_FROZEN;
  }

  const daysRemaining = (expiresAtMs - now.getTime()) / DAY_MS;
  if (daysRemaining <= EXPIRING_SOON_THRESHOLD_DAYS) {
    return LISTING_LIFECYCLE_STATES.EXPIRING_SOON;
  }
  return LISTING_LIFECYCLE_STATES.ACTIVE;
}

/**
 * How many whole calendar days remain until `expires_at`, floored (never
 * negative — `resolveListingLifecycleState` already routes a passed
 * `expires_at` to EXPIRED_FROZEN before a caller would show a day count
 * at all). `null` when there is no `expires_at` to count from.
 */
export function daysUntilExpiry(listing, now = new Date()) {
  if (listing.expires_at == null) return null;
  const diffMs = new Date(listing.expires_at).getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / DAY_MS));
}

/**
 * UI-only eligibility mirror of the backend's real rule
 * (`ListingService#renewListing`) — decides whether to SHOW the Renew
 * action at all. The server independently re-validates and is the only
 * authoritative check (brief §17); a stale/incorrect client clock can at
 * worst show or hide the button a little early, never bypass the real
 * check.
 */
export function isRenewEligible(listing) {
  // ACTIVE/EXPIRING_SOON/EXPIRED_FROZEN are the only 3 states
  // `resolveListingLifecycleState` ever returns for a listing with a real
  // `expires_at` — LEGACY (including every manually-UNPUBLISHED/DRAFT/
  // ARCHIVED case) is the only ineligible one.
  return (
    resolveListingLifecycleState(listing) !== LISTING_LIFECYCLE_STATES.LEGACY
  );
}

/**
 * The renewal selector's default option — the listing's own current
 * `publication_period_days` when it's one of the approved values,
 * otherwise the platform default (brief §3's exact fallback rule).
 * `approvedPeriods` is passed in rather than imported, so this stays a
 * dependency-free pure function the way every other util in this file is.
 */
export function resolveDefaultRenewalPeriod(
  listing,
  approvedPeriods,
  fallbackPeriod,
) {
  if (approvedPeriods.includes(listing.publication_period_days)) {
    return listing.publication_period_days;
  }
  return fallbackPeriod;
}

export default {
  LISTING_LIFECYCLE_STATES,
  EXPIRING_SOON_THRESHOLD_DAYS,
  resolveListingLifecycleState,
  daysUntilExpiry,
  isRenewEligible,
  resolveDefaultRenewalPeriod,
};

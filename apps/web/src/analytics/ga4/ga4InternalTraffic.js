/**
 * Step A7 (brief §30), hardened in Step A8.1 (brief §11/§12) after the A8
 * audit found a real auth-loading race: the original single boolean here
 * defaulted to "not suppressed" and was only ever set to "suppressed" by
 * `Ga4RouteTracker`'s own effect once `useAuth()`'s `roles` resolved —
 * but `AuthProvider.isBootstrapping` is `false`-shaped (`roles: []`,
 * `isAuthenticated: false`) for the entire async bootstrap window
 * (`POST /auth/refresh` + `GET /auth/me`), so an actually-logged-in
 * ADMIN/SUPER_ADMIN/MODERATOR/SUPPORT session briefly looked
 * indistinguishable from an anonymous visitor — if consent were already
 * GRANTED at that point (e.g. a future CMP restoring a persisted
 * decision on mount), GA4 could fire one page_view/event for an internal
 * session before its role was known.
 *
 * Fix: track auth-bootstrap state and internal-role state SEPARATELY,
 * and derive "is GA4 public tracking currently allowed" from BOTH,
 * defaulting BOTH to the conservative direction. While bootstrapping is
 * unresolved, tracking is blocked regardless of role — never "allowed,
 * then corrected". `dispatchToGa4.js` needed no changes at all: it
 * already reads `isGa4InternalTrafficSuppressed()` as its one gate, so
 * making that read incorporate bootstrap state protects the event
 * bridge for free, with the identical guarantee `Ga4RouteTracker`'s own
 * pageview effect gets.
 */

// Conservative production defaults — GA4 stays blocked until a mounted
// `Ga4RouteTracker` positively confirms auth has resolved and the
// session isn't internal staff. Never flip the "isBootstrapping" default
// to false here; that would silently defeat the whole fix.
let isAuthBootstrapping = true;
let isInternalStaff = false;

export function setGa4AuthBootstrapping(nextValue) {
  isAuthBootstrapping = Boolean(nextValue);
}

export function setGa4InternalTrafficSuppressed(nextValue) {
  isInternalStaff = Boolean(nextValue);
}

/**
 * The one gate both `Ga4RouteTracker` (pageviews) and `dispatchToGa4`
 * (the 9-event bridge) read. True (blocked) while auth is still
 * bootstrapping, OR once resolved as internal staff — false (allowed)
 * only once auth has resolved AND the session is not internal staff.
 */
export function isGa4InternalTrafficSuppressed() {
  return isAuthBootstrapping || isInternalStaff;
}

/**
 * Test-only: resets to the same conservative defaults a real page load
 * starts with (bootstrapping=true, not-yet-known-internal=false) — NOT
 * to "ready and public", so a test that needs GA4 tracking allowed must
 * say so explicitly via `setGa4AuthBootstrapping(false)`, the same as
 * production code has to.
 */
export function resetGa4InternalTrafficForTests() {
  isAuthBootstrapping = true;
  isInternalStaff = false;
}

/**
 * Step A7 (brief §30) — internal-traffic suppression flag. Kept by
 * `Ga4RouteTracker` (the one place with both `useAuth()` and a mounted
 * effect to react to role changes) and read by both the route tracker
 * itself and `dispatchToGa4` (the plain-function event bridge, which has
 * no hook access) — a module-scoped boolean is the simplest way to share
 * "is the current session internal staff" between a React effect and a
 * non-component call site without threading auth state through every
 * `track*` call.
 */

let suppressed = false;

export function isGa4InternalTrafficSuppressed() {
  return suppressed;
}

export function setGa4InternalTrafficSuppressed(nextValue) {
  suppressed = Boolean(nextValue);
}

/** Test-only: resets module-scoped suppression state between tests. */
export function resetGa4InternalTrafficForTests() {
  suppressed = false;
}

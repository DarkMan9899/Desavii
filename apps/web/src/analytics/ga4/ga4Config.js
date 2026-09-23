/**
 * Step A7 — GA4 feature/config validation. The single source of truth
 * for "is GA4 configured": both `VITE_GA4_ENABLED === 'true'` AND a
 * measurement ID matching the real GA4 Web Stream format (`G-XXXXXXXXXX`)
 * must hold. A missing/unset flag, a flag left at any other value, or a
 * malformed/empty ID all resolve to `false` here — never a thrown error,
 * since this is read on every dispatch attempt and must never be able to
 * break page rendering or navigation (brief §4/§45).
 *
 * Deliberately independent of `VITE_ANALYTICS_COLLECTION_ENABLED`
 * (`analyticsClient.js`) — nothing in this file reads that flag, and
 * nothing in `analyticsClient.js` reads this one.
 */

// Real GA4 Web Stream measurement IDs are always `G-` followed by
// uppercase alphanumerics — validated, not just "non-empty", so a typo'd
// or placeholder value never silently attempts a real gtag.js request.
const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export function isGa4FeatureFlagEnabled() {
  return import.meta.env.VITE_GA4_ENABLED === 'true';
}

export function getGa4MeasurementId() {
  const raw = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function isValidGa4MeasurementId(measurementId) {
  return MEASUREMENT_ID_PATTERN.test(measurementId);
}

/** True only when the flag is enabled AND the measurement ID is valid. */
export function isGa4Configured() {
  return (
    isGa4FeatureFlagEnabled() && isValidGa4MeasurementId(getGa4MeasurementId())
  );
}

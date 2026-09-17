/**
 * Frontend mirror of the backend's real, fixed publication-period enum
 * (`apps/api/src/core/domain/listingLifecycle.js`'s
 * `PUBLICATION_PERIOD_DAYS_OPTIONS`/`DEFAULT_PUBLICATION_PERIOD_DAYS`),
 * not an invented list — same "mirror the backend's own domain constant"
 * convention as `listingStatuses.js`. The backend is the sole authority:
 * this exists only so the wizard's UI doesn't hardcode the same four
 * numbers a second time. Locked product decision (Step B3) — 30/90/180/
 * 365 days, default 90, no custom day count.
 */

export const PUBLICATION_PERIOD_DAYS_OPTIONS = Object.freeze([
  30, 90, 180, 365,
]);

export const DEFAULT_PUBLICATION_PERIOD_DAYS = 90;

export default PUBLICATION_PERIOD_DAYS_OPTIONS;

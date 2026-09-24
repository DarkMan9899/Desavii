/**
 * Step M2B — the explicit, closed matrix of
 * `(current listing.statusCode, requested moderation status)` combinations
 * `ListingService#updateModerationStatus` accepts. Pure domain logic,
 * mirrors `listingStatusTransitions.js`'s own shape (a lookup table + one
 * resolver function) — deliberately a closed allowlist, not a rule-engine:
 * any combination not explicitly listed here is invalid, full stop, so an
 * unanticipated future moderation status/listing status pairing fails
 * safely (a clean rejection) rather than silently falling through some
 * default branch.
 *
 * `writeMode` tells the Service which repository write path applies:
 * - `'publish'` — the target is PUBLISHED and this is the one case that
 *   needs the same publication-period/expires_at lifecycle math
 *   `markPublished` already implements (reused, never duplicated).
 * - `'moderationOnly'` — the listing's `status_id` does not change at
 *   all (the PUBLISHED+APPROVED idempotent re-confirmation).
 * - `'return'` — a combined `status_id` + `moderation_status_id` +
 *   `moderation_notes` write (the two "send it back" outcomes).
 */

const DECISIONS = Object.freeze({
  'PENDING_REVIEW:APPROVED': Object.freeze({
    targetStatusCode: 'PUBLISHED',
    writeMode: 'publish',
    requiresReason: false,
    setUnpublishedAt: false,
  }),
  'PENDING_REVIEW:REJECTED': Object.freeze({
    targetStatusCode: 'DRAFT',
    writeMode: 'return',
    requiresReason: true,
    setUnpublishedAt: false,
  }),
  'PUBLISHED:REJECTED': Object.freeze({
    targetStatusCode: 'UNPUBLISHED',
    writeMode: 'return',
    requiresReason: true,
    setUnpublishedAt: true,
  }),
  'PUBLISHED:FLAGGED': Object.freeze({
    targetStatusCode: 'UNPUBLISHED',
    writeMode: 'return',
    requiresReason: false,
    setUnpublishedAt: true,
  }),
  // Idempotent re-confirmation, brief §20/§21: never weakens moderation
  // (the listing was already public), never re-runs publish-lifecycle
  // math (it's already published) — a bare moderation_status_id write.
  'PUBLISHED:APPROVED': Object.freeze({
    targetStatusCode: 'PUBLISHED',
    writeMode: 'moderationOnly',
    requiresReason: false,
    setUnpublishedAt: false,
  }),
});

/**
 * @returns {object|null} the decision object for this exact
 *   `(currentStatusCode, requestedModerationStatus)` pair, or `null` if
 *   the combination is not in the closed allowlist above (the Service
 *   must reject with a `ConflictError`, never partially write).
 */
export function resolveModerationDecision(
  currentStatusCode,
  requestedModerationStatus,
) {
  return DECISIONS[`${currentStatusCode}:${requestedModerationStatus}`] ?? null;
}

export default { resolveModerationDecision };

/**
 * `getAllowedModerationActions` — the frontend's own mirror of the
 * backend's closed decision matrix
 * (`apps/api/src/core/domain/listingModerationDecisions.js`, Step M2B).
 * Backend remains authoritative (every action still goes through the
 * real endpoint and can still 409/422 on a stale read), but the UI must
 * not knowingly offer a transition the backend has no entry for — a
 * DRAFT listing showing an "Approve" button is a dead click, not a
 * legitimate control.
 *
 * Deliberately keyed on `listing.status` alone, exactly like the
 * backend matrix — `moderation_status` never changes which actions are
 * legal, only what they do.
 *
 * `kind` distinguishes the two different REJECTED flows so the UI can
 * show context-sensitive wording (brief §6): "Return for changes" for
 * the pre-publication PENDING_REVIEW -> DRAFT flow (the partner corrects
 * and resubmits), "Reject" for the post-publish PUBLISHED -> UNPUBLISHED
 * takedown. Both send the identical backend `status: 'REJECTED'` value —
 * this is presentation-only, never a new backend status.
 */

const ACTIONS_BY_STATUS = Object.freeze({
  PENDING_REVIEW: Object.freeze([
    Object.freeze({
      status: 'APPROVED',
      kind: 'approve',
      requiresReason: false,
    }),
    Object.freeze({
      status: 'REJECTED',
      kind: 'returnForChanges',
      requiresReason: true,
    }),
  ]),
  PUBLISHED: Object.freeze([
    Object.freeze({ status: 'REJECTED', kind: 'reject', requiresReason: true }),
    Object.freeze({ status: 'FLAGGED', kind: 'flag', requiresReason: false }),
  ]),
});

/**
 * A soft-deleted listing is never reachable through this — the admin
 * queue already excludes it (`scopeActive`, `mysqlListingRepository.js
 * #listAdmin`), and its `deleted_at` isn't part of either admin DTO
 * (`toListingAdminDetailResponse`/`toAdminListingSummaryResponse`) for
 * this helper to check even if a stale link reached its detail page —
 * the backend's own `LISTING_DELETED` 409 is the real guard for that
 * edge case (brief §16's error handling covers surfacing it).
 *
 * @param {{ status: string }} listing
 * @returns {ReadonlyArray<{status: 'APPROVED'|'REJECTED'|'FLAGGED', kind: 'approve'|'returnForChanges'|'reject'|'flag', requiresReason: boolean}>}
 */
export function getAllowedModerationActions(listing) {
  if (!listing) return [];
  return ACTIONS_BY_STATUS[listing.status] ?? [];
}

/**
 * Maps a thrown `ApiError` (`api/ApiError.js`) to the
 * `admin.listingModeration.error.*` translation key for its toast —
 * shared by the queue and detail pages so neither one swallows the
 * distinction between "you can't" (403), "it's gone" (404), "someone
 * else already acted" (409 — the backend's own row lock caught a
 * transition that's no longer legal), a missed client-side reason
 * check (422), and a genuine network failure (brief §16).
 */
export function moderationErrorMessageKey(err) {
  if (err?.code === 'FORBIDDEN')
    return 'admin.listingModeration.error.permission';
  if (err?.code === 'NOT_FOUND')
    return 'admin.listingModeration.error.notFound';
  if (err?.status === 409) return 'admin.listingModeration.error.conflict';
  if (err?.code === 'VALIDATION_FAILED') {
    return 'admin.listingModeration.error.reasonRequired';
  }
  if (err?.code === 'NETWORK_ERROR')
    return 'admin.listingModeration.error.network';
  return 'admin.listingModeration.statusError';
}

export default getAllowedModerationActions;

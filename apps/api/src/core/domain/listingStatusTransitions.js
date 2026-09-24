/**
 * Listing status transition rules — Sprint 7's draft/publish/unpublish
 * lifecycle, matching the seeded `listing_statuses` codes (migration 0005,
 * seeds/001_lookups.js). Pure domain logic, mirrors
 * advertisementStatusTransitions.js's shape.
 *
 * Sprint 7's ListingService only exercises `DRAFT|UNPUBLISHED -> PUBLISHED`
 * (publishListing) and `PUBLISHED -> UNPUBLISHED` (unpublishListing) — the
 * remaining edges (moderation review, archival) are defined here for
 * correctness against the full seeded vocabulary, ready for the sprint that
 * implements moderation/archival flows.
 *
 * Step M2B (brief §14/§19): `UNPUBLISHED -> PENDING_REVIEW` is added so a
 * Partner who unpublishes a live listing, edits it, and needs it live again
 * has a real path back — `submitForReview` (`listingService.js`) is the
 * only caller of this specific edge, and it re-validates ownership/
 * readiness/frozen-state itself; this table only says the edge exists.
 * `UNPUBLISHED -> PUBLISHED` deliberately stays valid too (Renew's own
 * reactivation path, `renewListing`, is untouched by M2B) — closing the
 * ordinary Partner publish bypass for that edge is `publishListing`'s own
 * permission check (`#assertPermission`), not a transition-table change.
 */

const TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['PENDING_REVIEW', 'PUBLISHED']),
  PENDING_REVIEW: Object.freeze(['PUBLISHED', 'DRAFT']),
  PUBLISHED: Object.freeze(['UNPUBLISHED', 'ARCHIVED']),
  UNPUBLISHED: Object.freeze(['PUBLISHED', 'ARCHIVED', 'PENDING_REVIEW']),
  ARCHIVED: Object.freeze([]),
});

export const LISTING_STATUSES = Object.freeze(Object.keys(TRANSITIONS));

export function isValidListingStatusTransition(fromStatus, toStatus) {
  const allowed = TRANSITIONS[fromStatus];
  if (!allowed) {
    throw new TypeError(`Unknown listing status "${fromStatus}".`);
  }
  if (!(toStatus in TRANSITIONS)) {
    throw new TypeError(`Unknown listing status "${toStatus}".`);
  }
  return allowed.includes(toStatus);
}

export function isTerminalListingStatus(status) {
  if (!(status in TRANSITIONS)) {
    throw new TypeError(`Unknown listing status "${status}".`);
  }
  return TRANSITIONS[status].length === 0;
}

export default {
  LISTING_STATUSES,
  isValidListingStatusTransition,
  isTerminalListingStatus,
};

/**
 * listingEditability — whether a listing's content can be edited now, the
 * frontend mirror of `ListingService#updateListing`'s lock (Step M2B): a
 * listing under moderation review, or already published, is edited by
 * nobody — not its partner, not an admin — until it is returned for
 * changes or unpublished. The API enforces this; the UI only uses it to
 * offer "Edit" where it can succeed and to explain why it is not offered.
 */

export const EDIT_LOCKED_STATUSES = Object.freeze([
  'PENDING_REVIEW',
  'PUBLISHED',
]);

export function isListingEditable(status) {
  return !EDIT_LOCKED_STATUSES.includes(status);
}

export default isListingEditable;

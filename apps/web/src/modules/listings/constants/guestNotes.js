/**
 * Guest guidance notes — the frontend mirror of the API's
 * `core/domain/listingGuestNotes.js` (kinds, the listing types that accept
 * them, the per-kind cap). The API enforces all three; the Wizard only
 * offers the editor where it is accepted, and the page only renders what
 * the API returns.
 */

export const GUEST_NOTE_KINDS = Object.freeze([
  'BRING',
  'NOT_ALLOWED',
  'KNOW_BEFORE',
]);

export const GUEST_NOTE_LISTING_TYPES = Object.freeze([
  'TOUR',
  'ATTRACTION',
  'CAR_RENTAL',
]);

export const GUEST_NOTES_PER_KIND_MAX = 10;

export function acceptsGuestNotes(listingTypeCode) {
  return GUEST_NOTE_LISTING_TYPES.includes(listingTypeCode);
}

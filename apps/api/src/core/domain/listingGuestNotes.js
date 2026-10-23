/**
 * Guest guidance lists (docs/LISTING_DETAIL_FIELD_GAP.md §5): the
 * practical notes an activity or a rental publishes before booking —
 * GetYourGuide's "what to bring", "what's not allowed" and "know before
 * you go" (supplier content guidelines), Viator's "additional info".
 *
 * They belong to the categories a guest takes part in or drives — tours,
 * attractions and entertainment venues (listing type ATTRACTION), and car
 * rentals. Stays and restaurants already say this through their policies
 * and FAQs, so a note is refused there rather than silently stored.
 */

export const GUEST_NOTE_KINDS = Object.freeze({
  BRING: 'BRING',
  NOT_ALLOWED: 'NOT_ALLOWED',
  KNOW_BEFORE: 'KNOW_BEFORE',
});

export const GUEST_NOTE_LISTING_TYPES = Object.freeze([
  'TOUR',
  'ATTRACTION',
  'CAR_RENTAL',
]);

/** Same bound as an included/not-included item (`listing_guest_notes.note_text`). */
export const GUEST_NOTE_TEXT_MAX_LENGTH = 200;

/** Per kind and language — a scannable list, not an essay. */
export const GUEST_NOTES_PER_KIND_MAX = 10;

export function acceptsGuestNotes(listingTypeCode) {
  return GUEST_NOTE_LISTING_TYPES.includes(listingTypeCode);
}

/**
 * Media upload validation boundaries (Sprint 5 §8).
 *
 * Structural (Layer 2) constants and checks a future upload endpoint's
 * Validator composes with (src/validation/validate.js, Ch.10) — no
 * upload endpoint exists yet (Sprint 5 explicitly defers marketplace
 * feature APIs); this module is the constraint contract that endpoint
 * will validate against. Matches the `media_types` lookup table seeded
 * in migration 0006 (IMAGE/VIDEO/DOCUMENT).
 */

import { AuthorizationError } from '../../../errors/AppError.js';

export const ALLOWED_IMAGE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const ALLOWED_VIDEO_MIME_TYPES = Object.freeze([
  'video/mp4',
  'video/webm',
]);
export const ALLOWED_DOCUMENT_MIME_TYPES = Object.freeze(['application/pdf']);

export const ALLOWED_MIME_TYPES = Object.freeze([
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
]);

export const MAX_FILE_SIZE_BYTES = Object.freeze({
  image: 10 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  document: 20 * 1024 * 1024,
});

// Step L3 (brief §2) — a per-selection UX limit the frontend enforces
// before any upload starts; exported here too so both sides cite the
// same canonical number in error copy rather than a second literal.
export const MAX_IMAGE_FILES_PER_SELECTION = 5;

// Step L3 (brief §16) — decompression-bomb guard: bounds the pixel grid
// `imageContentValidator.js` decodes to, independent of the (already
// size-limited) compressed byte count a highly-compressed image can hide
// behind.
export const MAX_IMAGE_PIXELS = 50_000_000;
export const MAX_IMAGE_WIDTH_PX = 12_000;
export const MAX_IMAGE_HEIGHT_PX = 12_000;

// Step L3 (brief §14) — maps a declared, already-allowlisted image MIME
// type to the format name `sharp`'s real content-sniffing reports
// (libvips detects this from the file's actual bytes, never trusting the
// caller's declared Content-Type) — `imageContentValidator.js`'s mismatch
// check compares against this, not the other way around.
export const IMAGE_MIME_TO_SHARP_FORMAT = Object.freeze({
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export function classifyMimeType(mimeType) {
  if (ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_MIME_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType)) return 'document';
  return null;
}

export function isAllowedMimeType(mimeType) {
  return classifyMimeType(mimeType) !== null;
}

export function isWithinSizeLimit(mimeType, sizeBytes) {
  const category = classifyMimeType(mimeType);
  if (!category) return false;
  return (
    Number.isFinite(sizeBytes) &&
    sizeBytes > 0 &&
    sizeBytes <= MAX_FILE_SIZE_BYTES[category]
  );
}

/**
 * Ownership boundary: a caller may only attach media to an entity it
 * owns/manages. This function only encodes the *comparison* — resolving
 * "who owns mediable_id" is a Service-layer database read
 * (BACKEND_ARCHITECTURE.md §10: a Validator never performs a database
 * lookup itself, so the owner ID must already be resolved by the caller).
 */
export function assertMediaOwnership(requestingUserId, ownerUserId) {
  if (requestingUserId !== ownerUserId) {
    throw new AuthorizationError(
      'You do not have permission to manage media for this resource.',
    );
  }
}

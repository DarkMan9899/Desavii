/**
 * Image content validator (Step L3, brief §14-17).
 *
 * A declared Content-Type is never authoritative (brief §14): every
 * image is actually decoded with `sharp` (wraps libvips — the smallest
 * well-established Node.js image library for this; no home-grown
 * magic-byte parser), which reports the real detected format from the
 * file's own bytes, not the caller's header. A corrupt/truncated file
 * fails to decode (§15). An oversized pixel grid is rejected before any
 * further processing (§16, decompression-bomb guard — the compressed
 * byte count alone, already bounded by `MAX_FILE_SIZE_BYTES.image`,
 * says nothing about the decoded pixel grid a highly-compressed image
 * can hide behind). The returned buffer has been re-encoded with
 * EXIF/GPS metadata stripped and orientation baked into the pixels
 * (§17) — `sharp` strips all metadata by default unless `.withMetadata()`
 * is called, and `.rotate()` with no arguments auto-orients from the
 * EXIF Orientation tag before that strip, so a rotated photo never comes
 * out sideways just because its metadata is now gone.
 */

import sharp from 'sharp';
import { ValidationError } from '../../../errors/AppError.js';
import {
  IMAGE_MIME_TO_SHARP_FORMAT,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_WIDTH_PX,
  MAX_IMAGE_HEIGHT_PX,
} from './mediaConstraints.js';

// EXIF Orientation values 5-8 involve a 90/270-degree turn, which swaps
// the visual width/height `sharp .rotate()` will produce — the dimension
// guard below must check the POST-orientation shape actually served, not
// the raw encoded one.
const ORIENTATION_SWAPS_DIMENSIONS = new Set([5, 6, 7, 8]);

/**
 * @param {Buffer} buffer - already size-limited by the route's body
 *   parser (mediaConstraints.MAX_FILE_SIZE_BYTES.image) before this runs.
 * @param {string} declaredMimeType - the request's own Content-Type;
 *   already confirmed to be one of ALLOWED_IMAGE_MIME_TYPES by the
 *   caller before this is invoked.
 * @returns {Promise<{ buffer: Buffer, width: number, height: number }>}
 */
export async function validateAndProcessImage(buffer, declaredMimeType) {
  const expectedFormat = IMAGE_MIME_TO_SHARP_FORMAT[declaredMimeType];
  if (!expectedFormat) {
    throw new ValidationError('Unsupported image type.');
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new ValidationError('This image is corrupt or could not be read.');
  }

  if (metadata.format !== expectedFormat) {
    throw new ValidationError(
      "This file's actual content does not match its declared image type.",
    );
  }

  const swapped = ORIENTATION_SWAPS_DIMENSIONS.has(metadata.orientation ?? 1);
  const width = swapped ? metadata.height : metadata.width;
  const height = swapped ? metadata.width : metadata.height;

  if (!width || !height) {
    throw new ValidationError('This image is corrupt or could not be read.');
  }
  if (
    width > MAX_IMAGE_WIDTH_PX ||
    height > MAX_IMAGE_HEIGHT_PX ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new ValidationError(
      'This image is too large to process. Use a smaller image.',
    );
  }

  let processedBuffer;
  try {
    processedBuffer = await sharp(buffer)
      .rotate()
      .toFormat(expectedFormat)
      .toBuffer();
  } catch {
    throw new ValidationError('This image is corrupt or could not be read.');
  }

  return { buffer: processedBuffer, width, height };
}

export default validateAndProcessImage;

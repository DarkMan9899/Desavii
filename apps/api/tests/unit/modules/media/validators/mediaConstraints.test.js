/**
 * Step L3 (brief §2) — locks in the exact product-decided numbers this
 * step's whole media-hardening surface (frontend selection UX, backend
 * body-parser limits, dimension guard) is built against. A test here
 * failing means one of those locked decisions silently drifted.
 */

import { describe, test, expect } from '@jest/globals';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_FILES_PER_SELECTION,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_WIDTH_PX,
  MAX_IMAGE_HEIGHT_PX,
  IMAGE_MIME_TO_SHARP_FORMAT,
  classifyMimeType,
  isAllowedMimeType,
} from '../../../../../src/modules/media/validators/mediaConstraints.js';

describe('mediaConstraints (Step L3 locked product decisions)', () => {
  test('exactly JPEG/PNG/WebP are the allowed image types', () => {
    expect(ALLOWED_IMAGE_MIME_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
  });

  test('SVG/GIF/BMP are not allowed image types', () => {
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
    expect(isAllowedMimeType('image/gif')).toBe(false);
    expect(isAllowedMimeType('image/bmp')).toBe(false);
  });

  test('the image size limit is exactly 10 MiB', () => {
    expect(MAX_FILE_SIZE_BYTES.image).toBe(10 * 1024 * 1024);
  });

  test('the per-selection image count limit is exactly 5', () => {
    expect(MAX_IMAGE_FILES_PER_SELECTION).toBe(5);
  });

  test('the decompression-bomb dimension limits match the locked values', () => {
    expect(MAX_IMAGE_PIXELS).toBe(50_000_000);
    expect(MAX_IMAGE_WIDTH_PX).toBe(12_000);
    expect(MAX_IMAGE_HEIGHT_PX).toBe(12_000);
  });

  test('every allowed image MIME type maps to a real sharp format name', () => {
    ALLOWED_IMAGE_MIME_TYPES.forEach((mimeType) => {
      expect(IMAGE_MIME_TO_SHARP_FORMAT[mimeType]).toEqual(expect.any(String));
      expect(classifyMimeType(mimeType)).toBe('image');
    });
  });
});

/**
 * Step L3 (brief §14-17, §28-29): real content/magic-byte detection,
 * corrupt-image rejection, decompression-bomb dimension limits, and
 * EXIF/GPS metadata stripping with orientation preserved. Every fixture
 * here is a real, `sharp`-generated image — never a hand-typed byte
 * literal claiming to be one, so a decode failure in the validator would
 * show up as a real assertion failure, not a fixture bug.
 */

import { describe, test, expect } from '@jest/globals';
import sharp from 'sharp';
import { validateAndProcessImage } from '../../../../../src/modules/media/validators/imageContentValidator.js';
import {
  MAX_IMAGE_WIDTH_PX,
  MAX_IMAGE_HEIGHT_PX,
} from '../../../../../src/modules/media/validators/mediaConstraints.js';

async function makeImage({ width = 4, height = 4, format = 'png' } = {}) {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 40, g: 90, b: 200 },
    },
  });
  if (format === 'jpeg') return image.jpeg().toBuffer();
  if (format === 'webp') return image.webp().toBuffer();
  return image.png().toBuffer();
}

describe('validateAndProcessImage (Step L3)', () => {
  test('a genuine JPEG declared as image/jpeg is accepted', async () => {
    const buffer = await makeImage({ format: 'jpeg' });
    const result = await validateAndProcessImage(buffer, 'image/jpeg');
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  test('a genuine PNG declared as image/png is accepted', async () => {
    const buffer = await makeImage({ format: 'png' });
    const result = await validateAndProcessImage(buffer, 'image/png');
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  test('a genuine WebP declared as image/webp is accepted', async () => {
    const buffer = await makeImage({ format: 'webp' });
    const result = await validateAndProcessImage(buffer, 'image/webp');
    expect(result.width).toBe(4);
    expect(result.height).toBe(4);
  });

  test('a declared image/png whose real bytes are a JPEG is rejected as a mismatch', async () => {
    const actualJpeg = await makeImage({ format: 'jpeg' });
    await expect(
      validateAndProcessImage(actualJpeg, 'image/png'),
    ).rejects.toThrow(
      "This file's actual content does not match its declared image type.",
    );
  });

  test('arbitrary non-image bytes declared as image/png are rejected as corrupt/unreadable', async () => {
    const arbitraryBytes = Buffer.from(
      'this is plain text, not an image at all — no magic bytes here',
    );
    await expect(
      validateAndProcessImage(arbitraryBytes, 'image/png'),
    ).rejects.toThrow('This image is corrupt or could not be read.');
  });

  test('a truncated/corrupt PNG is rejected', async () => {
    const validPng = await makeImage({ format: 'png' });
    const truncated = validPng.subarray(0, Math.floor(validPng.length / 2));
    await expect(
      validateAndProcessImage(truncated, 'image/png'),
    ).rejects.toThrow('This image is corrupt or could not be read.');
  });

  test('an image wider than the maximum allowed width is rejected', async () => {
    const buffer = await makeImage({
      width: MAX_IMAGE_WIDTH_PX + 1,
      height: 1,
      format: 'png',
    });
    await expect(validateAndProcessImage(buffer, 'image/png')).rejects.toThrow(
      'This image is too large to process. Use a smaller image.',
    );
  }, 20_000);

  test('an image taller than the maximum allowed height is rejected', async () => {
    const buffer = await makeImage({
      width: 1,
      height: MAX_IMAGE_HEIGHT_PX + 1,
      format: 'png',
    });
    await expect(validateAndProcessImage(buffer, 'image/png')).rejects.toThrow(
      'This image is too large to process. Use a smaller image.',
    );
  }, 20_000);

  test('an image within all limits is accepted at exactly the width boundary', async () => {
    // A 1px-tall strip at exactly the max width is cheap to synthesize
    // and proves the boundary is inclusive (<=), not off-by-one strict.
    const buffer = await makeImage({
      width: MAX_IMAGE_WIDTH_PX,
      height: 1,
      format: 'png',
    });
    const result = await validateAndProcessImage(buffer, 'image/png');
    expect(result.width).toBe(MAX_IMAGE_WIDTH_PX);
  }, 20_000);

  test('EXIF/GPS metadata is stripped and visual orientation is preserved', async () => {
    const withExif = await sharp({
      create: {
        width: 4,
        height: 2,
        channels: 3,
        background: { r: 10, g: 200, b: 10 },
      },
    })
      .jpeg()
      .withMetadata({
        orientation: 6, // 90° rotation — swaps width/height once baked in
        exif: {
          IFD0: { Make: 'TestCam' },
          GPS: { GPSLatitude: '40/1 11/1 0/1', GPSLatitudeRef: 'N' },
        },
      })
      .toBuffer();

    const inputMeta = await sharp(withExif).metadata();
    expect(inputMeta.exif).toBeDefined();
    expect(inputMeta.orientation).toBe(6);

    const result = await validateAndProcessImage(withExif, 'image/jpeg');
    // Orientation 6 swaps the reported dimensions once baked in.
    expect(result.width).toBe(2);
    expect(result.height).toBe(4);

    const outputMeta = await sharp(result.buffer).metadata();
    expect(outputMeta.exif).toBeUndefined();
    expect(outputMeta.orientation).toBeUndefined();
    expect(outputMeta.width).toBe(2);
    expect(outputMeta.height).toBe(4);
  });
});

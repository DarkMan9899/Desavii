/**
 * Sprint 7: "Integrate listings with the existing storage abstraction.
 * Allow attaching media records to listings." Reuses the local
 * `StorageProvider` and `mediaConstraints.js` MIME/size checks, mirroring
 * `tests/integration/users/userProfile.test.js`'s avatar-upload test.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import sharp from 'sharp';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let vendor;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function createDraftListing() {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Media Test ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        },
      ],
    });
  return res.body.data.id;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /listings/:id/media — attach', () => {
  test('the owner can attach an image; the first image becomes the cover', async () => {
    const listingId = await createDraftListing();

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    expect(res.status).toBe(201);
    expect(res.body.data.media_type).toBe('IMAGE');
    expect(res.body.data.is_cover).toBe(true);
    expect(res.body.data.moderation_status).toBe('PENDING');
  });

  test('a non-owner cannot attach media (403)', async () => {
    const listingId = await createDraftListing();

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    expect(res.status).toBe(403);
  });

  test('rejects an unsupported content type', async () => {
    const listingId = await createDraftListing();

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'application/zip')
      .send(Buffer.from('not really a zip'));

    expect([415, 422]).toContain(res.status);
  });
});

describe('GET /listings/:id/media — list', () => {
  test('lists media attached to the listing, ordered by position', async () => {
    const listingId = await createDraftListing();
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    // The listing is a DRAFT (never published in this file) — an
    // anonymous request 404s via ListingService.getListing's masking, so
    // this owner-media-management check must authenticate as the owner.
    const res = await request(app)
      .get(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('PATCH /listings/:id/media/:mediaId — reorder / set cover', () => {
  test('the owner can update position and cover flag', async () => {
    const listingId = await createDraftListing();
    const attachRes = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const mediaId = attachRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ position: 3, isCover: false });

    expect(res.status).toBe(200);
    expect(res.body.data.position).toBe(3);
    expect(res.body.data.is_cover).toBe(false);
  });
});

describe('DELETE /listings/:id/media/:mediaId — remove', () => {
  test('the owner can remove media; it no longer appears in the list', async () => {
    const listingId = await createDraftListing();
    const attachRes = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const mediaId = attachRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/listings/${listingId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(listRes.body.data).toHaveLength(0);
  });
});

// Step L3 — image upload UX + media security hardening (brief §28/§30).
// Real content/magic-byte detection, corrupt-image rejection, and the
// per-kind body-parser limit are exercised here through the real HTTP
// route (`imageContentValidator.test.js` already unit-tests the same
// logic in isolation; this proves it's actually wired in). "No rejected
// file remains in storage" (brief §28) is proven at the unit level
// instead of by introspecting the local filesystem here — every
// content-validation failure below is rejected BEFORE
// `ListingService#attachMedia` ever calls `storageProvider.put`
// (`listingService.attachMedia.test.js`'s own "never calls storage.put
// at all for an image that fails content validation" test), so there is
// nothing for a filesystem check to find in the first place.
describe('Step L3 — media upload security hardening', () => {
  async function makeImage(format, { width = 2, height = 2 } = {}) {
    const image = sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    });
    if (format === 'jpeg') return image.jpeg().toBuffer();
    if (format === 'webp') return image.webp().toBuffer();
    return image.png().toBuffer();
  }

  test('a genuine JPEG is accepted', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/jpeg')
      .send(await makeImage('jpeg'));
    expect(res.status).toBe(201);
    expect(res.body.data.media_type).toBe('IMAGE');
  });

  test('a genuine WebP is accepted', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/webp')
      .send(await makeImage('webp'));
    expect(res.status).toBe(201);
    expect(res.body.data.media_type).toBe('IMAGE');
  });

  test('SVG is rejected', async () => {
    const listingId = await createDraftListing();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>',
    );
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/svg+xml')
      .send(svg);
    expect([415, 422]).toContain(res.status);
  });

  test('GIF is rejected', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/gif')
      .send(Buffer.from('GIF89a not really decodable'));
    expect([415, 422]).toContain(res.status);
  });

  test('BMP is rejected', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/bmp')
      .send(Buffer.from('BM not really decodable'));
    expect([415, 422]).toContain(res.status);
  });

  test('a declared image/png whose actual bytes are a JPEG is rejected as a content mismatch', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(await makeImage('jpeg'));
    expect(res.status).toBe(422);
  });

  test('a declared image/png with arbitrary non-image bytes is rejected', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('this is definitely not a png'));
    expect(res.status).toBe(422);
  });

  test('a truncated/corrupt PNG is rejected', async () => {
    const listingId = await createDraftListing();
    const truncated = ONE_PX_PNG.subarray(0, Math.floor(ONE_PX_PNG.length / 2));
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(truncated);
    expect(res.status).toBe(422);
  });

  test('an image over 10 MiB is rejected at the body-parser boundary (413), never reaching image processing', async () => {
    const listingId = await createDraftListing();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(oversized);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  }, 30_000);

  test('a request exactly at the 10 MiB image boundary is never rejected for size (the limit is inclusive)', async () => {
    const listingId = await createDraftListing();
    const atLimit = Buffer.alloc(10 * 1024 * 1024, 0);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(atLimit);
    // Never the size-boundary rejection; real (raw-zero) bytes still
    // fail real-content validation, proving the request body itself was
    // fully accepted by the parser before that content check ever ran.
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(422);
  }, 30_000);

  test("a video's own limits/types are unaffected by the image route split", async () => {
    const listingId = await createDraftListing();
    // This route never decodes video content (no video processing
    // capability exists in this step, brief §9) — any bytes under the
    // video size ceiling with an allowed video Content-Type reach
    // storage unmodified, same as before this step.
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'video/mp4')
      .send(Buffer.from('fake mp4 bytes for a route that never decodes video'));
    expect(res.status).toBe(201);
    expect(res.body.data.media_type).toBe('VIDEO');
  });

  test('a video over the 10 MiB image limit but under the 200 MiB video ceiling is still accepted (the image limit never leaks onto video)', async () => {
    const listingId = await createDraftListing();
    const overImageLimitUnderVideoLimit = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'video/mp4')
      .send(overImageLimitUnderVideoLimit);
    expect(res.status).toBe(201);
  }, 30_000);

  test('concurrent uploads to the same listing get distinct positions and exactly one cover image', async () => {
    const listingId = await createDraftListing();
    const uploadOne = () =>
      makeImage('png').then((buf) =>
        request(app)
          .post(`/api/v1/listings/${listingId}/media`)
          .set('Authorization', `Bearer ${vendor.accessToken}`)
          .set('Content-Type', 'image/png')
          .send(buf),
      );

    const responses = await Promise.all([
      uploadOne(),
      uploadOne(),
      uploadOne(),
      uploadOne(),
      uploadOne(),
    ]);
    responses.forEach((res) => expect(res.status).toBe(201));

    const listRes = await request(app)
      .get(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const positions = listRes.body.data
      .map((m) => m.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
    expect(listRes.body.data.filter((m) => m.is_cover)).toHaveLength(1);
  }, 30_000);
});

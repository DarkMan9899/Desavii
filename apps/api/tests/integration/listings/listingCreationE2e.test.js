/**
 * Step L6 — regressions found by the full listing-creation walk:
 *
 * - a slug DERIVED from the title never blocks creation: titles that
 *   slugify to the same text (the same Latin title twice, or mixed-script
 *   titles that share only their Latin part) each get a unique slug, while
 *   an explicit `slug` keeps its 409 contract;
 * - a listing has exactly one cover: "Set as cover" clears the previous
 *   cover, so the Partner's own list never shows the listing twice.
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
import { MAX_SLUG_LENGTH } from '../../../src/core/domain/slugify.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let pool;
let auth;
let partnerId;
let languageId;
let hotelsCategoryId;

function createListing(body) {
  return request(app)
    .post('/api/v1/listings')
    .set(auth)
    .send({ partnerId, categoryIds: [hotelsCategoryId], ...body });
}

function titled(title) {
  return { translations: [{ languageId, title }] };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.vendor.email,
    password: DEV_CREDENTIALS.vendor.password,
  });
  auth = { Authorization: `Bearer ${loginRes.body.data.access_token}` };

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[hotels]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotels.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('derived slugs never block listing creation', () => {
  test('the same title twice creates two listings with distinct slugs', async () => {
    const title = `L6 Twin Hotel ${Date.now()}`;
    const first = await createListing(titled(title));
    const second = await createListing(titled(title));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.slug).not.toBe(first.body.data.slug);
    expect(second.body.data.slug.startsWith(`${first.body.data.slug}-`)).toBe(
      true,
    );
  });

  test('mixed-script titles sharing only their Latin part both create', async () => {
    const latinPart = `L6Mixed${Date.now()}`;
    const armenian = await createListing(titled(`${latinPart} Տուր Գառնի`));
    const russian = await createListing(titled(`${latinPart} Тур в Гарни`));

    expect(armenian.status).toBe(201);
    expect(russian.status).toBe(201);
    expect(russian.body.data.slug).not.toBe(armenian.body.data.slug);
  });

  test('a suffixed slug still fits the slug column', async () => {
    // At the 255-char title cap, the derived slug is longer than the column
    // and is truncated to it — the suffix must replace, not extend, it.
    const TITLE_MAX_LENGTH = 255;
    const longTitle = `L6 ${Date.now()} `.padEnd(TITLE_MAX_LENGTH, 'x');
    const first = await createListing(titled(longTitle));
    const second = await createListing(titled(longTitle));

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(second.body.data.slug).not.toBe(first.body.data.slug);
  });

  test('an explicit slug that is already taken is still a 409', async () => {
    const slug = `l6-explicit-${Date.now()}`;
    const first = await createListing({ ...titled('L6 Explicit A'), slug });
    const second = await createListing({ ...titled('L6 Explicit B'), slug });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SLUG_ALREADY_EXISTS');
  });
});

describe('a listing has exactly one cover', () => {
  async function uploadImage(listingId) {
    const image = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    })
      .jpeg()
      .toBuffer();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set(auth)
      .set('Content-Type', 'image/jpeg')
      .send(image);
    expect(res.status).toBe(201);
    return res.body.data;
  }

  test('setting a new cover clears the previous one', async () => {
    const created = await createListing(titled(`L6 Cover ${Date.now()}`));
    const listingId = created.body.data.id;
    const first = await uploadImage(listingId);
    const second = await uploadImage(listingId);
    expect(first.is_cover).toBe(true);
    expect(second.is_cover).toBe(false);

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}/media/${second.id}`)
      .set(auth)
      .send({ isCover: true });
    expect(res.status).toBe(200);
    expect(res.body.data.is_cover).toBe(true);

    const [covers] = await pool.query(
      `SELECT id FROM media
       WHERE mediable_type = 'listing' AND mediable_id = ? AND is_cover = 1 AND deleted_at IS NULL`,
      [listingId],
    );
    expect(covers.map((row) => row.id)).toEqual([second.id]);
  });

  test("the Partner's own listings list shows the listing once after a cover change", async () => {
    const created = await createListing(titled(`L6 Cover List ${Date.now()}`));
    const listingId = created.body.data.id;
    await uploadImage(listingId);
    const second = await uploadImage(listingId);
    await request(app)
      .patch(`/api/v1/listings/${listingId}/media/${second.id}`)
      .set(auth)
      .send({ isCover: true });

    const res = await request(app)
      .get(`/api/v1/search?partnerId=${partnerId}&sort=newest&limit=50`)
      .set(auth);
    expect(res.status).toBe(200);
    const rows = res.body.data.filter((row) => row.id === listingId);
    expect(rows).toHaveLength(1);
  });
});

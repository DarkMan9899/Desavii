/**
 * Sprint 7: "Only listing owners (hosts) or authorized admins may modify
 * listings." Exercises the "Owner or `{permission}`" pattern
 * (API_SPECIFICATION.md §5/§38) — ownership is Sprint 6's `isPartnerOwner`
 * check, the permission fallback is the seeded `listing.*` permission set
 * (seeds/004_roles_and_permissions.js).
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
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

let pool;
let vendor;
let customer;
let admin;
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
          title: `Ownership Test ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
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
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
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

describe('a non-owner without a listing.* permission is rejected (403)', () => {
  test('cannot update', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ isContactVisible: true });
    expect(res.status).toBe(403);
  });

  test('cannot delete', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('cannot publish', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    expect(res.status).toBe(403);
  });
});

describe('SUPER_ADMIN passes via the listing.* permission fallback, not ownership', () => {
  test('can update a listing it does not own', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ isContactVisible: true });
    expect(res.status).toBe(200);
  });

  test('can delete a listing it does not own', async () => {
    const listingId = await createDraftListing();
    const res = await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
  });
});

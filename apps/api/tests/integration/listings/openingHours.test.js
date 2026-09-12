/**
 * Pass 6 (Restaurant vertical, owner issue #13) — weekly opening hours
 * (migration 0046). Mirrors `restaurantMenu.test.js`'s real-listing setup
 * (vendor@travelhub.dev owns the verified `yerevan-boutique-hospitality`
 * partner), plus a genuine second, distinct partner OWNER (not just an
 * unrelated customer) via the same `registerAndApproveOtherPartner` flow
 * `bookingOwnership.test.js` already establishes — the real test of the
 * ownership predicate, not just of permission absence.
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
let otherVendor;
let partnerId;
let languageId;
let restaurantListingId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerAndApproveOtherPartner() {
  const email = `other-vendor-oh-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'OtherVendor!2024',
    firstName: 'Other',
    lastName: 'Vendor',
  });
  const accessToken = registerRes.body.data.access_token;

  const createRes = await request(app)
    .post('/api/v1/partners/applications')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ displayName: 'Cross-Partner Opening Hours Fixture' });
  const otherPartnerId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/partners/applications/${otherPartnerId}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      legalName: 'Cross-Partner Opening Hours Fixture LLC',
      email: 'contact@crosspartneroh.example',
      phone: '+37400000098',
      description: 'RBAC fixture partner — never used for real bookings.',
    });
  await request(app)
    .post(`/api/v1/partners/applications/${otherPartnerId}/submit`)
    .set('Authorization', `Bearer ${accessToken}`);

  const admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  await request(app)
    .patch(`/api/v1/partners/admin/${otherPartnerId}/verification-status`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ status: 'APPROVED' });

  return { accessToken };
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
  otherVendor = await registerAndApproveOtherPartner();

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[restaurantCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'restaurants'",
  );

  const createRestaurant = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [
        {
          languageId,
          title: `Opening Hours Test Restaurant ${Date.now()}`,
          summary: 'A test restaurant listing for opening hours.',
        },
      ],
      categoryIds: [restaurantCategory.id],
    });
  restaurantListingId = createRestaurant.body.data.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Opening Hours (GET/PUT)', () => {
  test('an unauthored listing has no hours — an honest empty list, never a fabricated 24/7 or closed default', async () => {
    const res = await request(app).get(
      `/api/v1/listings/${restaurantListingId}/opening-hours`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('a non-owner (customer) cannot author hours', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ days: [{ dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' }] });
    expect(res.status).toBe(403);
  });

  test("a genuinely distinct partner owner cannot author another partner's hours", async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${otherVendor.accessToken}`)
      .send({ days: [{ dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' }] });
    expect(res.status).toBe(403);
  });

  test('an open day missing closesAt is rejected structurally', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ days: [{ dayOfWeek: 1, opensAt: '11:00' }] });
    expect(res.status).toBe(422);
  });

  test('the same day listed twice is rejected structurally', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        days: [
          { dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' },
          { dayOfWeek: 1, isClosed: true },
        ],
      });
    expect(res.status).toBe(422);
  });

  test('the owner can author a full week, including a closed day and an overnight window', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        days: [
          { dayOfWeek: 0, isClosed: true },
          { dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' },
          { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        day_of_week: 0,
        opens_at: null,
        closes_at: null,
        is_closed: true,
      },
      {
        day_of_week: 1,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: false,
      },
      {
        day_of_week: 5,
        opens_at: '18:00',
        closes_at: '02:00',
        is_closed: false,
      },
    ]);
  });

  test('the public GET reflects exactly what was authored, with no re-derivation', async () => {
    const res = await request(app).get(
      `/api/v1/listings/${restaurantListingId}/opening-hours`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.find((day) => day.day_of_week === 5)).toMatchObject({
      opens_at: '18:00',
      closes_at: '02:00',
    });
  });

  test('re-authoring fully replaces the previous week, never merges with it', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${restaurantListingId}/opening-hours`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ days: [{ dayOfWeek: 2, opensAt: '09:00', closesAt: '17:00' }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        day_of_week: 2,
        opens_at: '09:00',
        closes_at: '17:00',
        is_closed: false,
      },
    ]);
  });
});

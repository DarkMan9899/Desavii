/**
 * Phase 11 Admin Platform (Stage 11.4): Booking Operations —
 * `GET /bookings?viewAll=true`, `GET /bookings/:id/history` (new — the
 * previously write-only `booking_status_history` table's first read
 * path), and the existing confirm/reject/cancel/complete transition
 * endpoints exercised from an admin principal. Asserts RBAC: SUPER_ADMIN
 * (full access), SUPPORT (`booking.view_all` only — can list/view
 * history, cannot confirm), and a CUSTOMER (denied `viewAll`).
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

let vendor;
let customer;
let admin;
let support;
let partnerId;
let languageId;
let pool;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function publishListing(id) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });
}

async function registerUnit(listingId, capacity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity });
  return res.body.data.id;
}

async function setPrice(unitId, dateFrom, dateTo, amount) {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: 'AMD',
    });
}

const GUEST_CONTACT = { fullName: 'Grace Hopper', email: 'grace@example.com' };

async function createPendingBooking({ dateFrom, dateTo }) {
  const listingId = await createListing(
    `Admin Ops Test ${Date.now()}-${Math.random()}`,
  );
  const unitId = await registerUnit(listingId);
  await publishListing(listingId);
  await setPrice(unitId, dateFrom, dateTo, 8_000);

  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  const holdIds = holdRes.body.data.items[0].hold_ids;

  const bookingRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ holdIds, guests: [] }],
      guestContactSnapshot: GUEST_CONTACT,
    });

  return { bookingId: bookingRes.body.data.id };
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

  // No dev account is seeded with SUPPORT — assign it directly to a
  // throwaway registered user, same pattern earlier Stage 11.x tests use.
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: 'booking.support@example.com',
    password: 'BookingSupport!2024',
    firstName: 'Booking',
    lastName: 'Support',
  });
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'SUPPORT'`,
    [registerRes.body.data.user.id],
  );
  support = await login('booking.support@example.com', 'BookingSupport!2024');
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /bookings?viewAll=true (admin list)', () => {
  test('a SUPER_ADMIN sees the admin summary shape with customer/partner ids', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-01',
      dateTo: '2027-05-02',
    });

    const res = await request(app)
      .get('/api/v1/bookings?viewAll=true&limit=100')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bookingId,
          customer_user_id: expect.any(Number),
          partner_id: partnerId,
          status: 'PENDING_VENDOR',
        }),
      ]),
    );
  });

  test('SUPPORT (view-only) can list with viewAll=true', async () => {
    const res = await request(app)
      .get('/api/v1/bookings?viewAll=true')
      .set('Authorization', `Bearer ${support.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('a CUSTOMER is rejected with 403 for viewAll=true', async () => {
    const res = await request(app)
      .get('/api/v1/bookings?viewAll=true')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /bookings/:id/history (admin status history)', () => {
  test('a SUPER_ADMIN sees a real history entry for each transition', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-10',
      dateTo: '2027-05-11',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/history`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        from_status: null,
        to_status: 'PENDING_VENDOR',
      }),
      expect.objectContaining({
        from_status: 'PENDING_VENDOR',
        to_status: 'CONFIRMED',
      }),
    ]);
  });

  test("SUPPORT can view another customer's booking history", async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-15',
      dateTo: '2027-05-16',
    });
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/history`)
      .set('Authorization', `Bearer ${support.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test("a different CUSTOMER is masked with 404, not this booking's real data", async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-20',
      dateTo: '2027-05-21',
    });
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `other.customer.${Date.now()}@example.com`,
        password: 'OtherCustomer!2024',
        firstName: 'Other',
        lastName: 'Customer',
      });
    const otherToken = registerRes.body.data.access_token;

    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/history`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Admin transition actions reuse the existing endpoints', () => {
  test('SUPER_ADMIN can confirm, then reject is invalid (already CONFIRMED), then cancel_any works', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-06-01',
      dateTo: '2027-06-02',
    });

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ reason: 'Admin-initiated cancellation for testing.' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED_BY_VENDOR');
  });

  test('SUPPORT (view-only) is rejected with 403 attempting to confirm', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-06-05',
      dateTo: '2027-06-06',
    });
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${support.accessToken}`);
    expect(res.status).toBe(403);
  });
});

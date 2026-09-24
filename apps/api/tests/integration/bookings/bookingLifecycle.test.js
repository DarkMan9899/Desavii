/**
 * Sprint 10: the booking status machine's transition endpoints, reusing
 * `core/domain/bookingStatusTransitions.js` unchanged. Exercises every
 * legal transition this sprint exposes plus an illegal one, and confirms
 * reject/cancel restore the capacity their items had consumed.
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
let partnerId;
let languageId;

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

/**
 * `BookingService.createBooking` resolves the listing via `ListingService
 * .getListing(principal, ...)` with the CUSTOMER as principal — a DRAFT
 * listing 404s for any non-owner (correct masking, same as
 * `listings/listingCrud.test.js`), so every listing a customer will book
 * in this file must actually be published first.
 */
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

/** Full flow: listing + unit + price + hold + booking, ready for a lifecycle transition. */
async function createPendingBooking({ dateFrom, dateTo }) {
  const listingId = await createListing(
    `Lifecycle Test ${Date.now()}-${Math.random()}`,
  );
  // Unit must exist BEFORE publish — Phase 5's publish-readiness gate now
  // requires >=1 bookable unit (ListingService#checkPublishReadiness).
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

  return {
    listingId,
    unitId,
    bookingId: bookingRes.body.data.id,
    dateFrom,
    dateTo,
  };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

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

  const pool = getMysqlPool();
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

describe('POST /bookings/:id/confirm', () => {
  test('the listing owner can confirm a PENDING_VENDOR booking', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-04-01',
      dateTo: '2027-04-02',
    });

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.confirmed_at).toBeTruthy();
  });

  test('confirming an already-CONFIRMED booking is rejected with 409 INVALID_BOOKING_TRANSITION', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-04-05',
      dateTo: '2027-04-06',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_BOOKING_TRANSITION');
  });

  test('a non-owner without booking.confirm is rejected with 403', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-04-10',
      dateTo: '2027-04-11',
    });
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('an admin can confirm via the booking.confirm permission fallback', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-04-15',
      dateTo: '2027-04-16',
    });
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /bookings/:id/reject — restores capacity', () => {
  test('rejecting frees the unit for the same date range again', async () => {
    const { bookingId, unitId, dateFrom, dateTo } = await createPendingBooking({
      dateFrom: '2027-05-01',
      dateTo: '2027-05-02',
    });

    const blockedHold = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(blockedHold.status).toBe(409);

    const rejectRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Fully booked elsewhere' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.cancellation_reason).toBe(
      'Fully booked elsewhere',
    );

    const freedHold = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(freedHold.status).toBe(201);
  });
});

describe('POST /bookings/:id/cancel — customer vs. vendor', () => {
  test("the booking's own customer cancels into CANCELLED_BY_CUSTOMER", async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-10',
      dateTo: '2027-05-11',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Change of plans' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED_BY_CUSTOMER');
  });

  test('the listing owner cancels into CANCELLED_BY_VENDOR', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-15',
      dateTo: '2027-05-16',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED_BY_VENDOR');
  });

  test('an admin (booking.cancel_any) can cancel a booking that is not theirs', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-05-20',
      dateTo: '2027-05-21',
    });
    // CANCELLED_BY_VENDOR/CANCELLED_BY_CUSTOMER are only legal from
    // CONFIRMED (core/domain/bookingStatusTransitions.js) — a booking
    // still PENDING_VENDOR is rejected via REJECT/EXPIRED, not cancel.
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED_BY_VENDOR');
  });
});

describe('POST /bookings/:id/complete and /no-show', () => {
  test('the listing owner marks a confirmed booking COMPLETED', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-06-01',
      dateTo: '2027-06-02',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  test('the listing owner marks a confirmed booking NO_SHOW', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-06-05',
      dateTo: '2027-06-06',
    });
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/no-show`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('NO_SHOW');
  });

  test('completing a still-PENDING_VENDOR booking is rejected with 409', async () => {
    const { bookingId } = await createPendingBooking({
      dateFrom: '2027-06-10',
      dateTo: '2027-06-11',
    });
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_BOOKING_TRANSITION');
  });
});

/**
 * Pass 6 (Restaurant vertical, owner issue #12/#13) — a real reservation
 * time for a RESTAURANT_TABLE unit, end to end: `POST /booking-holds`
 * persists the customer's chosen time, and `POST /bookings` carries it
 * through onto the real `booking_items` row (never re-derived, never
 * silently dropped the way every non-VEHICLE unit type used to be
 * treated before this pass — see `AvailabilityService#reserveCapacity`'s
 * and `BookingService#resolveItem`'s own comments for why RESTAURANT_TABLE
 * now gets the same treatment VEHICLE already had).
 *
 * Deliberately mirrors `booking-holds/carRentalInterval.test.js`'s own
 * structure rather than inventing a new one.
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
let partnerId;
let languageId;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function createRestaurantListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [{ languageId, title }],
    });
  const listingId = res.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'RESTAURANT_TABLE', capacity: 10 });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);

  return { listingId, unitId: unitRes.body.data.id };
}

async function setPrice(unitId, dateFrom, dateTo, amount, currency = 'AMD') {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: currency,
    });
}

function createHold(unitId, date, reservationTime) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [
        {
          bookableUnitId: unitId,
          dateFrom: date,
          dateTo: date,
          startTime: reservationTime,
        },
      ],
    });
}

const GUEST_CONTACT = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+37400000000',
};

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

describe('POST /booking-holds — Restaurant reservation time persistence', () => {
  test('a RESTAURANT_TABLE hold persists and echoes the real reservation time, with no end time (a reservation is a point in time, not an interval)', async () => {
    const { unitId } = await createRestaurantListing(
      `Restaurant Time Test ${Date.now()}`,
    );

    const res = await createHold(unitId, '2027-09-10', '19:30');

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].start_time).toBe('19:30');
    expect(res.body.data.items[0].end_time).toBeNull();
  });
});

describe('POST /bookings — a Restaurant reservation carries its real time onto the booking item', () => {
  test('the booked reservation time is exactly what the customer chose, never re-derived', async () => {
    const { listingId, unitId } = await createRestaurantListing(
      `Restaurant Booking Time Test ${Date.now()}`,
    );
    const date = '2027-09-15';
    await setPrice(unitId, date, date, 6500);

    const holdRes = await createHold(unitId, date, '20:00');
    const holdIds = holdRes.body.data.items[0].hold_ids;

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.listing_id).toBe(listingId);
    expect(res.body.data.booking_type).toBe('RESTAURANT_RESERVATION');
    expect(res.body.data.items[0].start_time).toBe('20:00');
    expect(res.body.data.items[0].end_time).toBeNull();
    // A restaurant reservation has no pickup/return leg — those fields
    // stay the VEHICLE-only concept they always were.
    expect(res.body.data.items[0].pickup_location).toBeNull();
    expect(res.body.data.items[0].return_location).toBeNull();
  });
});

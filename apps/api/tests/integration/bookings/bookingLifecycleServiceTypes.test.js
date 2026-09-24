/**
 * Phase 17 §5 (Service-Specific Customer Flows) — proves the exact same
 * full booking lifecycle `bookingLifecycle.test.js` already exercises for
 * `HOTEL_ROOM` (hold → create → confirm/reject-restores-capacity) also
 * works, unmodified, for a single-day non-accommodation type
 * (`TOUR_DEPARTURE`, inclusive-both-ends per `resolveConsumedRange`) and
 * a multi-day non-accommodation type (`VEHICLE`, also inclusive-both-ends —
 * unlike `HOTEL_ROOM`/`PROPERTY_UNIT`'s checkout-exclusive nights). This
 * is the concrete proof that the shared Inventory Engine has zero
 * hotel-only logic, not just a structural code-reading claim.
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

let admin;
let vendor;
let customer;
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

async function createListing(title, listingType) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType,
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

async function registerUnit(listingId, bookableUnitType, capacity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType, capacity });
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

const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };

async function createPendingBooking({
  listingType,
  bookableUnitType,
  dateFrom,
  dateTo,
}) {
  const listingId = await createListing(
    `${bookableUnitType} Lifecycle Test ${Date.now()}-${Math.random()}`,
    listingType,
  );
  const unitId = await registerUnit(listingId, bookableUnitType);
  await publishListing(listingId);
  await setPrice(unitId, dateFrom, dateTo, 8_000);

  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  expect(holdRes.status).toBe(201);
  const holdIds = holdRes.body.data.items[0].hold_ids;

  const bookingRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ holdIds, guests: [] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  expect(bookingRes.status).toBe(201);

  return { listingId, unitId, bookingId: bookingRes.body.data.id };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );

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

describe.each([
  {
    label: 'Tour (single-day departure)',
    listingType: 'TOUR',
    bookableUnitType: 'TOUR_DEPARTURE',
    dateFrom: '2027-06-01',
    dateTo: '2027-06-01',
  },
  {
    label: 'Car Rental (multi-day)',
    listingType: 'CAR_RENTAL',
    bookableUnitType: 'VEHICLE',
    dateFrom: '2027-06-10',
    dateTo: '2027-06-13',
  },
  {
    label: 'Restaurant table (single-day, time-based service proxy)',
    listingType: 'HOTEL',
    bookableUnitType: 'RESTAURANT_TABLE',
    dateFrom: '2027-06-20',
    dateTo: '2027-06-20',
  },
])(
  'full booking lifecycle for $label — no hotel-only logic',
  ({ listingType, bookableUnitType, dateFrom, dateTo }) => {
    test('confirm transitions the booking and keeps capacity consumed', async () => {
      const { bookingId } = await createPendingBooking({
        listingType,
        bookableUnitType,
        dateFrom,
        dateTo,
      });

      const res = await request(app)
        .post(`/api/v1/bookings/${bookingId}/confirm`)
        .set('Authorization', `Bearer ${vendor.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CONFIRMED');
    });

    test('reject restores capacity for the exact same date range', async () => {
      const { bookingId, unitId } = await createPendingBooking({
        listingType,
        bookableUnitType,
        dateFrom,
        dateTo,
      });

      const blockedHold = await request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
        });
      expect(blockedHold.status).toBe(409);
      expect(blockedHold.body.error.code).toBe('AVAILABILITY_CONFLICT');

      const rejectRes = await request(app)
        .post(`/api/v1/bookings/${bookingId}/reject`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ reason: 'Unavailable' });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');

      const freedHold = await request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
        });
      expect(freedHold.status).toBe(201);
    });
  },
);

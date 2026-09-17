/**
 * Phase 12 (Product Polish): the Reviews module's first real endpoints —
 * `POST /reviews` and `GET /reviews`. Builds a real booking through to
 * COMPLETED via the existing confirm/complete transition endpoints
 * (mirrors `bookings/bookingLifecycle.test.js`'s own setup), since a
 * review is only ever submittable against a genuinely completed booking.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import { closeMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

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
const GUEST_CONTACT = { fullName: 'Grace Hopper', email: 'grace@example.com' };

async function createCompletedBooking() {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Reviewable Listing ${Date.now()}-${Math.random()}`,
        },
      ],
    });
  const listingId = listingRes.body.data.id;

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
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1 });
  const unitId = unitRes.body.data.id;

  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  const dateFrom = '2027-01-10';
  const dateTo = '2027-01-12';
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: 8_000,
      priceOverrideCurrency: 'AMD',
    });

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
  const bookingId = bookingRes.body.data.id;

  await request(app)
    .post(`/api/v1/bookings/${bookingId}/confirm`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
  await request(app)
    .post(`/api/v1/bookings/${bookingId}/complete`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);

  return { listingId, bookingId };
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

  const { getMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js');
  const pool = getMysqlPool();
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /reviews', () => {
  test('submits a review for a COMPLETED booking and surfaces it on GET /reviews', async () => {
    const { listingId, bookingId } = await createCompletedBooking();

    const submitRes = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        bookingId,
        rating: 5,
        title: 'Wonderful stay',
        content: 'Loved it.',
      });

    expect(submitRes.status).toBe(201);
    expect(submitRes.body.data).toEqual(
      expect.objectContaining({
        booking_id: bookingId,
        listing_id: listingId,
        rating: 5,
        title: 'Wonderful stay',
        status: 'APPROVED',
      }),
    );

    const listRes = await request(app).get(
      `/api/v1/reviews?listingId=${listingId}`,
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Wonderful stay', rating: 5 }),
      ]),
    );
    expect(listRes.body.meta).toEqual(
      expect.objectContaining({ rating_average: 5, review_count: 1 }),
    );
  });

  test('rejects a second review for the same booking with 409', async () => {
    const { bookingId } = await createCompletedBooking();

    await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId, rating: 4 });

    const secondRes = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId, rating: 3 });

    expect(secondRes.status).toBe(409);
  });

  test('rejects a review for a booking that is not COMPLETED', async () => {
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Not Yet Reviewable ${Date.now()}` },
        ],
      });
    const listingId = listingRes.body.data.id;
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
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1 });
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });
    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId: unitRes.body.data.id,
        dateFrom: '2027-02-10',
        dateTo: '2027-02-12',
        status: 'AVAILABLE',
        priceOverrideAmount: 8_000,
        priceOverrideCurrency: 'AMD',
      });
    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitRes.body.data.id,
            dateFrom: '2027-02-10',
            dateTo: '2027-02-12',
            quantity: 1,
          },
        ],
      });
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds: holdRes.body.data.items[0].hold_ids, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    const res = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: bookingRes.body.data.id, rating: 5 });

    expect(res.status).toBe(422);
  });
});

/**
 * P1.5 (Master Roadmap, Review Trust & Safety): admin moderation queue
 * (`GET/PATCH /reviews/admin*`) and customer reporting
 * (`POST /reviews/:id/report`). Builds a real, auto-APPROVED review
 * through the same completed-booking flow `reviews.test.js` already
 * establishes.
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
let admin;
let partnerId;
let languageId;
let pool;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerUser(label) {
  const email = `revmod-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'RevModFixture!2024',
    firstName: 'Rev',
    lastName: label,
  });
  return { accessToken: res.body.data.access_token };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Grace Hopper', email: 'grace@example.com' };

/** Mirrors `reviews.test.js#createCompletedBooking`, then submits and returns the review. */
async function createApprovedReview(customer) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Moderation Test Listing ${Date.now()}-${Math.random()}`,
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
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  const dateFrom = '2027-03-10';
  const dateTo = '2027-03-12';
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

  const reviewRes = await request(app)
    .post('/api/v1/reviews')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      bookingId,
      rating: 3,
      title: 'Mixed feelings',
      content: 'It was okay.',
    });

  return { listingId, reviewId: reviewRes.body.data.id };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  pool = getMysqlPool();
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

describe('Review moderation (P1.5)', () => {
  test('a non-moderator cannot access the moderation queue (403)', async () => {
    const customer = await registerUser('nonmod');
    const res = await request(app)
      .get('/api/v1/reviews/admin')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('an unauthenticated request to the moderation queue is rejected (401)', async () => {
    const res = await request(app).get('/api/v1/reviews/admin');
    expect(res.status).toBe(401);
  });

  test('an admin can list, view, and reject a review; it disappears from the public list and the author is notified', async () => {
    const customer = await registerUser('rejectflow');
    const { listingId, reviewId } = await createApprovedReview(customer);

    const listRes = await request(app)
      .get('/api/v1/reviews/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ hasReports: 'false' });
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((row) => row.id === reviewId)).toBe(true);

    const detailRes = await request(app)
      .get(`/api/v1/reviews/admin/${reviewId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.listing_title).toEqual(
      expect.stringContaining('Moderation Test Listing'),
    );
    expect(detailRes.body.data.reports).toEqual([]);

    const rejectRes = await request(app)
      .patch(`/api/v1/reviews/admin/${reviewId}/moderation-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Violates guidelines.' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.moderation_notes).toBe('Violates guidelines.');

    const publicListRes = await request(app).get(
      `/api/v1/reviews?listingId=${listingId}`,
    );
    expect(publicListRes.body.data.some((row) => row.id === reviewId)).toBe(
      false,
    );

    const [[notificationRow]] = await pool.query(
      `SELECT payload FROM notifications
       WHERE category_id = (SELECT id FROM notification_categories WHERE code = 'REVIEW')
       ORDER BY id DESC LIMIT 1`,
    );
    expect(notificationRow).toBeTruthy();
  });

  test('a customer can report a review; a duplicate report from the same customer is rejected (409)', async () => {
    const author = await registerUser('reportedauthor');
    const reporter = await registerUser('reporter');
    const { reviewId } = await createApprovedReview(author);

    const reportRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ reasonCode: 'SPAM', details: 'Looks like an ad.' });
    expect(reportRes.status).toBe(201);
    expect(reportRes.body.data.reason).toBe('SPAM');

    const duplicateRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ reasonCode: 'ABUSIVE' });
    expect(duplicateRes.status).toBe(409);

    const detailRes = await request(app)
      .get(`/api/v1/reviews/admin/${reviewId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(detailRes.body.data.report_count).toBe(1);
    expect(detailRes.body.data.reports).toHaveLength(1);
    expect(detailRes.body.data.reports[0].reason).toBe('SPAM');

    const queueRes = await request(app)
      .get('/api/v1/reviews/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ hasReports: 'true' });
    expect(queueRes.body.data.some((row) => row.id === reviewId)).toBe(true);
  });

  test('reporting requires authentication (401) and rejects an unknown review id (404)', async () => {
    const unauthRes = await request(app)
      .post('/api/v1/reviews/999999/report')
      .send({ reasonCode: 'SPAM' });
    expect(unauthRes.status).toBe(401);

    const reporter = await registerUser('reportmissing');
    const notFoundRes = await request(app)
      .post('/api/v1/reviews/999999/report')
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ reasonCode: 'SPAM' });
    expect(notFoundRes.status).toBe(404);
  });

  test('an invalid report reason is rejected (422)', async () => {
    const author = await registerUser('invalidreasonauthor');
    const reporter = await registerUser('invalidreasonreporter');
    const { reviewId } = await createApprovedReview(author);

    const res = await request(app)
      .post(`/api/v1/reviews/${reviewId}/report`)
      .set('Authorization', `Bearer ${reporter.accessToken}`)
      .send({ reasonCode: 'NOT_A_REAL_REASON' });
    expect(res.status).toBe(422);
  });
});

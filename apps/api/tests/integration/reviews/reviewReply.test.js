/**
 * P1.5 (Master Roadmap, Review Trust & Safety) — partner reply to a
 * review (`PUT`/`DELETE /reviews/:id/reply`). Builds a real, auto-
 * APPROVED review through the same completed-booking flow
 * `reviewModeration.test.js` already establishes, reusing the same
 * seeded dev vendor/partner (`yerevan-boutique-hospitality`, the vendor
 * is that partner's OWNER).
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
  const email = `revreply-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'RevReplyFixture!2024',
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

/** Mirrors `reviewModeration.test.js#createApprovedReview` exactly. */
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
          title: `Reply Test Listing ${Date.now()}-${Math.random()}`,
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

  const dateFrom = '2027-04-10';
  const dateTo = '2027-04-12';
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
      rating: 4,
      title: 'Solid stay',
      content: 'Would come back.',
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

describe('Partner reply to a review (P1.5)', () => {
  test('an unauthenticated request is rejected (401)', async () => {
    const customer = await registerUser('anon');
    const { reviewId } = await createApprovedReview(customer);

    const res = await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .send({ response: 'Thanks for staying with us!' });

    expect(res.status).toBe(401);
  });

  test('an authenticated user with no relationship to the partner is rejected (403)', async () => {
    const customer = await registerUser('noaccess');
    const { reviewId } = await createApprovedReview(customer);
    const outsider = await registerUser('outsider');

    const res = await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${outsider.accessToken}`)
      .send({ response: 'I should not be able to post this.' });

    expect(res.status).toBe(403);
  });

  test("the listing's own partner OWNER can reply, and the reply is publicly visible", async () => {
    const customer = await registerUser('happy');
    const { listingId, reviewId } = await createApprovedReview(customer);

    const replyRes = await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: 'Thank you for the kind words — see you again soon!' });

    expect(replyRes.status).toBe(200);
    expect(replyRes.body.data.vendor_response).toBe(
      'Thank you for the kind words — see you again soon!',
    );
    expect(replyRes.body.data.vendor_responded_at).not.toBeNull();

    const publicRes = await request(app)
      .get('/api/v1/reviews')
      .query({ listingId });
    const publicReview = publicRes.body.data.find((r) => r.id === reviewId);
    expect(publicReview.vendor_response).toBe(
      'Thank you for the kind words — see you again soon!',
    );
  });

  test('the same OWNER can edit an existing reply (PUT overwrites)', async () => {
    const customer = await registerUser('edit');
    const { reviewId } = await createApprovedReview(customer);

    await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: 'First version.' });

    const editRes = await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: 'Edited version.' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.data.vendor_response).toBe('Edited version.');
  });

  test('the OWNER can delete an existing reply, clearing it from public view', async () => {
    const customer = await registerUser('delete');
    const { listingId, reviewId } = await createApprovedReview(customer);

    await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: 'Will be deleted.' });

    const deleteRes = await request(app)
      .delete(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.data.vendor_response).toBeNull();

    const publicRes = await request(app)
      .get('/api/v1/reviews')
      .query({ listingId });
    const publicReview = publicRes.body.data.find((r) => r.id === reviewId);
    expect(publicReview.vendor_response).toBeNull();
  });

  test('an empty response body is rejected by validation (422)', async () => {
    const customer = await registerUser('empty');
    const { reviewId } = await createApprovedReview(customer);

    const res = await request(app)
      .put(`/api/v1/reviews/${reviewId}/reply`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: '' });

    // Matches this codebase's one, consistent ValidationError mapping
    // (AppError.js: `VALIDATION_FAILED` -> 422), not a generic 400 —
    // every other Zod-validated route in this suite is asserted the
    // same way.
    expect(res.status).toBe(422);
  });

  test('replying to a non-existent review returns 404', async () => {
    const res = await request(app)
      .put('/api/v1/reviews/999999999/reply')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ response: 'Nobody home.' });

    expect(res.status).toBe(404);
  });
});

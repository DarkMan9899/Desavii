/**
 * Step A2 — server-authoritative event hooks (favorite add/remove,
 * booking hold/create/confirm/reject/cancel) with collection FORCED ON.
 * Same dynamic-import-in-beforeAll technique as `analyticsIngestion
 * .test.js` — see that file's header comment for why.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

let app;
let up;
let seedAll;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

let pool;
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

async function createListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
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
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return { listingId, unitId: unitRes.body.data.id };
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

const GUEST_CONTACT = {
  fullName: 'Server Events Tester',
  email: 'server-events@example.com',
  phone: '+37400000001',
};

async function latestEventFor(listingId, eventName) {
  const [rows] = await pool.query(
    `SELECT * FROM analytics_events WHERE listing_id = ? AND event_name = ? ORDER BY id DESC LIMIT 1`,
    [listingId, eventName],
  );
  return rows[0] ?? null;
}

async function latestEventForBooking(bookingId, eventName) {
  const [rows] = await pool.query(
    `SELECT * FROM analytics_events WHERE booking_id = ? AND event_name = ? ORDER BY id DESC LIMIT 1`,
    [bookingId, eventName],
  );
  return rows[0] ?? null;
}

beforeAll(async () => {
  process.env.ANALYTICS_COLLECTION_ENABLED = 'true';

  ({ default: app } = await import('../../../src/app.js'));
  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ closeRedisConnection } =
    await import('../../../src/infrastructure/cache/redisClient.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

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
  delete process.env.ANALYTICS_COLLECTION_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Favorites -> favorite_added / favorite_removed', () => {
  test('adding a favorite writes favorite_added exactly once, re-adding writes nothing new', async () => {
    const { listingId } = await createListing(
      `Server Events Favorite ${Date.now()}`,
    );

    const first = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });
    expect(first.status).toBe(204);

    const row = await latestEventFor(listingId, 'favorite_added');
    expect(row).not.toBeNull();
    expect(row.partner_id).toBe(partnerId);

    const [[{ count: countAfterFirst }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM analytics_events WHERE listing_id = ? AND event_name = ?',
      [listingId, 'favorite_added'],
    );

    // Re-adding an already-favorited listing is a harmless API no-op —
    // must never inflate a second favorite_added row.
    const repeat = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });
    expect(repeat.status).toBe(204);

    const [[{ count: countAfterRepeat }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM analytics_events WHERE listing_id = ? AND event_name = ?',
      [listingId, 'favorite_added'],
    );
    expect(countAfterRepeat).toBe(countAfterFirst);
  });

  test('removing a favorite writes favorite_removed', async () => {
    const { listingId } = await createListing(
      `Server Events Unfavorite ${Date.now()}`,
    );
    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });

    const res = await request(app)
      .delete(`/api/v1/favorites/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(204);

    const row = await latestEventFor(listingId, 'favorite_removed');
    expect(row).not.toBeNull();
  });
});

describe('Booking-Holds -> booking_started', () => {
  test('creating a hold writes booking_started with server-resolved listing/partner context', async () => {
    const { listingId, unitId } = await createListing(
      `Server Events Hold ${Date.now()}`,
    );
    const dateFrom = '2027-03-01';
    const dateTo = '2027-03-02';
    await setPrice(unitId, dateFrom, dateTo, 10_000);

    const res = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(res.status).toBe(201);

    const row = await latestEventFor(listingId, 'booking_started');
    expect(row).not.toBeNull();
    expect(row.partner_id).toBe(partnerId);
  });
});

describe('Bookings -> booking_request_submitted / booking_confirmed / booking_rejected / booking_cancelled', () => {
  test('the full booking lifecycle writes one analytics row per genuine transition', async () => {
    const { unitId } = await createListing(
      `Server Events Booking Lifecycle ${Date.now()}`,
    );
    const dateFrom = '2027-03-10';
    const dateTo = '2027-03-11';
    await setPrice(unitId, dateFrom, dateTo, 10_000);

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
        items: [{ holdIds, guests: [{ fullName: 'Server Events Guest' }] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;

    const submittedRow = await latestEventForBooking(
      bookingId,
      'booking_request_submitted',
    );
    expect(submittedRow).not.toBeNull();
    expect(submittedRow.partner_id).toBe(partnerId);

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);
    expect(
      await latestEventForBooking(bookingId, 'booking_confirmed'),
    ).not.toBeNull();
  });

  test('rejecting a booking writes booking_rejected', async () => {
    const { unitId } = await createListing(
      `Server Events Booking Reject ${Date.now()}`,
    );
    const dateFrom = '2027-03-15';
    const dateTo = '2027-03-16';
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
        items: [
          { holdIds, guests: [{ fullName: 'Server Events Reject Guest' }] },
        ],
        guestContactSnapshot: GUEST_CONTACT,
      });
    const bookingId = bookingRes.body.data.id;

    const rejectRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'No availability after all.' });
    expect(rejectRes.status).toBe(200);
    expect(
      await latestEventForBooking(bookingId, 'booking_rejected'),
    ).not.toBeNull();
  });

  test('cancelling a confirmed booking writes booking_cancelled', async () => {
    const { unitId } = await createListing(
      `Server Events Booking Cancel ${Date.now()}`,
    );
    const dateFrom = '2027-03-20';
    const dateTo = '2027-03-21';
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
        items: [
          { holdIds, guests: [{ fullName: 'Server Events Cancel Guest' }] },
        ],
        guestContactSnapshot: GUEST_CONTACT,
      });
    const bookingId = bookingRes.body.data.id;

    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Change of plans.' });
    expect(cancelRes.status).toBe(200);
    expect(
      await latestEventForBooking(bookingId, 'booking_cancelled'),
    ).not.toBeNull();
  });
});

/**
 * Step L6.2H2B — a restaurant reservation never takes platform payment, and
 * that is enforced server-side, not just by hiding the "Pay Now" button.
 *
 * Explicitly opts into `PAYMENTS_ENABLED=true` (the same test-readiness
 * mechanism `paymentLifecycle.test.js` uses — set before the app/config is
 * imported), so the refusal below comes from the payment-requirement rule,
 * never from the "payments disabled" gate.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';

let up;
let seedAll;
let app;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let addIsoDays;
let businessNow;
let DEV_CREDENTIALS;

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let today;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

async function createRestaurantBooking() {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [
        { languageId, title: `L6.2H2B Payment Restaurant ${Date.now()}` },
      ],
    });
  const listingId = listingRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ listingId, bookableUnitType: 'RESTAURANT_TABLE', capacity: 5 });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });

  const date = addIsoDays(today, 10);
  const held = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        {
          bookableUnitId: unitRes.body.data.id,
          dateFrom: date,
          dateTo: date,
          startTime: '19:30',
        },
      ],
    });
  expect(held.status).toBe(201);
  const booked = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        quotedItem(rememberHoldQuotes(held).body.data.items[0].hold_ids, {
          guests: [],
          guestCount: 4,
        }),
      ],
      guestContactSnapshot: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
  expect(booked.status).toBe(201);
  return booked.body.data;
}

async function countFor(table, bookingId) {
  const [[{ total }]] = await pool.query(
    table === 'payments'
      ? 'SELECT COUNT(*) AS total FROM payments WHERE booking_id = ?'
      : `SELECT COUNT(*) AS total FROM payment_transactions pt
         JOIN payments p ON p.id = pt.payment_id WHERE p.booking_id = ?`,
    [bookingId],
  );
  return total;
}

beforeAll(async () => {
  process.env.PAYMENTS_ENABLED = 'true';

  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ default: app } = await import('../../../src/app.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ closeRedisConnection } =
    await import('../../../src/infrastructure/cache/redisClient.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));
  ({ addIsoDays, businessNow } = await import('../helpers/isoDates.js'));
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

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
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  delete process.env.PAYMENTS_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /payments — a restaurant reservation never takes payment', () => {
  test('payments are enabled for this suite (the refusal is not the disabled gate)', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
  });

  test('is refused with 409 PAYMENT_NOT_REQUIRED, writing nothing and leaving the booking untouched', async () => {
    const booking = await createRestaurantBooking();
    expect(booking.payment_required).toBe(false);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_NOT_REQUIRED');
    expect(await countFor('payments', booking.id)).toBe(0);
    expect(await countFor('payment_transactions', booking.id)).toBe(0);

    const after = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer}`);
    expect(after.body.data.payment_status).toBe('NOT_REQUIRED_ON_PLATFORM');
    expect(after.body.data.status).toBe('PENDING_VENDOR');
  });

  test('the Partner can still confirm it, with no payment involved', async () => {
    const booking = await createRestaurantBooking();

    const res = await request(app)
      .post(`/api/v1/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${vendor}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.payment_status).toBe('NOT_REQUIRED_ON_PLATFORM');
    expect(await countFor('payments', booking.id)).toBe(0);
  });
});

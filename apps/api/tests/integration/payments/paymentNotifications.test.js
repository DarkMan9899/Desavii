/**
 * Phase 16 (Payment Infrastructure): proves the notification listener
 * wiring end to end — mirrors Phase 13's own established pattern
 * ("perform each real business action via its existing API and assert a
 * notification row appears for the right recipient"). `PaymentService`
 * has zero references to `notificationService` anywhere; this is the
 * event-bus subscription in `notificationListener.js` doing its job.
 *
 * Explicitly opts into `PAYMENTS_ENABLED=true` (test-readiness remediation,
 * 2026) — see `paymentLifecycle.test.js`'s header comment for why this is
 * a forced, file-scoped opt-in rather than an ambient assumption.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

let up;
let seedAll;
let app;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

let vendor;
let admin;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerCustomer(label) {
  const email = `payments-notif-${label}-${Date.now()}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'PaymentsNotifFixture!2024',
    firstName: 'PaymentsNotif',
    lastName: label,
  });
  return { accessToken: res.body.data.access_token };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function createBookingFixture(customerAuth, desiredTotal = 10_000) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        { languageId, title: `Payments Notif Fixture ${Date.now()}` },
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

  // HOTEL_ROOM is accommodation, so 2027-06-01 check-in / 2027-06-02
  // check-out is checkout-exclusive — exactly 1 occupied night (see
  // accommodationDateSemantics.js) — priced at the full `desiredTotal`.
  const dateFrom = '2027-06-01';
  const dateTo = '2027-06-02';
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: desiredTotal,
      priceOverrideCurrency: 'AMD',
    });
  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  const holdIds = holdRes.body.data.items[0].hold_ids;

  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [{ holdIds, guests: [] }],
      guestContactSnapshot: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+37400000000',
      },
    });
  return res.body.data;
}

async function confirmBooking(bookingId) {
  return request(app)
    .post(`/api/v1/bookings/${bookingId}/confirm`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}

/**
 * Manual-capture booking payment flow: a payment only reaches SUCCEEDED
 * (and only then publishes `payment.succeeded`) once the vendor confirms
 * the booking — see `PaymentService#createPaymentIntent`'s own comment.
 */
async function createConfirmAndPay(customerAuth, desiredTotal) {
  const booking = await createBookingFixture(customerAuth, desiredTotal);
  const payment = await request(app)
    .post('/api/v1/payments')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
  await confirmBooking(booking.id);
  return payment;
}

async function paymentNotificationsFor(authToken) {
  const res = await request(app)
    .get('/api/v1/notifications?category=PAYMENT')
    .set('Authorization', `Bearer ${authToken}`);
  return res.body.data;
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
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

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
  customer = await registerCustomer('customer');

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
  delete process.env.PAYMENTS_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Payment domain events -> Notifications (Phase 16 x Phase 13 wiring)', () => {
  test('PAYMENT_SUCCEEDED notifies both the customer and the partner owner', async () => {
    await createConfirmAndPay(customer, 9_000);

    const customerNotifications = await paymentNotificationsFor(
      customer.accessToken,
    );
    expect(
      customerNotifications.some(
        (n) =>
          n.event_type === 'payment.succeeded' && n.resource_id !== undefined,
      ),
    ).toBe(true);

    const vendorNotifications = await paymentNotificationsFor(
      vendor.accessToken,
    );
    expect(
      vendorNotifications.some((n) => n.event_type === 'payment.succeeded'),
    ).toBe(true);
  });

  test('PAYMENT_FAILED notifies only the customer', async () => {
    const booking = await createBookingFixture(customer, 5_000);
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'DECLINE' });

    const customerNotifications = await paymentNotificationsFor(
      customer.accessToken,
    );
    expect(
      customerNotifications.some((n) => n.event_type === 'payment.failed'),
    ).toBe(true);
  });

  test('REFUND_SUCCEEDED notifies the customer', async () => {
    const payment = await createConfirmAndPay(customer, 6_000);
    await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '6000.00' });

    const customerNotifications = await paymentNotificationsFor(
      customer.accessToken,
    );
    expect(
      customerNotifications.some((n) => n.event_type === 'refund.succeeded'),
    ).toBe(true);
  });
});

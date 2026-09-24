/**
 * Phase 16 (Payment Infrastructure): exercises the full simulated payment
 * lifecycle end to end against `LocalPaymentProvider` — creation
 * (success/decline/processing-then-webhook-settlement), idempotency, the
 * one-active-payment-per-booking guard, visibility (customer/partner/
 * admin scoping), and refunds (full/partial/excess-rejection/permission).
 *
 * Uses one dedicated, throwaway customer account plus one "stranger"
 * identity, both registered ONCE in `beforeAll` (never the shared
 * `DEV_CREDENTIALS.customer`, which accumulates state from other
 * integration files in a full-suite run — the exact class of bug fixed
 * in `recommendations.test.js` earlier this phase) — registering more
 * than a couple of accounts here would trip auth's own legitimate
 * `sensitiveRateLimiter` (10/min on `register`/`login`). A fresh
 * *booking* is created per test case (via `createBookingFixture`), which
 * is what actually needs per-test isolation for this file's assertions.
 *
 * Explicitly opts into `PAYMENTS_ENABLED=true` (test-readiness remediation,
 * 2026) rather than assuming it — the marketplace's real launch default is
 * `PAYMENTS_ENABLED=false` (see docs/PAYMENTS_PAUSED.md), which a local
 * `.env` may now set explicitly and which overrides envalid's
 * `devDefault: true` for this env var. This file's whole subject is the
 * payment subsystem itself, so it forces the flag it needs rather than
 * requiring the ambient environment to happen to have it on — same
 * "force the env var this file's own module registry needs before any
 * static import evaluates config" pattern `paymentsDisabledGate.test.js`
 * already established (there, forcing it off; here, on), so every other
 * test file in the same `--runInBand` worker keeps seeing the real
 * launch default.
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
let partnerId;
let languageId;
// A single, reused dedicated customer fixture (plus one "stranger" identity
// for the authorization-negative cases) — see header comment. `login`/
// `register` both sit behind auth's own `sensitiveRateLimiter` (10/min),
// so this file deliberately registers as few distinct accounts as
// possible; every test still gets a fresh *booking*, which is what
// actually needs per-test isolation.
let customer;
let stranger;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerCustomer(label) {
  const email = `payments-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'PaymentsFixture!2024',
    firstName: 'Payments',
    lastName: label,
  });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
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
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return listingId;
}

async function registerUnit(listingId) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1 });
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

async function createHold(customerAuth, unitId, dateFrom, dateTo) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  return res.body.data.items[0].hold_ids;
}

const GUEST_CONTACT = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+37400000000',
};

/**
 * Creates one fresh, priced, holdable booking for the given customer and
 * returns its id — `totalAmount` ends up exactly equal to `desiredTotal`.
 * The unit is `HOTEL_ROOM` (accommodation), so 2027-05-01 check-in /
 * 2027-05-02 check-out is checkout-exclusive — exactly 1 occupied night
 * (see `accommodationDateSemantics.js`) — priced at `desiredTotal` for
 * that single night, not split across both calendar dates.
 */
async function createBookingFixture(customerAuth, desiredTotal = 10_000) {
  const listingId = await createListing(
    `Payments Fixture ${Date.now()}-${Math.random()}`,
  );
  const unitId = await registerUnit(listingId);
  const dateFrom = '2027-05-01';
  const dateTo = '2027-05-02';
  await setPrice(unitId, dateFrom, dateTo, desiredTotal);
  const holdIds = await createHold(customerAuth, unitId, dateFrom, dateTo);
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [{ holdIds, guests: [] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  expect(res.status).toBe(201);
  expect(res.body.data.total_amount).toBe(`${desiredTotal.toFixed(2)}`);
  return res.body.data;
}

async function confirmBooking(bookingId) {
  return request(app)
    .post(`/api/v1/bookings/${bookingId}/confirm`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}

/**
 * Manual-capture booking payment flow: `simulateScenario: 'SUCCESS'`
 * resolves to `AUTHORIZED`, not `SUCCEEDED` — money is only actually
 * captured once the vendor confirms the booking. Most of this file's
 * tests care about a genuinely captured/refundable payment, so this
 * helper drives both steps and returns the resulting payment.
 */
async function createAndCapturePayment(customerAuth, desiredTotal = 10_000) {
  const booking = await createBookingFixture(customerAuth, desiredTotal);
  const created = await request(app)
    .post('/api/v1/payments')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
  expect(created.status).toBe(201);
  expect(created.body.data.status).toBe('AUTHORIZED');

  const confirmed = await confirmBooking(booking.id);
  expect(confirmed.status).toBe(200);

  const paymentRes = await request(app)
    .get(`/api/v1/payments/${created.body.data.id}`)
    .set('Authorization', `Bearer ${customerAuth.accessToken}`);
  expect(paymentRes.body.data.status).toBe('SUCCEEDED');
  return { booking, payment: paymentRes.body.data };
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
  stranger = await registerCustomer('stranger');

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

describe('POST /payments — creates a Payment for a booking', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .send({ bookingId: 1 });
    expect(res.status).toBe(401);
  });

  test('SUCCESS scenario: resolves synchronously to AUTHORIZED (manual capture — funds are held, not yet charged), is clearly labeled simulated', async () => {
    const booking = await createBookingFixture(customer, 12_000);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('AUTHORIZED');
    expect(res.body.data.total_amount).toBe('12000.00');
    expect(res.body.data.captured_amount).toBe('0.00');
    expect(res.body.data.is_simulated).toBe(true);
    expect(res.body.data.provider).toBe('local');
    expect(res.body.data.payment_reference).toMatch(/^PAY-\d{8}-[A-Z2-9]{8}$/);
    expect(
      res.body.data.transactions.some((t) => t.type === 'PAYMENT_CREATED'),
    ).toBe(true);

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe(
      'AUTHORIZED_AWAITING_CAPTURE',
    );
  });

  test('manual capture: confirming the booking captures the AUTHORIZED payment to SUCCEEDED and updates the booking payment status', async () => {
    const { booking, payment } = await createAndCapturePayment(
      customer,
      12_000,
    );
    expect(payment.total_amount).toBe('12000.00');
    expect(payment.captured_amount).toBe('12000.00');
    expect(payment.refundable_amount).toBe('12000.00');
    expect(
      payment.transactions.some((t) => t.type === 'PAYMENT_CAPTURED'),
    ).toBe(true);

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe('PAID_ONLINE');
  });

  test('manual capture: rejecting the booking voids the AUTHORIZED payment to CANCELLED, never charging the customer', async () => {
    const booking = await createBookingFixture(customer, 9_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
    expect(created.body.data.status).toBe('AUTHORIZED');

    const rejected = await request(app)
      .post(`/api/v1/bookings/${booking.id}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Fully booked elsewhere' });
    expect(rejected.status).toBe(200);

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.status).toBe('CANCELLED');
    expect(paymentRes.body.data.captured_amount).toBe('0.00');

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe('PAYMENT_VOIDED');
  });

  test('DECLINE scenario: resolves to FAILED, booking payment status becomes PAYMENT_FAILED, booking status_id is untouched', async () => {
    const booking = await createBookingFixture(customer);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'DECLINE' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FAILED');
    expect(res.body.data.failure_code).toBe('card_declined');
    expect(res.body.data.captured_amount).toBe('0.00');

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe('PAYMENT_FAILED');
    // Online payment integration never touches the vendor-confirmation
    // workflow (Phase 16's deliberate, minimal integration boundary).
    expect(bookingRes.body.data.status).toBe('PENDING_VENDOR');
  });

  test('a repeated request with the same idempotencyKey returns the original payment, never a duplicate', async () => {
    const booking = await createBookingFixture(customer);
    const idempotencyKey = `idem-test-${Date.now()}`;

    const first = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        bookingId: booking.id,
        idempotencyKey,
        simulateScenario: 'SUCCESS',
      });
    const second = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        bookingId: booking.id,
        idempotencyKey,
        simulateScenario: 'SUCCESS',
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const listRes = await request(app)
      .get(`/api/v1/payments?bookingId=${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(listRes.body.data).toHaveLength(1);
  });

  test('a second payment cannot be created while one is still PROCESSING for the same booking (409 PAYMENT_ALREADY_ACTIVE)', async () => {
    const booking = await createBookingFixture(customer);

    const first = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'PROCESSING' });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('PROCESSING');

    const second = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PAYMENT_ALREADY_ACTIVE');
  });

  test("a customer cannot pay for someone else's booking — 404-masked, since bookingService.getBooking itself hides a booking the caller can't see", async () => {
    const booking = await createBookingFixture(customer);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
    expect(res.status).toBe(404);
  });
});

describe('Payment webhook settlement (PROCESSING -> SUCCEEDED)', () => {
  test('a synthetic local provider webhook resolves a PROCESSING payment to SUCCEEDED, and redelivery is a safe no-op', async () => {
    const booking = await createBookingFixture(customer, 8_000);

    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'PROCESSING' });
    expect(created.body.data.status).toBe('PROCESSING');
    const providerPaymentId = created.body.data.provider_payment_id;
    expect(providerPaymentId).toMatch(/^local_pi_/);

    const eventId = `evt_test_${Date.now()}`;
    const webhookPayload = {
      id: eventId,
      type: 'local.payment.succeeded',
      providerPaymentId,
      status: 'SUCCEEDED',
    };

    const firstDelivery = await request(app)
      .post('/api/v1/payments/webhooks/local')
      .send(webhookPayload);
    expect(firstDelivery.status).toBe(200);

    const afterFirst = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterFirst.body.data.status).toBe('SUCCEEDED');
    expect(afterFirst.body.data.captured_amount).toBe('8000.00');
    const capturedTransactionCount = afterFirst.body.data.transactions.filter(
      (t) => t.type === 'PAYMENT_CAPTURED',
    ).length;
    expect(capturedTransactionCount).toBe(1);

    // Redelivering the exact same provider event must never double-apply
    // the outcome (Phase 16 spec §13/§9).
    const secondDelivery = await request(app)
      .post('/api/v1/payments/webhooks/local')
      .send(webhookPayload);
    expect(secondDelivery.status).toBe(200);

    const afterSecond = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterSecond.body.data.status).toBe('SUCCEEDED');
    expect(afterSecond.body.data.captured_amount).toBe('8000.00');
    expect(
      afterSecond.body.data.transactions.filter(
        (t) => t.type === 'PAYMENT_CAPTURED',
      ).length,
    ).toBe(1);
  });

  test('Stripe go-live preflight: a webhook event with an unrecognized/missing status is acked (200) and leaves the payment untouched, instead of crashing', async () => {
    // Regression: an unmapped status previously reached
    // `isValidPaymentStatusTransition` with `toStatus === undefined`,
    // which throws a bare (uncaught) TypeError, surfacing as a 500 and
    // leaving the provider's event stuck retrying forever.
    const booking = await createBookingFixture(customer, 5_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'PROCESSING' });
    const providerPaymentId = created.body.data.provider_payment_id;

    const webhookPayload = {
      id: `evt_test_unmapped_${Date.now()}`,
      type: 'local.payment.unknown_status',
      providerPaymentId,
      // No `status` field — `LocalPaymentProvider#normalizeWebhookEvent`
      // resolves this to `null`, the exact unmapped case being guarded.
    };

    const delivery = await request(app)
      .post('/api/v1/payments/webhooks/local')
      .send(webhookPayload);
    expect(delivery.status).toBe(200);

    const afterDelivery = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterDelivery.body.data.status).toBe('PROCESSING');
  });
});

describe('Payment visibility scoping', () => {
  test("a payment is 404-masked to anyone other than its customer, the booking's partner, or payment.view", async () => {
    const booking = await createBookingFixture(customer);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    const strangerRes = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(strangerRes.status).toBe(404);

    const vendorRes = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(vendorRes.status).toBe(200);

    const adminRes = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminRes.status).toBe(200);
  });

  test('listPayments: customer sees only their own, partner sees only their own partnerId, admin viewAll sees everything', async () => {
    const booking = await createBookingFixture(customer);
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    const ownRes = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.data.length).toBeGreaterThan(0);

    const partnerRes = await request(app)
      .get(`/api/v1/payments?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(partnerRes.status).toBe(200);
    expect(partnerRes.body.data.some((p) => p.booking_id === booking.id)).toBe(
      true,
    );

    const forbiddenPartnerRes = await request(app)
      .get(`/api/v1/payments?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(forbiddenPartnerRes.status).toBe(403);

    const viewAllRes = await request(app)
      .get('/api/v1/payments?viewAll=true')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(viewAllRes.status).toBe(200);
    expect(viewAllRes.body.data.some((p) => p.booking_id === booking.id)).toBe(
      true,
    );

    const forbiddenViewAllRes = await request(app)
      .get('/api/v1/payments?viewAll=true')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(forbiddenViewAllRes.status).toBe(403);
  });
});

describe('Refunds', () => {
  test('a customer cannot create a refund (403) — Admin-only per Phase 16 spec §17', async () => {
    const booking = await createBookingFixture(customer);
    const payment = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    const res = await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/refunds`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ amount: '1000.00' });
    expect(res.status).toBe(403);
  });

  test('a full refund transitions the payment to REFUNDED and the booking to REFUNDED_ONLINE', async () => {
    const { booking, payment } = await createAndCapturePayment(
      customer,
      15_000,
    );

    const refundRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '15000.00', reason: 'customer requested cancellation' });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.data.status).toBe('SUCCEEDED');
    expect(refundRes.body.data.refund_reference).toMatch(
      /^RF-\d{8}-[A-Z2-9]{8}$/,
    );

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.status).toBe('REFUNDED');
    expect(paymentRes.body.data.refunded_amount).toBe('15000.00');
    expect(paymentRes.body.data.refundable_amount).toBe('0.00');

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe('REFUNDED_ONLINE');
  });

  test('a partial refund transitions the payment to PARTIALLY_REFUNDED and the booking to PARTIALLY_REFUNDED_ONLINE, and stacks to a full refund', async () => {
    const { booking, payment } = await createAndCapturePayment(
      customer,
      20_000,
    );

    const refundRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '5000.00' });
    expect(refundRes.status).toBe(201);

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.status).toBe('PARTIALLY_REFUNDED');
    expect(paymentRes.body.data.refunded_amount).toBe('5000.00');
    expect(paymentRes.body.data.refundable_amount).toBe('15000.00');

    const bookingRes = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingRes.body.data.payment_status).toBe(
      'PARTIALLY_REFUNDED_ONLINE',
    );

    // A second partial refund for exactly the remaining balance closes it
    // out to fully REFUNDED.
    const secondRefundRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '15000.00' });
    expect(secondRefundRes.status).toBe(201);

    const finalPaymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(finalPaymentRes.body.data.status).toBe('REFUNDED');
    expect(finalPaymentRes.body.data.refundable_amount).toBe('0.00');
  });

  test('a refund exceeding the refundable balance is rejected with 422 REFUND_EXCEEDS_REFUNDABLE, no partial state change', async () => {
    const { payment } = await createAndCapturePayment(customer, 10_000);

    const res = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '10000.01' });
    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some(
        (d) => d.issue === 'REFUND_EXCEEDS_REFUNDABLE',
      ),
    ).toBe(true);

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.status).toBe('SUCCEEDED');
    expect(paymentRes.body.data.refunded_amount).toBe('0.00');
  });

  test('cannot refund a payment that never succeeded (409 PAYMENT_NOT_REFUNDABLE)', async () => {
    const booking = await createBookingFixture(customer);
    const payment = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'DECLINE' });

    const res = await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '1.00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_NOT_REFUNDABLE');
  });

  test('an AUTHORIZED (not yet captured) payment cannot be refunded either (409 PAYMENT_NOT_REFUNDABLE)', async () => {
    // Manual-capture booking payment flow: refunding only ever makes sense
    // for money that was actually captured — an authorization is voided
    // via booking rejection/cancellation, never "refunded".
    const booking = await createBookingFixture(customer);
    const payment = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });
    expect(payment.body.data.status).toBe('AUTHORIZED');

    const res = await request(app)
      .post(`/api/v1/payments/${payment.body.data.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '1.00' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PAYMENT_NOT_REFUNDABLE');
  });

  test('Stripe go-live preflight: a repeated admin refund request with no idempotencyKey and the same amount/reason dedupes to the original refund, but a different amount creates a new one', async () => {
    const { payment } = await createAndCapturePayment(customer, 12_000);

    const first = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '3000.00', reason: 'duplicate click' });
    expect(first.status).toBe(201);

    // No idempotencyKey supplied either time — the server-synthesized key
    // (derived from amount+reason) must still dedupe an exact retry.
    const retry = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '3000.00', reason: 'duplicate click' });
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);

    const paymentAfterRetry = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentAfterRetry.body.data.refunded_amount).toBe('3000.00');

    // A genuinely different amount must NOT be swallowed by the same
    // dedupe path.
    const different = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '4000.00', reason: 'duplicate click' });
    expect(different.status).toBe(201);
    expect(different.body.data.id).not.toBe(first.body.data.id);

    const paymentAfterDifferent = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentAfterDifferent.body.data.refunded_amount).toBe('7000.00');
  });

  test('Stripe go-live preflight: two concurrent refund requests for more than the refundable balance combined — exactly one succeeds, the other is rejected, never both', async () => {
    // Exercises `reserveRefundAmount`'s atomic UPDATE as the concurrency
    // guard replacing "hold the row lock across the provider network
    // call" — the anti-pattern the transaction-boundary split removed.
    const { payment } = await createAndCapturePayment(customer, 10_000);

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/v1/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ amount: '7000.00', reason: 'race-a' }),
      request(app)
        .post(`/api/v1/payments/${payment.id}/refunds`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ amount: '7000.00', reason: 'race-b' }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 422]);

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.refunded_amount).toBe('7000.00');
    expect(paymentRes.body.data.refundable_amount).toBe('3000.00');
  });
});

describe('Ledger + partner balance', () => {
  test('a successful (captured) payment accrues a partner-payable ledger entry visible via the partner balance endpoint', async () => {
    // Manual-capture booking payment flow: the ledger only accrues once a
    // payment is actually SUCCEEDED (captured), never merely AUTHORIZED —
    // `#applyProviderResult`'s ledger writes are gated on `isSucceeded`.
    await createAndCapturePayment(customer, 7_500);

    const balanceRes = await request(app)
      .get(`/api/v1/payments/partners/${partnerId}/balance`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(balanceRes.status).toBe(200);
    const amdBalance = balanceRes.body.data.balances.find(
      (b) => b.currency === 'AMD',
    );
    expect(amdBalance).toBeDefined();
    expect(Number(amdBalance.balance)).toBeGreaterThanOrEqual(7_500);
  });

  test("a stranger cannot view another partner's balance without payment.view", async () => {
    const res = await request(app)
      .get(`/api/v1/payments/partners/${partnerId}/balance`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('admin (payment.view) can list ledger entries platform-wide', async () => {
    const res = await request(app)
      .get('/api/v1/payments/ledger')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

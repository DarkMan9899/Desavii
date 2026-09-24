/**
 * P0.2 (Master Roadmap) — booking <-> payment <-> refund lifecycle.
 *
 * Before this, `BookingService#cancelBooking` never touched the Payments
 * module at all: a CONFIRMED booking with a SUCCEEDED payment could be
 * cancelled and the payment simply stayed SUCCEEDED, with no automatic
 * refund and no visible signal that one might be owed. These tests
 * exercise the real HTTP surface end to end against `LocalPaymentProvider`
 * (never a mock) — booking creation, confirmation, payment, cancellation,
 * and (for the manual-review path) the pre-existing admin refund endpoint
 * resolving what the policy deliberately left for a human.
 *
 * Helper functions mirror `paymentLifecycle.test.js`'s own (this
 * codebase's established per-file-duplication convention for small
 * integration-test fixtures, not a shared import).
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
let partnerId;
let languageId;
let customer;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerCustomer(label) {
  const email = `cancel-refund-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'CancelRefundFixture!2024',
    firstName: 'CancelRefund',
    lastName: label,
  });
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

let fixtureDay = 1;
/** A fresh listing/unit/date per call so parallel-in-file bookings never collide. */
async function createConfirmedBooking(customerAuth, desiredTotal = 10_000) {
  const listingId = await createListing(
    `Cancel Refund Fixture ${Date.now()}-${Math.random()}`,
  );
  const unitId = await registerUnit(listingId);
  const day = fixtureDay;
  fixtureDay += 1;
  const dateFrom = `2027-06-${String(day).padStart(2, '0')}`;
  const dateTo = `2027-06-${String(day + 1).padStart(2, '0')}`;
  await setPrice(unitId, dateFrom, dateTo, desiredTotal);
  const holdIds = await createHold(customerAuth, unitId, dateFrom, dateTo);
  const createRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [{ holdIds, guests: [] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  expect(createRes.status).toBe(201);
  const bookingId = createRes.body.data.id;

  const confirmRes = await request(app)
    .post(`/api/v1/bookings/${bookingId}/confirm`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
  expect(confirmRes.status).toBe(200);
  expect(confirmRes.body.data.status).toBe('CONFIRMED');

  return createRes.body.data;
}

async function paySuccessfully(customerAuth, bookingId) {
  const res = await request(app)
    .post('/api/v1/payments')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({ bookingId, simulateScenario: 'SUCCESS' });
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('SUCCEEDED');
  return res.body.data;
}

async function getBooking(customerAuth, bookingId) {
  const res = await request(app)
    .get(`/api/v1/bookings/${bookingId}`)
    .set('Authorization', `Bearer ${customerAuth.accessToken}`);
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

describe('Booking cancellation <-> refund lifecycle (P0.2)', () => {
  test('a vendor cancelling a paid, CONFIRMED booking triggers an automatic full refund', async () => {
    const booking = await createConfirmedBooking(customer, 15_000);
    const payment = await paySuccessfully(customer, booking.id);

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Unit unavailable' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED_BY_VENDOR');
    expect(cancelRes.body.data.refund_status).toBe('AUTO_REFUNDED');

    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(paymentRes.body.data.status).toBe('REFUNDED');
    expect(paymentRes.body.data.refundable_amount).toBe('0.00');
    expect(paymentRes.body.data.refunds).toHaveLength(1);
    expect(paymentRes.body.data.refunds[0].status).toBe('SUCCEEDED');
    expect(paymentRes.body.data.refunds[0].amount).toBe('15000.00');

    // Re-cancelling (or any other run) must never double-refund: the
    // system-refund idempotency key is derived from the booking id.
    const bookingAfter = await getBooking(customer, booking.id);
    expect(bookingAfter.refund_status).toBe('AUTO_REFUNDED');
  });

  test('a customer cancelling their own paid, CONFIRMED booking does NOT auto-refund — it is flagged for manual review, admin/moderator are notified, and the existing admin refund flow now also resolves refund_status to MANUALLY_REFUNDED', async () => {
    const booking = await createConfirmedBooking(customer, 8_000);
    const payment = await paySuccessfully(customer, booking.id);

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Change of plans' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED_BY_CUSTOMER');
    expect(cancelRes.body.data.refund_status).toBe('REQUIRES_MANUAL_REVIEW');

    // The payment itself is untouched — no silent auto-refund happened.
    const paymentRes = await request(app)
      .get(`/api/v1/payments/${payment.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentRes.body.data.status).toBe('SUCCEEDED');
    expect(paymentRes.body.data.refunds).toHaveLength(0);

    // Launch-blocker remediation (P0-B/4C): REFUND_REVIEW_REQUIRED now has
    // a real subscriber — the admin dev account must have been notified.
    const adminNotifications = await request(app)
      .get('/api/v1/notifications?category=ADMIN&limit=100')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    const reviewNotification = adminNotifications.body.data.find(
      (n) =>
        n.event_type === 'refund.review_required' &&
        n.resource_type === 'booking' &&
        n.resource_id === booking.id,
    );
    expect(reviewNotification).toBeDefined();

    // The pre-existing admin refund endpoint fully resolves it — the
    // policy hands off to a human, it doesn't strand the money.
    const refundRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '8000.00', reason: 'Approved after review' });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.data.status).toBe('SUCCEEDED');

    // Launch-blocker remediation (P0-B/4A): before this fix, refund_status
    // stayed at REQUIRES_MANUAL_REVIEW forever even after a successful
    // admin refund. It must now resolve to MANUALLY_REFUNDED.
    const bookingAfterRefund = await getBooking(customer, booking.id);
    expect(bookingAfterRefund.refund_status).toBe('MANUALLY_REFUNDED');
  });

  test('cancelling a CONFIRMED booking with no successful payment leaves refund_status at NOT_APPLICABLE', async () => {
    const booking = await createConfirmedBooking(customer, 5_000);

    const cancelRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Never paid' });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.refund_status).toBe('NOT_APPLICABLE');
  });

  test('a refund against a booking that was never REQUIRES_MANUAL_REVIEW does not corrupt its refund_status (unrelated refund)', async () => {
    // Never cancelled — still CONFIRMED, refund_status defaults to
    // NOT_APPLICABLE. An admin can still refund a successfully-paid
    // booking directly (no cancellation prerequisite in this codebase),
    // and that must not fabricate a REQUIRES_MANUAL_REVIEW->MANUALLY_REFUNDED
    // transition it never actually went through.
    const booking = await createConfirmedBooking(customer, 6_000);
    const payment = await paySuccessfully(customer, booking.id);

    const beforeRefund = await getBooking(customer, booking.id);
    expect(beforeRefund.refund_status).toBe('NOT_APPLICABLE');

    const refundRes = await request(app)
      .post(`/api/v1/payments/${payment.id}/refunds`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ amount: '6000.00', reason: 'Customer-service goodwill refund' });
    expect(refundRes.status).toBe(201);
    expect(refundRes.body.data.status).toBe('SUCCEEDED');

    const afterRefund = await getBooking(customer, booking.id);
    expect(afterRefund.refund_status).toBe('NOT_APPLICABLE');
  });

  describe('resolve-refund-review (P0-B/4B: resolve without issuing a refund)', () => {
    test('an admin can resolve REQUIRES_MANUAL_REVIEW to RESOLVED_NO_REFUND with a reason, and it creates an audit record', async () => {
      const booking = await createConfirmedBooking(customer, 4_000);
      const payment = await paySuccessfully(customer, booking.id);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ reason: 'Change of plans' });

      const resolveRes = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Non-refundable per policy, confirmed with customer' });
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.data.refund_status).toBe('RESOLVED_NO_REFUND');

      const pool = getMysqlPool();
      const [auditRows] = await pool.query(
        `SELECT action, before_snapshot, after_snapshot FROM audit_logs
         WHERE target_type = 'booking' AND target_id = ? AND action = 'booking.refund_review_resolved'`,
        [booking.id],
      );
      expect(auditRows).toHaveLength(1);
      // mysql2 deserializes a JSON-typed column automatically — already
      // a plain object here, not a string to re-parse.
      const afterSnapshot = auditRows[0].after_snapshot;
      expect(afterSnapshot.outcome).toBe('RESOLVED_NO_REFUND');
      expect(afterSnapshot.reason).toBe(
        'Non-refundable per policy, confirmed with customer',
      );

      // Must not move money or create a refund record.
      const paymentRes = await request(app)
        .get(`/api/v1/payments/${payment.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`);
      expect(paymentRes.body.data.status).toBe('SUCCEEDED');
      expect(paymentRes.body.data.refunds).toHaveLength(0);
    });

    test('duplicate resolution is a safe no-op, not an error', async () => {
      const booking = await createConfirmedBooking(customer, 3_000);
      await paySuccessfully(customer, booking.id);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ reason: 'Change of plans' });

      const first = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Non-refundable per policy' });
      expect(first.status).toBe(200);

      const second = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Retried request' });
      expect(second.status).toBe(200);
      expect(second.body.data.refund_status).toBe('RESOLVED_NO_REFUND');

      const pool = getMysqlPool();
      const [auditRows] = await pool.query(
        `SELECT id FROM audit_logs
         WHERE target_type = 'booking' AND target_id = ? AND action = 'booking.refund_review_resolved'`,
        [booking.id],
      );
      // Exactly one audit entry — the duplicate call never re-wrote it.
      expect(auditRows).toHaveLength(1);
    });

    test('requires a non-empty reason', async () => {
      const booking = await createConfirmedBooking(customer, 3_000);
      await paySuccessfully(customer, booking.id);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ reason: 'Change of plans' });

      const missingReason = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({});
      expect(missingReason.status).toBe(422);

      const blankReason = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: '   ' });
      expect(blankReason.status).toBe(422);
    });

    test('is admin-only — a non-admin caller is rejected, and the booking is untouched', async () => {
      const booking = await createConfirmedBooking(customer, 3_000);
      await paySuccessfully(customer, booking.id);
      await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ reason: 'Change of plans' });

      const asVendor = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ reason: 'Trying to self-resolve' });
      expect(asVendor.status).toBe(403);

      const asCustomer = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({ reason: 'Trying to self-resolve' });
      expect(asCustomer.status).toBe(403);

      const bookingAfter = await getBooking(customer, booking.id);
      expect(bookingAfter.refund_status).toBe('REQUIRES_MANUAL_REVIEW');
    });

    test('is only valid from REQUIRES_MANUAL_REVIEW — rejects a booking that was never flagged for review', async () => {
      const booking = await createConfirmedBooking(customer, 3_000);
      // Never paid/cancelled — refund_status is NOT_APPLICABLE.
      const resolveRes = await request(app)
        .post(`/api/v1/bookings/${booking.id}/resolve-refund-review`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ reason: 'Should not be valid here' });
      expect(resolveRes.status).toBe(409);
    });
  });
});

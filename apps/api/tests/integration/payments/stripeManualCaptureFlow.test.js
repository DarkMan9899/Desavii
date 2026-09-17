/**
 * Stripe go-live preflight — frontend integration: exercises the COMPLETE
 * manual-capture Stripe flow end to end against the real HTTP surface
 * (`PaymentService`, `StripePaymentProvider`, `BookingService`), with only
 * the network boundary to Stripe's own API replaced by a mock — no live
 * or real test-mode Stripe credentials are used anywhere, per the go-live
 * preflight's explicit "mocks/test-mode-compatible configuration only"
 * instruction.
 *
 * `PAYMENT_DEFAULT_PROVIDER=stripe` (plus dummy Stripe config) must be set
 * BEFORE `config/index.js`/`app.js` are ever evaluated (`cleanEnv` reads
 * `process.env` once, at import time) — exactly the same constraint
 * `paymentsDisabledGate.test.js` documents, and the same fix: every
 * static top-level import that would transitively pull in `config` is
 * avoided in favor of a dynamic `import()` inside `beforeAll`. Jest gives
 * each test file its own module registry, so this doesn't leak into
 * `paymentLifecycle.test.js` (which relies on the default `local`
 * provider).
 *
 * The webhook signatures below are genuinely computed with the SAME
 * `STRIPE_WEBHOOK_SECRET` this process is configured with
 * (`StripePaymentProvider#verifyWebhook`'s real HMAC-SHA256 verification
 * runs unmodified) — this is not a bypassed/stubbed check, it's a
 * self-signed fixture exercising the real signature-verification code
 * path, mirroring `stripePaymentProvider.test.js`'s own unit-level
 * precedent for the exact same technique.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createHmac } from 'node:crypto';
import request from 'supertest';

let app;
let up;
let seedAll;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

const STRIPE_WEBHOOK_SECRET = 'whsec_test_dummy_never_a_real_secret';
const STRIPE_SECRET_KEY = 'sk_test_dummy_never_a_real_key';
const STRIPE_PUBLISHABLE_KEY = 'pk_test_dummy_never_a_real_key';

let vendor;
let customer;
let partnerId;
let languageId;
let realFetch;
let stripeIntents;

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

async function registerCustomer(label) {
  const email = `stripe-flow-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StripeFlowFixture!2024',
    firstName: 'StripeFlow',
    lastName: label,
  });
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
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
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
  fullName: 'Elena Simonyan',
  email: 'elena@example.com',
  phone: '+37400000001',
};

let fixtureDay = 1;
/** A fresh listing/unit/date per call so this file's own bookings never collide with each other. */
async function createBookingFixture(customerAuth, desiredTotal = 10_000) {
  const listingId = await createListing(
    `Stripe Flow Fixture ${Date.now()}-${Math.random()}`,
  );
  const unitId = await registerUnit(listingId);
  const day = fixtureDay;
  fixtureDay += 1;
  const dateFrom = `2027-07-${String(day).padStart(2, '0')}`;
  const dateTo = `2027-07-${String(day + 1).padStart(2, '0')}`;
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

/**
 * A minimal fake of Stripe's own REST API — just enough of `payment_intents`
 * for this flow. Keyed by the fake PaymentIntent id it hands out, so
 * capture/cancel/retrieve calls made later in the same test see a
 * consistent, evolving object, exactly like the real API would.
 *
 * `RUN_ID` (a per-process salt, mirroring `payments.spec.js`'s identical
 * `RUN_SALT_DAYS` fix for the exact same class of problem) makes every id
 * this store hands out globally unique across repeated runs against the
 * SAME persistent `travelhub_test` database — `up()`/`seedAll()` only
 * re-apply lookup/seed data, they never truncate `payments`, so a bare
 * `pi_test_1`, `pi_test_2`, ... counter would collide with a row an
 * EARLIER run already left behind, and a webhook could silently apply
 * itself to that stale row instead of this run's own payment.
 */
const RUN_ID = Date.now();
function createStripeIntentStore() {
  let counter = 0;
  const intents = new Map();
  return {
    intents,
    // The raw form params of the most recent `create` call — lets tests
    // assert on exactly what was (or, more importantly, was NOT) sent to
    // Stripe's real request contract, e.g. that `metadata[simulateScenario]`
    // never appears there (release-architecture requirement).
    lastCreateParams: null,
    create(params) {
      counter += 1;
      this.lastCreateParams = params;
      const id = `pi_test_${RUN_ID}_${counter}`;
      const intent = {
        id,
        status: 'requires_payment_method',
        client_secret: `${id}_secret_${Math.random().toString(36).slice(2)}`,
        amount: Number(params.get('amount')),
        currency: params.get('currency'),
        capture_method: params.get('capture_method'),
      };
      intents.set(id, intent);
      return intent;
    },
    retrieve(id) {
      return intents.get(id);
    },
    capture(id) {
      const intent = intents.get(id);
      intent.status = 'succeeded';
      return intent;
    },
    cancel(id) {
      const intent = intents.get(id);
      intent.status = 'canceled';
      return intent;
    },
  };
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

function mockStripeFetch(url, options) {
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== 'api.stripe.com') {
    return realFetch(url, options);
  }
  const path = parsedUrl.pathname.replace('/v1', '');
  const method = options?.method ?? 'GET';
  const params =
    typeof options?.body === 'string'
      ? new URLSearchParams(options.body)
      : new URLSearchParams();

  if (path === '/payment_intents' && method === 'POST') {
    return jsonResponse(stripeIntents.create(params));
  }
  const captureMatch = path.match(/^\/payment_intents\/([^/]+)\/capture$/);
  if (captureMatch && method === 'POST') {
    return jsonResponse(stripeIntents.capture(captureMatch[1]));
  }
  const cancelMatch = path.match(/^\/payment_intents\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    return jsonResponse(stripeIntents.cancel(cancelMatch[1]));
  }
  const retrieveMatch = path.match(/^\/payment_intents\/([^/]+)$/);
  if (retrieveMatch && method === 'GET') {
    return jsonResponse(stripeIntents.retrieve(retrieveMatch[1]));
  }
  throw new Error(`mockStripeFetch: unhandled request ${method} ${path}`);
}

function signWebhookPayload(rawBody) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

/** Delivers a real, validly-signed `payment_intent.*` webhook event — the same shape/signature scheme Stripe itself sends. */
async function deliverPaymentIntentWebhook(
  eventType,
  providerPaymentId,
  extra = {},
) {
  const intent = stripeIntents.intents.get(providerPaymentId);
  const payload = {
    id: `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: eventType,
    data: { object: { ...intent, ...extra } },
  };
  const rawBody = JSON.stringify(payload);
  const res = await request(app)
    .post('/api/v1/payments/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signWebhookPayload(rawBody))
    .send(rawBody);
  expect(res.status).toBe(200);
  return res;
}

beforeAll(async () => {
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.PAYMENT_DEFAULT_PROVIDER = 'stripe';
  process.env.STRIPE_SECRET_KEY = STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_PUBLISHABLE_KEY = STRIPE_PUBLISHABLE_KEY;

  realFetch = globalThis.fetch;
  stripeIntents = createStripeIntentStore();
  globalThis.fetch = (url, options) => mockStripeFetch(url, options);

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

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
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
  globalThis.fetch = realFetch;
  delete process.env.PAYMENTS_ENABLED;
  delete process.env.PAYMENT_DEFAULT_PROVIDER;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Stripe frontend integration: GET /payments/config', () => {
  test('exposes provider=stripe and the publishable key (never the secret key/webhook secret)', async () => {
    const res = await request(app).get('/api/v1/payments/config');
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.provider).toBe('stripe');
    expect(res.body.data.stripe_publishable_key).toBe(STRIPE_PUBLISHABLE_KEY);
    const rawBody = JSON.stringify(res.body);
    expect(rawBody).not.toContain(STRIPE_SECRET_KEY);
    expect(rawBody).not.toContain(STRIPE_WEBHOOK_SECRET);
  });
});

describe('Stripe frontend integration: manual-capture checkout flow', () => {
  test('POST /payments creates a Stripe PaymentIntent (manual capture, automatic payment methods) and returns a client_secret; the secret key never appears in the response', async () => {
    const booking = await createBookingFixture(customer, 11_000);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });

    expect(res.status).toBe(201);
    expect(res.body.data.provider).toBe('stripe');
    expect(res.body.data.is_simulated).toBe(false);
    expect(res.body.data.status).toBe('CREATED');
    expect(res.body.data.client_secret).toMatch(/^pi_test_\d+_\d+_secret_/);
    expect(JSON.stringify(res.body)).not.toContain(STRIPE_SECRET_KEY);

    const providerPaymentId = res.body.data.provider_payment_id;
    expect(providerPaymentId).toMatch(/^pi_test_\d+_\d+$/);
    const intent = stripeIntents.intents.get(providerPaymentId);
    expect(intent.capture_method).toBe('manual');
  });

  test('release-architecture requirement: simulateScenario never reaches the real Stripe request, even as an inert metadata tag, when the caller omits it', async () => {
    const booking = await createBookingFixture(customer, 6_500);

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });

    expect(res.status).toBe(201);
    expect(
      stripeIntents.lastCreateParams.has('metadata[simulateScenario]'),
    ).toBe(false);
  });

  test('release-architecture requirement: a request that explicitly sends simulateScenario against the active Stripe provider is refused outright (422), never silently accepted or forwarded', async () => {
    const booking = await createBookingFixture(customer, 6_500);
    const intentCountBefore = stripeIntents.intents.size;

    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id, simulateScenario: 'SUCCESS' });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some(
        (d) => d.issue === 'NOT_SUPPORTED_BY_PROVIDER',
      ),
    ).toBe(true);
    // No PaymentIntent was ever created with Stripe for this rejected
    // request — the rejection happens before the provider is ever called.
    expect(stripeIntents.intents.size).toBe(intentCountBefore);
  });

  test('a page reload while still CREATED re-fetches a fresh client_secret from Stripe instead of dead-ending', async () => {
    const booking = await createBookingFixture(customer, 9_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });

    const reread = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(reread.status).toBe(200);
    expect(reread.body.data.client_secret).toMatch(/^pi_test_\d+_\d+_secret_/);
  });

  test('confirm-then-capture: a payment_intent.amount_capturable_updated webhook authorizes the payment, then confirming the booking captures it', async () => {
    const booking = await createBookingFixture(customer, 20_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;

    // The frontend's `stripe.confirmPayment` call happened; Stripe's own
    // webhook now tells us the card is authorized (`requires_capture`).
    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';
    await deliverPaymentIntentWebhook(
      'payment_intent.amount_capturable_updated',
      providerPaymentId,
    );

    const afterAuth = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterAuth.body.data.status).toBe('AUTHORIZED');
    // No longer confirmable — the resume-client-secret path only refreshes
    // while CREATED/REQUIRES_ACTION.
    expect(afterAuth.body.data.client_secret).toBeNull();

    const bookingAfterAuth = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingAfterAuth.body.data.payment_status).toBe(
      'AUTHORIZED_AWAITING_CAPTURE',
    );

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);

    const afterCapture = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterCapture.body.data.status).toBe('SUCCEEDED');
    expect(afterCapture.body.data.captured_amount).toBe('20000.00');
  });

  test('reject-then-void: after authorization, rejecting the booking cancels the PaymentIntent — the customer is never charged', async () => {
    const booking = await createBookingFixture(customer, 12_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;

    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';
    await deliverPaymentIntentWebhook(
      'payment_intent.amount_capturable_updated',
      providerPaymentId,
    );

    const rejectRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'No availability after all' });
    expect(rejectRes.status).toBe(200);

    const afterVoid = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterVoid.body.data.status).toBe('CANCELLED');
    expect(afterVoid.body.data.captured_amount).toBe('0.00');

    const bookingAfterVoid = await request(app)
      .get(`/api/v1/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingAfterVoid.body.data.payment_status).toBe('PAYMENT_VOIDED');
  });

  test('async-authorization race: if the vendor already CONFIRMED the booking before the SCA/3DS challenge finishes, the webhook itself captures the payment', async () => {
    const booking = await createBookingFixture(customer, 15_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;

    // The vendor confirms while the customer is still completing a 3DS
    // challenge client-side — the payment is still CREATED at this point.
    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);

    // The 3DS challenge now completes; Stripe's webhook is the FIRST time
    // this backend learns the card is authorized.
    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';
    await deliverPaymentIntentWebhook(
      'payment_intent.amount_capturable_updated',
      providerPaymentId,
    );

    const afterWebhook = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    // Captured immediately by the webhook handler itself — no separate
    // confirm call is possible since the booking is already CONFIRMED.
    expect(afterWebhook.body.data.status).toBe('SUCCEEDED');
    expect(afterWebhook.body.data.captured_amount).toBe('15000.00');
  });

  test('async-authorization race: if the booking was already REJECTED before authorization completes, the webhook voids the payment instead of leaving it stuck AUTHORIZED', async () => {
    const booking = await createBookingFixture(customer, 8_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;

    const rejectRes = await request(app)
      .post(`/api/v1/bookings/${booking.id}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Overbooked' });
    expect(rejectRes.status).toBe(200);

    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';
    await deliverPaymentIntentWebhook(
      'payment_intent.amount_capturable_updated',
      providerPaymentId,
    );

    const afterWebhook = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterWebhook.body.data.status).toBe('CANCELLED');
    expect(afterWebhook.body.data.captured_amount).toBe('0.00');
  });

  test('a redelivered/duplicate webhook event is a safe no-op', async () => {
    const booking = await createBookingFixture(customer, 5_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;
    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';

    const intent = stripeIntents.intents.get(providerPaymentId);
    const payload = {
      id: `evt_test_duplicate_delivery_${RUN_ID}`,
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { ...intent } },
    };
    const rawBody = JSON.stringify(payload);
    const deliverOnce = () =>
      request(app)
        .post('/api/v1/payments/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('Stripe-Signature', signWebhookPayload(rawBody))
        .send(rawBody);

    const first = await deliverOnce();
    expect(first.status).toBe(200);
    const second = await deliverOnce();
    expect(second.status).toBe(200);

    const afterBoth = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterBoth.body.data.status).toBe('AUTHORIZED');
  });

  test('a tampered webhook signature is rejected, and never applied', async () => {
    const booking = await createBookingFixture(customer, 5_000);
    const created = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId: booking.id });
    const providerPaymentId = created.body.data.provider_payment_id;
    stripeIntents.intents.get(providerPaymentId).status = 'requires_capture';

    const intent = stripeIntents.intents.get(providerPaymentId);
    const payload = {
      id: 'evt_test_tampered',
      type: 'payment_intent.amount_capturable_updated',
      data: { object: { ...intent } },
    };
    const rawBody = JSON.stringify(payload);
    const res = await request(app)
      .post('/api/v1/payments/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set(
        'Stripe-Signature',
        't=1,v1=0000000000000000000000000000000000000000000000000000000000000000',
      )
      .send(rawBody);
    expect(res.status).toBe(422);

    const afterTampered = await request(app)
      .get(`/api/v1/payments/${created.body.data.id}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterTampered.body.data.status).toBe('CREATED');
  });
});

/**
 * Pass 8 (Multi-Currency / CBA FX Pricing) — the booking-time FX display
 * snapshot (brief §23/§24/§26/§30, migration 0047). Mirrors
 * `bookingCreation.test.js`'s own fixture helpers (listing/unit/price/
 * hold creation) rather than importing them — that file keeps its own
 * helpers module-private.
 *
 * `NODE_ENV=test` always resolves the FX provider to
 * `FixtureExchangeRateProvider` (`config/index.js`) — USD Amount=1/
 * Rate=400.00, RUB Amount=1/Rate=4.50 (see `fxRates.test.js`, which
 * proves the live shape those normalize to). Every expected converted
 * amount below is hand-computed against those exact fixture rates.
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
let customer;
let partnerId;
let languageId;
let pool;

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
    .set('Authorization', `Bearer ${vendor.accessToken}`);

  return listingId;
}

async function registerUnit(listingId) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
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

async function createHold(dateFrom, dateTo, unitId) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
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

  pool = getMysqlPool();
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

describe('POST /bookings — FX display snapshot (Pass 8)', () => {
  test('omitting displayCurrencyCode leaves every display_* field null — unchanged pre-Pass-8 behavior', async () => {
    const listingId = await createListing(`FX Omitted ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-09-05', '2027-09-06', 10_000);
    const holdIds = await createHold('2027-09-05', '2027-09-06', unitId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.display_currency).toBeNull();
    expect(res.body.data.fx_amd_per_unit).toBeNull();
    expect(res.body.data.fx_effective_at).toBeNull();
    expect(res.body.data.display_subtotal_amount).toBeNull();
    expect(res.body.data.display_total_amount).toBeNull();
  });

  test('displayCurrencyCode: AMD is the identity conversion — fx_amd_per_unit is 1.00000000 and display_total_amount equals total_amount', async () => {
    const listingId = await createListing(`FX Identity AMD ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-09-10', '2027-09-11', 10_000);
    const holdIds = await createHold('2027-09-10', '2027-09-11', unitId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'AMD',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('10000.00');
    expect(res.body.data.display_currency).toBe('AMD');
    expect(res.body.data.fx_amd_per_unit).toBe('1.00000000');
    expect(res.body.data.display_total_amount).toBe('10000.00');
    expect(res.body.data.display_subtotal_amount).toBe('10000.00');
    expect(res.body.data.fx_effective_at).toBeTruthy();
  });

  test('displayCurrencyCode: USD converts the AMD total using the server-resolved CBA rate, never a client-supplied one', async () => {
    const listingId = await createListing(`FX Convert USD ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-09-15', '2027-09-16', 40_000);
    const holdIds = await createHold('2027-09-15', '2027-09-16', unitId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'USD',
        // Brief §30 — a tampering attempt: this field does not exist in
        // the validator schema, so it is stripped before the service ever
        // sees the body. Proven below by the assertion that the real
        // fixture rate (400.00) was used, not this value.
        fxRate: 999999,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('40000.00');
    expect(res.body.data.display_currency).toBe('USD');
    expect(res.body.data.fx_amd_per_unit).toBe('400.00000000');
    // 40000 AMD / 400.00 = 100.00 USD exactly.
    expect(res.body.data.display_total_amount).toBe('100.00');
    expect(res.body.data.display_subtotal_amount).toBe('100.00');
  });

  test('displayCurrencyCode: RUB converts using the RUB fixture rate', async () => {
    const listingId = await createListing(`FX Convert RUB ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-09-20', '2027-09-21', 9_000);
    const holdIds = await createHold('2027-09-20', '2027-09-21', unitId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'RUB',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.display_currency).toBe('RUB');
    expect(res.body.data.fx_amd_per_unit).toBe('4.50000000');
    // 9000 / 4.50 = 2000.00 RUB exactly.
    expect(res.body.data.display_total_amount).toBe('2000.00');
  });

  test('an unsupported currency code is rejected at the schema layer (422), never reaching the service', async () => {
    const listingId = await createListing(`FX Unsupported ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-09-25', '2027-09-26', 5_000);
    const holdIds = await createHold('2027-09-25', '2027-09-26', unitId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'EUR',
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('immutability: a booking already created with a USD snapshot never changes even after a newer FX rate is recorded', async () => {
    const listingId = await createListing(`FX Immutable ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-10-01', '2027-10-02', 40_000);
    const holdIds = await createHold('2027-10-01', '2027-10-02', unitId);

    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
        displayCurrencyCode: 'USD',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.fx_amd_per_unit).toBe('400.00000000');
    expect(createRes.body.data.display_total_amount).toBe('100.00');
    const bookingId = createRes.body.data.id;

    // Simulate CBA publishing a materially different next-day rate —
    // directly against the persistent last-known-good store this
    // booking's own snapshot was already copied out of at creation time.
    const [[usdCurrency]] = await pool.query(
      "SELECT id FROM currencies WHERE code = 'USD'",
    );
    await pool.query(
      `INSERT INTO exchange_rates (currency_id, rate_to_base, rate_date)
       VALUES (?, ?, CURDATE())
       ON DUPLICATE KEY UPDATE rate_to_base = VALUES(rate_to_base)`,
      [usdCurrency.id, '999.00000000'],
    );

    const detailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(detailRes.status).toBe(200);
    // Unchanged — the booking's own snapshot, not a live recomputation.
    expect(detailRes.body.data.fx_amd_per_unit).toBe('400.00000000');
    expect(detailRes.body.data.display_total_amount).toBe('100.00');
    expect(detailRes.body.data.total_amount).toBe('40000.00');
  });
});

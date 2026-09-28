/**
 * Phase 17 core Inventory Engine — manual blocks, external reservations,
 * the audit ledger, and (critically) concurrency safety ACROSS every
 * consumption source sharing one unit's capacity, not just within one
 * source. Mirrors `booking-holds/holdCreation.test.js`'s exact
 * "real listing + unit via the real API, concurrent `Promise.all`
 * requests" pattern.
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
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let vendor;
let customer;
let partnerId;
let languageId;
// Step L6.2E: customer-hold dates are offsets from TODAY's Asia/Yerevan
// date on the DB clock, never calendar literals that age into the past.
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
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
  return res.body.data.id;
}

async function registerUnit(listingId, capacity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity });
  return res.body.data.id;
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

  const pool = getMysqlPool();
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
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /availability/blocks — manual blocks are quantity-aware and NOT bookings', () => {
  test("a partner can block part of a unit's capacity for a maintenance reason", async () => {
    const listingId = await createListing(`Block Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 5);

    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-01',
        dateTo: '2026-09-02',
        quantity: 3,
        reasonCode: 'MAINTENANCE',
        notes: 'Plumbing repair',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(3);
    expect(res.body.data.reason_code).toBe('MAINTENANCE');

    const breakdown = await request(app)
      .get(`/api/v1/availability/units/${unitId}/breakdown`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(breakdown.status).toBe(200);
    expect(breakdown.body.data[0]).toMatchObject({
      total: 5,
      available: 2,
      manual: 3,
      confirmed: 0,
      held: 0,
      external: 0,
    });
  });

  test('an unknown reason code is rejected by structural validation', async () => {
    const listingId = await createListing(`Block Reason Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);

    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-05',
        dateTo: '2026-09-06',
        quantity: 1,
        reasonCode: 'NOT_A_REAL_REASON',
      });

    expect(res.status).toBe(422);
  });

  test('a customer (non-partner-employee) cannot create a manual block', async () => {
    // The listing is a freshly-created DRAFT, never published — `getListing`'s
    // existing 404-masking for non-owners (the same precedent every other
    // management method in this file already relies on) means a stranger
    // gets a plain 404, not a 403 that would confirm the listing exists.
    const listingId = await createListing(`Block RBAC Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);

    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-10',
        dateTo: '2026-09-11',
        quantity: 1,
        reasonCode: 'OTHER',
      });

    expect(res.status).toBe(404);
  });

  test('releasing a block restores exactly the capacity it consumed', async () => {
    const listingId = await createListing(`Block Release Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);

    const created = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
        quantity: 2,
        reasonCode: 'OWNER_USE',
      });
    expect(created.status).toBe(201);

    const releaseRes = await request(app)
      .delete(`/api/v1/availability/blocks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(releaseRes.status).toBe(200);

    const breakdown = await request(app)
      .get(`/api/v1/availability/units/${unitId}/breakdown`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: '2026-09-15', to: '2026-09-15' });
    expect(breakdown.body.data[0].available).toBe(2);
    expect(breakdown.body.data[0].manual).toBe(0);
  });
});

describe('POST /availability/external-reservations — phone/walk-in bookings recorded with minimal fields', () => {
  test('a partner can record a phone reservation with only unit/dates/quantity', async () => {
    const listingId = await createListing(`External Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);

    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-20',
        dateTo: '2026-09-21',
        quantity: 1,
        sourceCode: 'PHONE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.source_code).toBe('PHONE');
    expect(res.body.data.guest_name).toBeNull();
  });

  test('cancelling an external reservation restores capacity', async () => {
    const listingId = await createListing(`External Cancel Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 1);

    const created = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-25',
        dateTo: '2026-09-26',
        quantity: 1,
        sourceCode: 'BOOKING_COM',
        guestName: 'Jane Doe',
      });
    expect(created.status).toBe(201);

    const conflictAttempt = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-25',
        dateTo: '2026-09-26',
        quantity: 1,
        sourceCode: 'PHONE',
      });
    expect(conflictAttempt.status).toBe(409);

    const cancelRes = await request(app)
      .delete(
        `/api/v1/availability/external-reservations/${created.body.data.id}`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(cancelRes.status).toBe(200);

    const retryAttempt = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-25',
        dateTo: '2026-09-26',
        quantity: 1,
        sourceCode: 'PHONE',
      });
    expect(retryAttempt.status).toBe(201);
  });
});

describe('Inventory audit ledger explains every capacity change', () => {
  test('a hold, a manual block, and an external reservation each leave one ledger row per date', async () => {
    const listingId = await createListing(`Ledger Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 10);
    // Step L6.2E: a future date read from the DB clock; the customer hold is
    // a one-night stay occupying exactly this date.
    const ledgerDate = day(30);

    await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: ledgerDate,
            dateTo: addIsoDays(ledgerDate, 1),
            quantity: 1,
          },
        ],
      });
    await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: ledgerDate,
        dateTo: ledgerDate,
        quantity: 2,
        reasonCode: 'WEATHER',
      });
    await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: ledgerDate,
        dateTo: ledgerDate,
        quantity: 1,
        sourceCode: 'WALK_IN',
      });

    const ledgerRes = await request(app)
      .get(`/api/v1/availability/units/${unitId}/ledger`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: ledgerDate, to: ledgerDate });

    expect(ledgerRes.status).toBe(200);
    const sourceTypes = ledgerRes.body.data.map((entry) => entry.source_type);
    expect(sourceTypes).toEqual(
      expect.arrayContaining([
        'TRAVELHUB_HOLD',
        'MANUAL_BLOCK',
        'EXTERNAL_RESERVATION',
      ]),
    );
    // 10 - 1 (hold) - 2 (block) - 1 (external) = 6 remaining.
    const breakdown = await request(app)
      .get(`/api/v1/availability/units/${unitId}/breakdown`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: ledgerDate, to: ledgerDate });
    expect(breakdown.body.data[0]).toMatchObject({
      total: 10,
      available: 6,
      held: 1,
      manual: 2,
      external: 1,
    });
  });
});

describe('Concurrency safety — NO double-booking across mixed sources', () => {
  test('exactly `capacity` concurrent manual-block requests succeed against a limited-capacity unit', async () => {
    const listingId = await createListing(
      `Block Concurrency Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId, 3);

    const attempts = Array.from({ length: 6 }, () =>
      request(app)
        .post('/api/v1/availability/blocks')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({
          unitId,
          dateFrom: '2026-11-10',
          dateTo: '2026-11-10',
          quantity: 1,
          reasonCode: 'OTHER',
        }),
    );
    const results = await Promise.all(attempts);
    const succeeded = results.filter((res) => res.status === 201);
    const conflicted = results.filter((res) => res.status === 409);

    expect(succeeded).toHaveLength(3);
    expect(conflicted).toHaveLength(3);
  });

  test('a TravelHub hold and a manual block racing for the LAST unit of capacity: exactly one wins', async () => {
    const listingId = await createListing(
      `Mixed Source Concurrency Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId, 1);
    // Step L6.2E: both sides take the same single night — the customer as
    // a one-night stay (lodging is never same-day), the Partner block as
    // that one date.
    const dateFrom = day(60);
    const dateTo = dateFrom;

    const [holdRes, blockRes] = await Promise.all([
      request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${customer.accessToken}`)
        .send({
          items: [
            {
              bookableUnitId: unitId,
              dateFrom,
              dateTo: addIsoDays(dateFrom, 1),
              quantity: 1,
            },
          ],
        }),
      request(app)
        .post('/api/v1/availability/blocks')
        .set('Authorization', `Bearer ${vendor.accessToken}`)
        .send({ unitId, dateFrom, dateTo, quantity: 1, reasonCode: 'OTHER' }),
    ]);

    const statuses = [holdRes.status, blockRes.status].sort();
    // Exactly one succeeded (201) and one was rejected (409) — never both
    // succeeding (that would be a double-booking), never both failing.
    expect(statuses).toEqual([201, 409]);

    const breakdown = await request(app)
      .get(`/api/v1/availability/units/${unitId}/breakdown`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: dateFrom, to: dateTo });
    expect(breakdown.body.data[0].available).toBe(0);
  });
});

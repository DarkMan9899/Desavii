/**
 * Sprint 10: the reservation-hold expiry sweep. Exercises
 * `sweepExpiredHolds` (the plain, directly-callable function) directly —
 * never the BullMQ scheduler itself, which only ever runs from
 * `server.js` — after manually fast-forwarding a hold's `expires_at` into
 * the past, matching the approved proposal's testing strategy (§18).
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app, { services } from '../../../src/app.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { sweepExpiredHolds } from '../../../src/modules/booking-holds/jobs/holdExpirySweep.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';
import { markListingBookable } from '../helpers/markListingBookable.js';

let pool;
let vendor;
let customer;
let partnerId;
let languageId;

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
  await markListingBookable(res.body.data.id);
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
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('sweepExpiredHolds', () => {
  test('an expired hold is released and its capacity restored', async () => {
    const listingId = await createListing(`Expiry Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 1);
    const dateFrom = '2027-01-10';
    const dateTo = '2027-01-11';

    const createRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(createRes.status).toBe(201);
    const [holdId] = createRes.body.data.items[0].hold_ids;

    // Capacity is fully consumed — a second hold must fail before expiry.
    const blockedRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(blockedRes.status).toBe(409);

    // Fast-forward this hold's expiry into the past.
    await pool.query(
      'UPDATE reservation_holds SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [holdId],
    );

    const releasedCount = await sweepExpiredHolds(services.availabilityService);
    expect(releasedCount).toBeGreaterThanOrEqual(1);

    const [[row]] = await pool.query(
      'SELECT id FROM reservation_holds WHERE id = ?',
      [holdId],
    );
    expect(row).toBeUndefined();

    // Capacity restored — a new hold for the same range now succeeds.
    const retryRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    expect(retryRes.status).toBe(201);
  });

  test('is a no-op when there are no expired holds', async () => {
    // Sweep once first to drain anything already expired from prior tests,
    // then assert a second immediate run finds nothing left to do.
    await sweepExpiredHolds(services.availabilityService);
    const releasedCount = await sweepExpiredHolds(services.availabilityService);
    expect(releasedCount).toBe(0);
  });
});

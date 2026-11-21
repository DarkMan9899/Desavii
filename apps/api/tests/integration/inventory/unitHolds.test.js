/**
 * Phase 17 §6 (Admin Inventory) — `GET /availability/units/:id/holds`,
 * the previously-missing raw active-hold list (the Admin Inventory
 * "Holds" tab and any future Partner Calendar drill-down both need this;
 * only the aggregate `held` count existed before, via `getAvailability
 * Breakdown`). Same owner-or-`inventory.view_all` gate as the sibling
 * `/ledger`/`/breakdown` reads, verified here directly rather than
 * assumed from code reading.
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
import { markListingBookable } from '../helpers/markListingBookable.js';

let pool;
let vendor;
let customer;
let admin;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function createListing(title, { bookable = true } = {}) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
    });
  if (bookable) await markListingBookable(res.body.data.id);
  return res.body.data.id;
}

async function registerUnit(listingId, capacity = 3) {
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
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
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

describe('GET /availability/units/:id/holds', () => {
  test('the owning partner sees the raw active hold created by a customer', async () => {
    const listingId = await createListing(`Holds List Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2027-03-01',
            dateTo: '2027-03-02',
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    const res = await request(app)
      .get(`/api/v1/availability/units/${unitId}/holds`)
      .query({ from: '2027-03-01', to: '2027-03-02' })
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      bookable_unit_id: unitId,
      date_from: '2027-03-01',
      date_to: '2027-03-02',
    });
    expect(res.body.data[0].expires_at).toBeTruthy();
  });

  test('an admin (inventory.view_all) can see holds on a listing they do not own', async () => {
    const listingId = await createListing(`Holds Admin Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 1);
    await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2027-03-05',
            dateTo: '2027-03-06',
            quantity: 1,
          },
        ],
      });

    const res = await request(app)
      .get(`/api/v1/availability/units/${unitId}/holds`)
      .query({ from: '2027-03-05', to: '2027-03-06' })
      .set('Authorization', `Bearer ${admin.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('a customer with no relationship to the (still-draft) listing is rejected — 404, never leaking existence', async () => {
    // Left a draft: a stranger must not learn it exists.
    const listingId = await createListing(`Holds RBAC Test ${Date.now()}`, {
      bookable: false,
    });
    const unitId = await registerUnit(listingId, 1);

    const res = await request(app)
      .get(`/api/v1/availability/units/${unitId}/holds`)
      .query({ from: '2027-03-10', to: '2027-03-11' })
      .set('Authorization', `Bearer ${customer.accessToken}`);

    expect(res.status).toBe(404);
  });

  test('an empty window returns an empty array, not an error', async () => {
    const listingId = await createListing(`Holds Empty Test ${Date.now()}`);
    const unitId = await registerUnit(listingId, 1);

    const res = await request(app)
      .get(`/api/v1/availability/units/${unitId}/holds`)
      .query({ from: '2027-03-15', to: '2027-03-16' })
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

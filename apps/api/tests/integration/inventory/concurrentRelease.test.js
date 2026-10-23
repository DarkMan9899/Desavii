/**
 * Calendar Excellence — removing the same manual block (or cancelling the
 * same external reservation) twice at the same moment must give its
 * capacity back exactly once. Two Partners, or one double-click, racing a
 * release used to both pass the "already released?" check (read outside the
 * transaction) and both restore capacity, leaving a date with more rooms
 * than the unit has — an oversell waiting to happen. Mirrors
 * `inventoryEngine.test.js`'s real-API `Promise.all` pattern.
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

const CAPACITY = 2;

let vendor;
let partnerId;
let languageId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

const asVendor = (req) =>
  req.set('Authorization', `Bearer ${vendor.accessToken}`);

async function createUnit(title) {
  const listing = await asVendor(request(app).post('/api/v1/listings')).send({
    partnerId,
    listingType: 'HOTEL',
    translations: [{ languageId, title: `${title} ${Date.now()}` }],
  });
  const unit = await asVendor(
    request(app).post('/api/v1/availability/units'),
  ).send({
    listingId: listing.body.data.id,
    bookableUnitType: 'HOTEL_ROOM',
    capacity: CAPACITY,
  });
  return unit.body.data.id;
}

async function availableOn(unitId, date) {
  const res = await asVendor(
    request(app).get(`/api/v1/availability/units/${unitId}/breakdown`),
  ).query({ from: date, to: date });
  return res.body.data[0].available;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
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

describe('a release racing itself gives capacity back exactly once', () => {
  test('two simultaneous removals of one manual block', async () => {
    const unitId = await createUnit('Concurrent block release');
    const block = await asVendor(
      request(app).post('/api/v1/availability/blocks'),
    ).send({
      unitId,
      dateFrom: day(10),
      dateTo: day(11),
      quantity: CAPACITY,
      reasonCode: 'OWNER_USE',
    });
    expect(block.status).toBe(201);
    expect(await availableOn(unitId, day(10))).toBe(0);

    const responses = await Promise.all(
      [1, 2].map(() =>
        asVendor(
          request(app).delete(
            `/api/v1/availability/blocks/${block.body.data.id}`,
          ),
        ),
      ),
    );

    // Never more rooms than the unit has: restored once, not twice.
    expect(await availableOn(unitId, day(10))).toBe(CAPACITY);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
  });

  test('two simultaneous cancellations of one external reservation', async () => {
    const unitId = await createUnit('Concurrent external cancel');
    const reservation = await asVendor(
      request(app).post('/api/v1/availability/external-reservations'),
    ).send({
      unitId,
      dateFrom: day(12),
      dateTo: day(13),
      quantity: CAPACITY,
      sourceCode: 'PHONE',
    });
    expect(reservation.status).toBe(201);
    expect(await availableOn(unitId, day(12))).toBe(0);

    const responses = await Promise.all(
      [1, 2].map(() =>
        asVendor(
          request(app).delete(
            `/api/v1/availability/external-reservations/${reservation.body.data.id}`,
          ),
        ),
      ),
    );

    // Never more rooms than the unit has: restored once, not twice.
    expect(await availableOn(unitId, day(12))).toBe(CAPACITY);
    expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
  });
});

/**
 * Calendar Excellence — the last inventory, asked for at the same moment.
 * Real concurrent requests (`Promise.all`) against one unit: whatever the
 * category's quantity model — a hotel's rooms, a tour departure's seats,
 * a restaurant's tables — exactly the capacity is held, every other request
 * gets a truthful 409, nothing is oversold and nothing surfaces as a 500.
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

const RESERVATION_TIME = '19:00';

let vendor;
let customer;
let partnerId;
let languageId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

async function createUnit(listingType, bookableUnitType, capacity) {
  const listing = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `Last ${listingType} race ${Date.now()}` },
      ],
    });
  const unit = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({ listingId: listing.body.data.id, bookableUnitType, capacity });
  expect(unit.status).toBe(201);
  return unit.body.data.id;
}

function hold(item) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items: [item] });
}

async function heldOn(unitId, date) {
  const res = await request(app)
    .get(`/api/v1/availability/units/${unitId}/breakdown`)
    .set('Authorization', `Bearer ${vendor}`)
    .query({ from: date, to: date });
  return res.body.data[0];
}

const statuses = (responses) => responses.map((res) => res.status).sort();

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

describe('the last inventory, requested simultaneously', () => {
  test('a hotel’s last room: exactly one of four simultaneous stays holds it', async () => {
    const unitId = await createUnit('HOTEL', 'HOTEL_ROOM', 1);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        hold({ bookableUnitId: unitId, dateFrom: day(7), dateTo: day(9) }),
      ),
    );

    expect(statuses(responses)).toEqual([201, 409, 409, 409]);
    const night = await heldOn(unitId, day(8));
    expect(night).toMatchObject({ available: 0, held: 1 });
  });

  test('a tour departure’s last seats: never more travellers than seats', async () => {
    const unitId = await createUnit('TOUR', 'TOUR_DEPARTURE', 3);
    // 2 + 2 + 2 travellers asking for 3 seats: only one party fits.
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        hold({
          bookableUnitId: unitId,
          dateFrom: day(12),
          dateTo: day(12),
          quantity: 2,
        }),
      ),
    );

    expect(statuses(responses)).toEqual([201, 409, 409]);
    const departure = await heldOn(unitId, day(12));
    expect(departure).toMatchObject({ available: 1, held: 2 });
  });

  test('a restaurant’s last tables: exactly the table count is reserved', async () => {
    const unitId = await createUnit('RESTAURANT', 'RESTAURANT_TABLE', 2);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        hold({
          bookableUnitId: unitId,
          dateFrom: day(15),
          dateTo: day(15),
          startTime: RESERVATION_TIME,
        }),
      ),
    );

    expect(statuses(responses)).toEqual([201, 201, 409, 409, 409]);
    const evening = await heldOn(unitId, day(15));
    expect(evening).toMatchObject({ available: 0, held: 2 });
  });
});

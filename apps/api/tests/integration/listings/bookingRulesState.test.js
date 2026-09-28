/**
 * Step L6.2E — booking-rule state integrity on `PATCH /listings/:id`:
 *
 * - omitted rule   -> stored value unchanged;
 * - explicit null  -> stored rule cleared (formerly impossible: the upsert
 *   used `COALESCE(VALUES(x), x)`);
 * - number         -> replaces the stored value;
 * - a blank string is never read as 0;
 * - `minimumStayNights <= maximumStayNights` holds on the EFFECTIVE values a
 *   partial update leaves stored, and a violation writes nothing.
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from '@jest/globals';
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

let pool;
let vendor;
let partnerId;
let languageId;
let listingId;

function patchRules(bookingRules) {
  return request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ bookingRules });
}

async function storedRules() {
  const [[row]] = await pool.query(
    `SELECT minimum_stay_nights AS minimumStayNights, maximum_stay_nights AS maximumStayNights,
            advance_booking_min_hours AS advanceBookingMinHours, advance_booking_max_days AS advanceBookingMaxDays
     FROM listing_booking_rules WHERE listing_id = ?`,
    [listingId],
  );
  return row;
}

const BASELINE = {
  minimumStayNights: 2,
  maximumStayNights: 10,
  advanceBookingMinHours: 24,
  advanceBookingMaxDays: 180,
};

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.vendor.email,
    password: DEV_CREDENTIALS.vendor.password,
  });
  vendor = loginRes.body.data.access_token;
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 60_000);

beforeEach(async () => {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title: `L6.2E rules ${Date.now()}` }],
    });
  listingId = res.body.data.id;
  const seeded = await patchRules(BASELINE);
  expect(seeded.status).toBe(200);
  expect(await storedRules()).toEqual(BASELINE);
});

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('min/max against the stored pair', () => {
  test('stored min 2 / max 10, PATCH max 1 -> 422 on maximumStayNights, nothing written', async () => {
    const res = await patchRules({
      maximumStayNights: 1,
      advanceBookingMinHours: 7,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      {
        field: 'bookingRules.maximumStayNights',
        issue: 'MIN_STAY_EXCEEDS_MAX',
      },
    ]);
    expect(await storedRules()).toEqual(BASELINE);
  });

  test('stored min 2 / max 10, PATCH min 11 -> 422 on minimumStayNights', async () => {
    const res = await patchRules({ minimumStayNights: 11 });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([
      {
        field: 'bookingRules.minimumStayNights',
        issue: 'MIN_STAY_EXCEEDS_MAX',
      },
    ]);
    expect(await storedRules()).toEqual(BASELINE);
  });

  test('a valid single-side update is accepted', async () => {
    const res = await patchRules({ maximumStayNights: 12 });
    expect(res.status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      maximumStayNights: 12,
    });
  });

  test('clearing max makes any min valid again', async () => {
    const res = await patchRules({
      maximumStayNights: null,
      minimumStayNights: 30,
    });
    expect(res.status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      minimumStayNights: 30,
      maximumStayNights: null,
    });
  });
});

describe('clear / omit semantics', () => {
  test('PATCH min null clears min; max remains', async () => {
    expect((await patchRules({ minimumStayNights: null })).status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      minimumStayNights: null,
    });
  });

  test('PATCH max null clears max; min remains', async () => {
    expect((await patchRules({ maximumStayNights: null })).status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      maximumStayNights: null,
    });
  });

  test('PATCH both null clears both', async () => {
    const res = await patchRules({
      minimumStayNights: null,
      maximumStayNights: null,
    });
    expect(res.status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      minimumStayNights: null,
      maximumStayNights: null,
    });
  });

  test('the advance rules clear the same way', async () => {
    const res = await patchRules({
      advanceBookingMinHours: null,
      advanceBookingMaxDays: null,
    });
    expect(res.status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      advanceBookingMinHours: null,
      advanceBookingMaxDays: null,
    });
  });

  test('omitted rules stay unchanged', async () => {
    expect((await patchRules({ advanceBookingMinHours: 5 })).status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      advanceBookingMinHours: 5,
    });
    expect((await patchRules({})).status).toBe(200);
    expect(await storedRules()).toEqual({
      ...BASELINE,
      advanceBookingMinHours: 5,
    });
  });

  test('a blank string is rejected, never stored as 0', async () => {
    const res = await patchRules({ advanceBookingMinHours: '' });
    expect(res.status).toBe(422);
    expect(await storedRules()).toEqual(BASELINE);
  });

  test('0 is a real value for the advance rules', async () => {
    expect((await patchRules({ advanceBookingMinHours: 0 })).status).toBe(200);
    expect((await storedRules()).advanceBookingMinHours).toBe(0);
  });
});

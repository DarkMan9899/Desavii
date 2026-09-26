/**
 * Step L4.2 — every Partner-facing numeric field is rejected at the API
 * validation layer when the value can't be represented by its SQL column,
 * instead of reaching the INSERT/UPDATE and relying on the DB. Before this
 * step, an INT UNSIGNED overflow was only caught after the write failed
 * (`errorMapping.js` → generic 422 with `details: null`), and extra decimal
 * places were silently rounded by MySQL (`24.555` stored as `24.56`).
 *
 * Asserting a populated `error.details[].field` is what proves the
 * rejection happened in `validate()` — the DB-mapped path has no details.
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

const INT_UNSIGNED_MAX = 4294967295;
const DECIMAL_12_2_MAX = 9999999999.99;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let auth;
let partnerId;
let languageId;
let restaurantCategoryId;
let labelSeq = 0;

function uniqueLabel() {
  labelSeq += 1;
  return `L42-${Date.now()}-${labelSeq}`;
}

function fieldsOf(res) {
  return (res.body.error?.details ?? []).map((detail) => detail.field);
}

async function createListing(overrides = {}) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set(auth)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId, title: `L4.2 ${uniqueLabel()}` }],
      ...overrides,
    });
  return res.body.data.id;
}

async function registerUnit(listingId, fields = {}) {
  return request(app)
    .post('/api/v1/availability/units')
    .set(auth)
    .send({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      unitLabel: uniqueLabel(),
      ...fields,
    });
}

async function unitRow(unitId) {
  const [[row]] = await pool.query(
    'SELECT capacity, base_price_amount, room_size_sqm FROM bookable_units WHERE id = ?',
    [unitId],
  );
  return row;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.vendor.email,
    password: DEV_CREDENTIALS.vendor.password,
  });
  auth = { Authorization: `Bearer ${loginRes.body.data.access_token}` };

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[restaurantCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'restaurants'",
  );
  restaurantCategoryId = restaurantCategory.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('bookable unit capacity (INT UNSIGNED)', () => {
  test('the exact column max is accepted and stored', async () => {
    const listingId = await createListing();
    const res = await registerUnit(listingId, { capacity: INT_UNSIGNED_MAX });

    expect(res.status).toBe(201);
    expect(Number((await unitRow(res.body.data.id)).capacity)).toBe(
      INT_UNSIGNED_MAX,
    );
  });

  test('max + 1 is rejected by validation on create, before any DB write', async () => {
    const listingId = await createListing();
    const res = await registerUnit(listingId, {
      capacity: INT_UNSIGNED_MAX + 1,
    });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.capacity');
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM bookable_units WHERE listing_id = ?',
      [listingId],
    );
    expect(count).toBe(0);
  });

  test('max + 1 is rejected on update, and the stored capacity is unchanged', async () => {
    const listingId = await createListing();
    const unitId = (await registerUnit(listingId, { capacity: 3 })).body.data
      .id;

    const res = await request(app)
      .patch(`/api/v1/availability/units/${unitId}`)
      .set(auth)
      .send({ capacity: INT_UNSIGNED_MAX + 1 });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.capacity');
    expect((await unitRow(unitId)).capacity).toBe(3);
  });
});

describe('bookable unit base price (DECIMAL(12,2), strictly positive)', () => {
  test('the exact DECIMAL(12,2) max is accepted and stored exactly', async () => {
    const listingId = await createListing();
    const res = await registerUnit(listingId, {
      basePriceAmount: DECIMAL_12_2_MAX,
      basePriceCurrency: 'AMD',
    });

    expect(res.status).toBe(201);
    expect((await unitRow(res.body.data.id)).base_price_amount).toBe(
      '9999999999.99',
    );
  });

  test.each([
    ['above the DECIMAL(12,2) max', 10000000000],
    ['3 decimal places (MySQL would silently round 19.999 to 20.00)', 19.999],
    ['zero (contract stays strictly positive)', 0],
  ])('%s is rejected by validation', async (_label, basePriceAmount) => {
    const listingId = await createListing();
    const res = await registerUnit(listingId, {
      basePriceAmount,
      basePriceCurrency: 'AMD',
    });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.basePriceAmount');
  });

  test('a rejected update leaves the previous base price unchanged', async () => {
    const listingId = await createListing();
    const unitId = (
      await registerUnit(listingId, {
        basePriceAmount: 50,
        basePriceCurrency: 'AMD',
      })
    ).body.data.id;

    const res = await request(app)
      .patch(`/api/v1/availability/units/${unitId}`)
      .set(auth)
      .send({ basePriceAmount: 19.999, basePriceCurrency: 'AMD' });

    expect(res.status).toBe(422);
    expect((await unitRow(unitId)).base_price_amount).toBe('50.00');
  });
});

describe('bookable unit room size (DECIMAL(6,2), 0 < x <= 1000)', () => {
  test.each([
    ['the 1000 m² max', 1000, '1000.00'],
    ['a 2-decimal value', 24.5, '24.50'],
    ['the smallest 2-decimal positive value', 0.01, '0.01'],
  ])(
    '%s is accepted and stored exactly',
    async (_label, roomSizeSqm, stored) => {
      const listingId = await createListing();
      const res = await registerUnit(listingId, { roomSizeSqm });

      expect(res.status).toBe(201);
      expect((await unitRow(res.body.data.id)).room_size_sqm).toBe(stored);
    },
  );

  test.each([
    ['above the 1000 m² max', 1000.01],
    ['3 decimal places (MySQL would silently round 24.555 to 24.56)', 24.555],
    ['zero', 0],
    ['a negative value', -5],
  ])('%s is rejected by validation', async (_label, roomSizeSqm) => {
    const listingId = await createListing();
    const res = await registerUnit(listingId, { roomSizeSqm });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.roomSizeSqm');
  });
});

describe('Partner calendar quantities (INT UNSIGNED)', () => {
  let unitId;

  beforeAll(async () => {
    const listingId = await createListing();
    unitId = (await registerUnit(listingId, { capacity: 2 })).body.data.id;
  });

  async function blockCount() {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM inventory_blocks WHERE bookable_unit_id = ?',
      [unitId],
    );
    return count;
  }

  async function externalCount() {
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM external_reservations WHERE bookable_unit_id = ?',
      [unitId],
    );
    return count;
  }

  test.each([
    ['above the INT UNSIGNED max', INT_UNSIGNED_MAX + 1],
    ['a decimal', 1.5],
    ['zero', 0],
  ])(
    'manual block quantity %s is rejected with no row written',
    async (_label, quantity) => {
      const before = await blockCount();
      const res = await request(app)
        .post('/api/v1/availability/blocks')
        .set(auth)
        .send({
          unitId,
          dateFrom: '2027-06-01',
          dateTo: '2027-06-01',
          quantity,
          reasonCode: 'MAINTENANCE',
        });

      expect(res.status).toBe(422);
      expect(fieldsOf(res)).toContain('body.quantity');
      expect(await blockCount()).toBe(before);
    },
  );

  test('a valid manual block quantity still succeeds', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set(auth)
      .send({
        unitId,
        dateFrom: '2027-06-02',
        dateTo: '2027-06-02',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
      });

    expect(res.status).toBe(201);
  });

  test('an external reservation quantity above the INT UNSIGNED max is rejected with no row written', async () => {
    const before = await externalCount();
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set(auth)
      .send({
        unitId,
        dateFrom: '2027-06-03',
        dateTo: '2027-06-03',
        sourceCode: 'PHONE',
        quantity: INT_UNSIGNED_MAX + 1,
      });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.quantity');
    expect(await externalCount()).toBe(before);
  });

  test('an omitted external reservation quantity still defaults to 1 (L4.1 contract preserved)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set(auth)
      .send({
        unitId,
        dateFrom: '2027-06-04',
        dateTo: '2027-06-04',
        sourceCode: 'PHONE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(1);
  });

  test('a CSV bulk-import row with an overflowing quantity rejects the batch before any row is written', async () => {
    const before = await externalCount();
    const res = await request(app)
      .post('/api/v1/availability/external-reservations/bulk-import')
      .set(auth)
      .send({
        unitId,
        sourceCode: 'OTHER',
        rows: [
          { dateFrom: '2027-06-10', dateTo: '2027-06-10' },
          {
            dateFrom: '2027-06-11',
            dateTo: '2027-06-11',
            quantity: INT_UNSIGNED_MAX + 1,
          },
        ],
      });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.rows.1.quantity');
    expect(await externalCount()).toBe(before);
  });

  test('calendar quantityAvailable above the INT UNSIGNED max is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set(auth)
      .send({
        unitId,
        dateFrom: '2027-06-20',
        dateTo: '2027-06-20',
        quantityAvailable: INT_UNSIGNED_MAX + 1,
      });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.quantityAvailable');
  });

  test('a calendar price override with 3 decimal places is rejected instead of silently rounded', async () => {
    const res = await request(app).post('/api/v1/availability').set(auth).send({
      unitId,
      dateFrom: '2027-06-21',
      dateTo: '2027-06-21',
      priceOverrideAmount: 19.999,
      priceOverrideCurrency: 'AMD',
    });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.priceOverrideAmount');
  });
});

describe('listing media position (INT UNSIGNED)', () => {
  test('a position above the INT UNSIGNED max is rejected and the stored position is unchanged', async () => {
    const listingId = await createListing();
    const attachRes = await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set(auth)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    const mediaId = attachRes.body.data.id;
    const previousPosition = attachRes.body.data.position;

    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}/media/${mediaId}`)
      .set(auth)
      .send({ position: INT_UNSIGNED_MAX + 1 });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.position');
    const [[row]] = await pool.query(
      'SELECT position FROM media WHERE id = ?',
      [mediaId],
    );
    expect(row.position).toBe(previousPosition);
  });
});

describe('restaurant menu sortOrder (INT UNSIGNED)', () => {
  test('a menu sortOrder above the INT UNSIGNED max is rejected with no menu written', async () => {
    const listingId = await createListing({
      listingType: 'RESTAURANT',
      categoryIds: [restaurantCategoryId],
    });

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/menu`)
      .set(auth)
      .send({ name: 'Dinner', sortOrder: INT_UNSIGNED_MAX + 1 });

    expect(res.status).toBe(422);
    expect(fieldsOf(res)).toContain('body.sortOrder');
    const [[{ count }]] = await pool.query(
      'SELECT COUNT(*) AS count FROM restaurant_menus WHERE listing_id = ?',
      [listingId],
    );
    expect(count).toBe(0);
  });

  test('a menu sortOrder at the INT UNSIGNED max is accepted', async () => {
    const listingId = await createListing({
      listingType: 'RESTAURANT',
      categoryIds: [restaurantCategoryId],
    });

    const res = await request(app)
      .post(`/api/v1/listings/${listingId}/menu`)
      .set(auth)
      .send({ name: 'Lunch', sortOrder: INT_UNSIGNED_MAX });

    expect(res.status).toBe(201);
  });
});

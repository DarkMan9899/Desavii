/**
 * Sprint 9 (final architecture): "Owner availability management," built
 * on `bookable_units` + `availability_calendar` (the primary engine) with
 * `blackout_dates` as the complementary veto layer. Availability is
 * inventory-agnostic: `bookable_units` are only ever created via the
 * explicit `POST /availability/units` call (never as a side effect of a
 * calendar write), and `POST /availability` consumes an existing
 * `unitId` rather than creating one. Exercises unit CRUD, ownership, the
 * AVAILABLE/BLOCKED-only write guard, overlap detection, and
 * management-list visibility — against a real listing created via the
 * Listings API (Sprint 7), never duplicating its business logic.
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

let pool;
let vendor;
let customer;
let admin;
let partnerId;
let languageId;
let listingId;
let unitId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
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
  return res.body.data.id;
}

/**
 * Non-owner requests below must actually reach `ListingService
 * .getListing`'s owner-vs-permission branch (a genuine 403) rather than
 * its earlier "not published and not the owner" 404-masking branch — so
 * every listing these tests act on must be published first, the same
 * `location` + image + `/publish` sequence `listings/listingCrud.test.js`
 * already establishes as the minimum publish-readiness bar.
 */
async function publishListing(id) {
  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
}

async function registerUnit(targetListingId, bookableUnitType = 'HOTEL_ROOM') {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: targetListingId, bookableUnitType });
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

  listingId = await createListing(
    `Availability CRUD Test Listing ${Date.now()}-${Math.floor(Math.random() * 100000)}`,
  );
  // Unit must exist BEFORE publish — Phase 5's publish-readiness gate now
  // requires >=1 bookable unit (ListingService#checkPublishReadiness).
  unitId = await registerUnit(listingId);
  await publishListing(listingId);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /availability/units — inventory-agnostic unit registration', () => {
  test('the owner can register a bookable unit for their listing', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'RESTAURANT_TABLE', capacity: 4 });

    expect(res.status).toBe(201);
    expect(res.body.data.bookable_unit_type).toBe('RESTAURANT_TABLE');
    expect(res.body.data.capacity).toBe(4);
    expect(res.body.data.listing_id).toBe(listingId);
  });

  test('registering the same (listing, type) twice returns the same unit (idempotent find-or-create)', async () => {
    const firstId = await registerUnit(listingId, 'VEHICLE');
    const secondId = await registerUnit(listingId, 'VEHICLE');
    expect(secondId).toBe(firstId);
  });

  test('rejects an unknown bookableUnitType with 422', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'SPACESHIP_BERTH' });
    expect(res.status).toBe(422);
  });

  test('rejects a nonexistent listingId with 404', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId: 9_999_999, bookableUnitType: 'HOTEL_ROOM' });
    expect(res.status).toBe(404);
  });

  test('a non-owner without listing.update is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
    expect(res.status).toBe(403);
  });

  test('an admin can register via the listing.moderate permission fallback', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ listingId, bookableUnitType: 'TOUR_DEPARTURE' });
    expect(res.status).toBe(201);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
    expect(res.status).toBe(401);
  });
});

describe('POST /availability/units — P2.2A occupancy/bed/base-price fields', () => {
  test('registers a unit with maxGuests, bedConfiguration, and a base price', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Deluxe Suite ${Date.now()}`,
        capacity: 3,
        maxGuests: 4,
        bedConfiguration: [
          { type: 'KING', count: 1 },
          { type: 'SOFA_BED', count: 1 },
        ],
        basePriceAmount: 150,
        basePriceCurrency: 'usd',
      });

    expect(res.status).toBe(201);
    // `capacity` (inventory quantity) is untouched by the new fields —
    // confirms max_guests never overloads/aliases it.
    expect(res.body.data.capacity).toBe(3);
    expect(res.body.data.max_guests).toBe(4);
    expect(res.body.data.bed_configuration).toEqual([
      { type: 'KING', count: 1 },
      { type: 'SOFA_BED', count: 1 },
    ]);
    expect(res.body.data.base_price_amount).toBe('150.00');
    // Currency code is normalized upper-case regardless of input case.
    expect(res.body.data.base_price_currency).toBe('USD');
  });

  test('a unit registered without the new fields has safe, honest null values (backward compatibility)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'RESTAURANT_TABLE',
        unitLabel: `Legacy-shaped table ${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.max_guests).toBeNull();
    expect(res.body.data.bed_configuration).toBeNull();
    expect(res.body.data.base_price_amount).toBeNull();
    expect(res.body.data.base_price_currency).toBeNull();
  });

  test('rejects basePriceAmount without basePriceCurrency (both-or-neither)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Incomplete price ${Date.now()}`,
        basePriceAmount: 90,
      });
    expect(res.status).toBe(422);
  });

  test('rejects an unknown bed type', async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Bad bed type ${Date.now()}`,
        bedConfiguration: [{ type: 'HAMMOCK', count: 1 }],
      });
    expect(res.status).toBe(422);
  });
});

describe('P2.2A — multiple independent room types on one HOTEL listing', () => {
  test('a hotel can register two room types with independent capacity, occupancy, and base price', async () => {
    const standardRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Standard Room ${Date.now()}`,
        capacity: 5,
        maxGuests: 2,
        basePriceAmount: 80,
        basePriceCurrency: 'AMD',
      });
    const deluxeRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Deluxe Room ${Date.now()}`,
        capacity: 2,
        maxGuests: 4,
        basePriceAmount: 200,
        basePriceCurrency: 'AMD',
      });

    expect(standardRes.status).toBe(201);
    expect(deluxeRes.status).toBe(201);
    // Two distinct rows, same listing, same bookable_unit_type, both real
    // — not a find-or-create collapse (the labels differ).
    expect(standardRes.body.data.id).not.toBe(deluxeRes.body.data.id);
    expect(standardRes.body.data.listing_id).toBe(listingId);
    expect(deluxeRes.body.data.listing_id).toBe(listingId);
    expect(standardRes.body.data.capacity).toBe(5);
    expect(deluxeRes.body.data.capacity).toBe(2);
    expect(standardRes.body.data.max_guests).toBe(2);
    expect(deluxeRes.body.data.max_guests).toBe(4);
    expect(standardRes.body.data.base_price_amount).toBe('80.00');
    expect(deluxeRes.body.data.base_price_amount).toBe('200.00');

    const listRes = await request(app)
      .get(`/api/v1/availability/units?listingId=${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    const ids = listRes.body.data.map((u) => u.id);
    expect(ids).toContain(standardRes.body.data.id);
    expect(ids).toContain(deluxeRes.body.data.id);
  });
});

describe('PATCH /availability/units/:id — edit an existing unit (P2.2A)', () => {
  let editableUnitId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Editable Room ${Date.now()}`,
        capacity: 1,
      });
    editableUnitId = res.body.data.id;
  });

  test('the owner can update label, capacity, occupancy, bed configuration, and base price', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${editableUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitLabel: 'Renamed Room',
        capacity: 6,
        maxGuests: 3,
        bedConfiguration: [{ type: 'QUEEN', count: 1 }],
        basePriceAmount: 120,
        basePriceCurrency: 'EUR',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.unit_label).toBe('Renamed Room');
    expect(res.body.data.capacity).toBe(6);
    expect(res.body.data.max_guests).toBe(3);
    expect(res.body.data.bed_configuration).toEqual([
      { type: 'QUEEN', count: 1 },
    ]);
    expect(res.body.data.base_price_amount).toBe('120.00');
    expect(res.body.data.base_price_currency).toBe('EUR');
  });

  test('a partial update only touches the given fields', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${editableUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ maxGuests: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.max_guests).toBe(5);
    // Untouched by this request — still the value the previous test set.
    expect(res.body.data.unit_label).toBe('Renamed Room');
    expect(res.body.data.base_price_amount).toBe('120.00');
  });

  test('rejects an empty body', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${editableUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({});
    expect(res.status).toBe(422);
  });

  test('a non-owner cannot update it (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${editableUnitId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ maxGuests: 9 });
    expect(res.status).toBe(403);
  });

  test('a nonexistent unit id 404s', async () => {
    const res = await request(app)
      .patch('/api/v1/availability/units/9999999')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ maxGuests: 2 });
    expect(res.status).toBe(404);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${editableUnitId}`)
      .send({ maxGuests: 2 });
    expect(res.status).toBe(401);
  });
});

describe('PATCH /availability/units/:id — lowering capacity cannot corrupt existing consumption (P2.2A)', () => {
  // `lockForCapacity`'s own INSERT is `ON DUPLICATE KEY UPDATE id = id` —
  // once a date has a real availability_calendar row, it is governed
  // entirely by its own `quantity_available`, forever independent of
  // `bookable_units.capacity` (capacity is only ever read to seed a
  // date's FIRST row, never to recompute an existing one). This proves
  // that invariant holds end-to-end: lowering capacity after real
  // consumption already exists neither corrupts that consumption nor
  // permits overselling on the already-touched date, and correctly
  // takes effect for a genuinely untouched future date.
  test('an already-consumed date keeps its own correct availability and conflict protection after capacity is lowered', async () => {
    const capacityUnitId = await registerUnit(listingId, 'HOTEL_ROOM');
    await request(app)
      .patch(`/api/v1/availability/units/${capacityUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ capacity: 5 });

    const consumedDate = '2027-05-01';
    const untouchedDate = '2027-06-01';

    // Consume 4 of the 5 via a real hold on the already-declared date —
    // materializes a real availability_calendar row.
    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: capacityUnitId,
            dateFrom: consumedDate,
            dateTo: consumedDate,
            quantity: 4,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    // Lower capacity below the already-consumed amount.
    const lowerRes = await request(app)
      .patch(`/api/v1/availability/units/${capacityUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ capacity: 2 });
    expect(lowerRes.status).toBe(200);
    expect(lowerRes.body.data.capacity).toBe(2);

    // The consumed date's own real state is untouched: still exactly 1
    // of the original 5 remains (never recomputed from the new capacity,
    // never negative).
    const calendarRes = await request(app)
      .get(
        `/api/v1/availability?listingId=${listingId}&from=${consumedDate}&to=${consumedDate}`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    const consumedEntry = calendarRes.body.data.find(
      (entry) => entry.bookable_unit_id === capacityUnitId,
    );
    expect(consumedEntry.quantity_available).toBe(1);

    // The real conflict-protection choke point (never `capacity`
    // directly) still correctly allows exactly the 1 remaining unit —
    // proving no overselling became possible.
    const exactFitRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: capacityUnitId,
            dateFrom: consumedDate,
            dateTo: consumedDate,
            quantity: 1,
          },
        ],
      });
    expect(exactFitRes.status).toBe(201);

    // ...and one more (which the OLD capacity of 5 would still nominally
    // allow, but nothing is left) is correctly rejected.
    const overRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: capacityUnitId,
            dateFrom: consumedDate,
            dateTo: consumedDate,
            quantity: 1,
          },
        ],
      });
    expect(overRes.status).toBe(409);
    expect(overRes.body.error.code).toBe('AVAILABILITY_CONFLICT');

    // A genuinely untouched future date correctly reflects the NEW,
    // lower capacity as its default.
    const untouchedHoldRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: capacityUnitId,
            dateFrom: untouchedDate,
            dateTo: untouchedDate,
            quantity: 3,
          },
        ],
      });
    expect(untouchedHoldRes.status).toBe(409);
    expect(untouchedHoldRes.body.error.code).toBe('AVAILABILITY_CONFLICT');
  });
});

describe('GET /availability/units — management list', () => {
  test("the owner sees their listing's units", async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units?listingId=${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('a non-owner cannot list them (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units?listingId=${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /availability/units/:id — retire a unit', () => {
  test('the owner can retire their own unit', async () => {
    const idToRetire = await registerUnit(listingId, 'RESTAURANT_TABLE');
    const res = await request(app)
      .delete(`/api/v1/availability/units/${idToRetire}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('a non-owner cannot retire it (403)', async () => {
    const idToRetire = await registerUnit(listingId, 'VEHICLE');
    const res = await request(app)
      .delete(`/api/v1/availability/units/${idToRetire}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('a nonexistent unit id 404s', async () => {
    const res = await request(app)
      .delete('/api/v1/availability/units/9999999')
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /availability — set calendar range (consumes an existing unitId)', () => {
  test('the owner can block a date range against a registered unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-09-01',
        dateTo: '2026-09-03',
        status: 'BLOCKED',
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((entry) => entry.status === 'BLOCKED')).toBe(
      true,
    );
    expect(res.body.data.map((entry) => entry.date)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  test('defaults to AVAILABLE when status is omitted', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: '2026-10-01', dateTo: '2026-10-01' });

    expect(res.status).toBe(201);
    expect(res.body.data[0].status).toBe('AVAILABLE');
  });

  test('rejects an attempt to write BOOKED — reserved for the Booking Engine', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom: '2026-12-05',
        dateTo: '2026-12-05',
        status: 'BOOKED',
      });
    expect(res.status).toBe(422);
  });

  test('rejects an inverted range with 422', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: '2026-12-10', dateTo: '2026-12-01' });
    expect(res.status).toBe(422);
  });

  test('rejects a nonexistent unitId with 404 — Availability never creates one to compensate', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId: 9_999_999,
        dateFrom: '2026-12-15',
        dateTo: '2026-12-15',
      });
    expect(res.status).toBe(404);
  });

  test('a non-owner without listing.update is rejected with 403', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ unitId, dateFrom: '2026-12-20', dateTo: '2026-12-20' });
    expect(res.status).toBe(403);
  });

  test('an admin can write via the listing.moderate permission fallback', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ unitId, dateFrom: '2027-01-01', dateTo: '2027-01-01' });
    expect(res.status).toBe(201);
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .send({ unitId, dateFrom: '2027-02-01', dateTo: '2027-02-01' });
    expect(res.status).toBe(401);
  });
});

describe('PATCH/DELETE /availability/:id — single calendar entry', () => {
  let entryId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitId, dateFrom: '2026-04-01', dateTo: '2026-04-01' });
    entryId = res.body.data[0].id;
  });

  test('the owner can update the status and quantity_available', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/${entryId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'BLOCKED', quantityAvailable: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('BLOCKED');
    expect(res.body.data.quantity_available).toBe(0);
  });

  test('rejects writing HELD with 422', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/${entryId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'HELD' });
    expect(res.status).toBe(422);
  });

  test('a non-owner cannot update (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/${entryId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(403);
  });

  test('a nonexistent entry id 404s', async () => {
    const res = await request(app)
      .patch('/api/v1/availability/9999999')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ status: 'AVAILABLE' });
    expect(res.status).toBe(404);
  });

  test('the owner can delete an entry; a management-list query no longer includes it', async () => {
    const deleteRes = await request(app)
      .delete(`/api/v1/availability/${entryId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(deleteRes.status).toBe(200);

    const listRes = await request(app)
      .get(
        `/api/v1/availability?listingId=${listingId}&from=2026-04-01&to=2026-04-01`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(listRes.body.data.map((e) => e.id)).not.toContain(entryId);
  });
});

describe('GET /availability — calendar management list', () => {
  test('the owner sees their own listing entries', async () => {
    const res = await request(app)
      .get(`/api/v1/availability?listingId=${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('bookable_unit_id');
  });

  test('requires authentication', async () => {
    const res = await request(app).get(
      `/api/v1/availability?listingId=${listingId}`,
    );
    expect(res.status).toBe(401);
  });

  test('a customer browsing with no filters and no permission is rejected with 403', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('an admin can browse platform-wide with no filters', async () => {
    const res = await request(app)
      .get('/api/v1/availability')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST/PATCH/DELETE /availability/blackouts — complementary veto layer', () => {
  test('the owner can create a blackout range', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blackouts')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        dateFrom: '2026-05-01',
        dateTo: '2026-05-03',
        reason: 'Maintenance',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.reason).toBe('Maintenance');
  });

  test('rejects an overlapping blackout range with 409', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blackouts')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, dateFrom: '2026-05-02', dateTo: '2026-05-10' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('OVERLAPPING_RANGE');
  });

  test('a non-owner cannot create a blackout (403)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blackouts')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId, dateFrom: '2026-06-01', dateTo: '2026-06-02' });
    expect(res.status).toBe(403);
  });

  test('the owner can update and then delete a blackout range', async () => {
    const createRes = await request(app)
      .post('/api/v1/availability/blackouts')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, dateFrom: '2026-06-10', dateTo: '2026-06-12' });
    const blockId = createRes.body.data.id;

    const updateRes = await request(app)
      .patch(`/api/v1/availability/blackouts/${blockId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Updated' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.reason).toBe('Updated');

    const deleteRes = await request(app)
      .delete(`/api/v1/availability/blackouts/${blockId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(deleteRes.status).toBe(200);
  });

  test('GET /availability/blackouts requires authentication', async () => {
    const res = await request(app).get('/api/v1/availability/blackouts');
    expect(res.status).toBe(401);
  });

  test("GET /availability/blackouts lists the owner's ranges with reason and id", async () => {
    const res = await request(app)
      .get(`/api/v1/availability/blackouts?listingId=${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('reason');
    expect(res.body.data[0]).toHaveProperty('id');
  });
});

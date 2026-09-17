/**
 * Phase 17 §Search Availability Integration — proves `GET /search` filters
 * on the REAL Inventory Engine (bookable_units + availability_calendar +
 * blackout_dates), not just listing metadata. Mirrors `searchListings.test.js`'s
 * fixture-via-API style (never hand-crafts rows Listings/Availability's own
 * services own).
 *
 * Explicitly covers a non-accommodation category (TOUR_DEPARTURE, single-day
 * request) alongside the dominant Hotel "stay" case, since the search filter
 * must never be hotel-only per the Phase 17 brief.
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

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let vendor;
let partnerId;
let languageId;
let hotelsCategoryId;
let toursCategoryId;
let carsCategoryId;
let yerevanCityId;

let listingRoomy; // HOTEL_ROOM, capacity 3, no blocks — available
let listingSoldOut; // HOTEL_ROOM, capacity 1, fully blocked for the search range
let listingBlackout; // HOTEL_ROOM, capacity 3, listing-level blackout over the search range
let listingTour; // TOUR_DEPARTURE, capacity 2 — single-day, non-accommodation
let listingSingleOccupancy; // HOTEL_ROOM, capacity 4, max_guests 1 — P2.2D occupancy fix
let listingCar; // VEHICLE (CAR_RENTAL), capacity 1 — P2.2D inclusive-final-day fix
let blackoutId;
let soldOutUnitId;
let carUnitId;

const STAY_FROM = '2026-09-10';
const STAY_TO = '2026-09-12'; // checkout-exclusive: consumed nights are 09-10, 09-11
const TOUR_DAY = '2026-09-15';
const CAR_FROM = '2026-09-20';
const CAR_TO = '2026-09-22'; // VEHICLE keeps inclusive-both-ends: the rental spans 09-20, 09-21, AND 09-22

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function createListing({ title, listingType, categoryId, cityId }) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title, description: `${title} — integration fixture.` },
      ],
      categoryIds: [categoryId],
      location: { cityId },
    });
  return res.body.data.id;
}

async function publishListing(
  listingId,
  { bookableUnitType, capacity, maxGuests, unitLabel },
) {
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      listingId,
      bookableUnitType,
      capacity,
      ...(maxGuests !== undefined ? { maxGuests } : {}),
      ...(unitLabel !== undefined ? { unitLabel } : {}),
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
  return unitRes.body.data.id;
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

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[hotelsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotelsCategory.id;
  const [[toursCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'tours'",
  );
  toursCategoryId = toursCategory.id;
  const [[carsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'car-rentals'",
  );
  carsCategoryId = carsCategory.id;
  const [[yerevan]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'yerevan'",
  );
  yerevanCityId = yerevan.id;

  listingRoomy = await createListing({
    title: 'Availability Roomy Hotel',
    listingType: 'HOTEL',
    categoryId: hotelsCategoryId,
    cityId: yerevanCityId,
  });
  listingSoldOut = await createListing({
    title: 'Availability Sold Out Hotel',
    listingType: 'HOTEL',
    categoryId: hotelsCategoryId,
    cityId: yerevanCityId,
  });
  listingBlackout = await createListing({
    title: 'Availability Blackout Hotel',
    listingType: 'HOTEL',
    categoryId: hotelsCategoryId,
    cityId: yerevanCityId,
  });
  listingTour = await createListing({
    title: 'Availability Mountain Day Tour',
    listingType: 'TOUR',
    categoryId: toursCategoryId,
    cityId: yerevanCityId,
  });
  listingSingleOccupancy = await createListing({
    title: 'Availability Single Occupancy Rooms',
    listingType: 'HOTEL',
    categoryId: hotelsCategoryId,
    cityId: yerevanCityId,
  });
  listingCar = await createListing({
    title: 'Availability Sedan Rental',
    listingType: 'CAR_RENTAL',
    categoryId: carsCategoryId,
    cityId: yerevanCityId,
  });

  await publishListing(listingRoomy, {
    bookableUnitType: 'HOTEL_ROOM',
    capacity: 3,
  });
  soldOutUnitId = await publishListing(listingSoldOut, {
    bookableUnitType: 'HOTEL_ROOM',
    capacity: 1,
  });
  await publishListing(listingBlackout, {
    bookableUnitType: 'HOTEL_ROOM',
    capacity: 3,
  });
  await publishListing(listingTour, {
    bookableUnitType: 'TOUR_DEPARTURE',
    capacity: 2,
  });
  // P2.2D: 4 identical rooms (plenty of inventory), each sleeping only 1
  // guest — the exact shape the audited bug missed (capacity != max_guests).
  await publishListing(listingSingleOccupancy, {
    bookableUnitType: 'HOTEL_ROOM',
    capacity: 4,
    maxGuests: 1,
  });
  carUnitId = await publishListing(listingCar, {
    bookableUnitType: 'VEHICLE',
    capacity: 1,
  });

  // Fully consume the sold-out hotel's only unit for the search's stay
  // range via a manual block — the same real write path a Partner uses.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: soldOutUnitId,
      dateFrom: STAY_FROM,
      dateTo: STAY_TO,
      quantity: 1,
      reasonCode: 'MAINTENANCE',
    });

  // Listing-level blackout veto over the same stay range.
  const blackoutRes = await request(app)
    .post('/api/v1/availability/blackouts')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: listingBlackout, dateFrom: STAY_FROM, dateTo: STAY_TO });
  blackoutId = blackoutRes.body.data.id;

  // P2.2D: blocks ONLY the car rental's final day (`CAR_TO` itself, the
  // day VEHICLE's inclusive-both-ends semantics still counts as rented).
  // Under the pre-fix uniform checkout-exclusive collapse, this day would
  // never have been checked at all for a non-accommodation type.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: carUnitId,
      dateFrom: CAR_TO,
      dateTo: CAR_TO,
      quantity: 1,
      reasonCode: 'MAINTENANCE',
    });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /search — availability filtering (Inventory Engine)', () => {
  test('a listing with sufficient capacity for the whole stay is included', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toContain(listingRoomy);
  });

  test('a listing whose only unit is fully blocked for the stay is excluded', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(listingSoldOut);
  });

  test('a listing under a listing-level blackout covering the stay is excluded', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(listingBlackout);
  });

  test('releasing the blackout makes the listing reappear in the same search', async () => {
    await request(app)
      .delete(`/api/v1/availability/blackouts/${blackoutId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=1`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toContain(listingBlackout);
  });

  test('a non-accommodation single-day search (TOUR_DEPARTURE) is respected, proving no hotel-only logic', async () => {
    const withinCapacity = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${TOUR_DAY}&dateTo=${TOUR_DAY}&guests=2`,
    );
    expect(withinCapacity.status).toBe(200);
    expect(withinCapacity.body.data.map((r) => r.id)).toContain(listingTour);

    const overCapacity = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${TOUR_DAY}&dateTo=${TOUR_DAY}&guests=3`,
    );
    expect(overCapacity.status).toBe(200);
    expect(overCapacity.body.data.map((r) => r.id)).not.toContain(listingTour);
  });

  // P2.2D fix: previously `guests` was compared against room INVENTORY
  // quantity (`capacity`), never against `max_guests` (real per-room
  // occupancy) — a listing with plenty of single-occupancy rooms wrongly
  // satisfied a large party search. `listingSingleOccupancy` has 4 rooms
  // (`capacity=4`, plenty of inventory) but each sleeps only 1 guest
  // (`max_guests=1`).
  test("guests is checked against a room type's real max_guests, not raw room inventory (P2.2D)", async () => {
    const fitsOneGuest = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=1`,
    );
    expect(fitsOneGuest.status).toBe(200);
    expect(fitsOneGuest.body.data.map((r) => r.id)).toContain(
      listingSingleOccupancy,
    );

    // Pre-fix, this would have wrongly passed: capacity=4 >= 3, even
    // though no single room can actually sleep 3 people.
    const tooManyGuests = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=3`,
    );
    expect(tooManyGuests.status).toBe(200);
    expect(tooManyGuests.body.data.map((r) => r.id)).not.toContain(
      listingSingleOccupancy,
    );
  });

  // A unit with no `max_guests` set (the common case for every fixture
  // predating P2.2A, and for any non-accommodation type) must never be
  // vetoed on occupancy — mirrors `bookingService.js#resolveItem`'s own
  // NULL-safety for the identical check at booking time.
  test('a unit with no max_guests set is never vetoed on occupancy, regardless of guest count (P2.2D)', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${STAY_FROM}&dateTo=${STAY_TO}&guests=10`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).toContain(listingRoomy);
  });

  // P2.2D fix: search previously collapsed every multi-day request to
  // checkout-exclusive nights regardless of type, so a CAR_RENTAL's own
  // inclusive-both-ends final day was never actually checked. Blocking
  // exactly `CAR_TO` (the rental's last, still-occupied day) must now
  // exclude the listing; a HOTEL blocked only on its own checkout day
  // (never occupied) must NOT be excluded by the same mechanism.
  test('a multi-day CAR_RENTAL search checks the inclusive final day, unlike a HOTEL checkout day (P2.2D)', async () => {
    const carRes = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${CAR_FROM}&dateTo=${CAR_TO}&guests=1`,
    );
    expect(carRes.status).toBe(200);
    expect(carRes.body.data.map((r) => r.id)).not.toContain(listingCar);

    // Sanity check the same fixture is bookable for a range that never
    // touches its one blocked day — proves the exclusion above is really
    // about the final-day check, not the vehicle being permanently gone.
    const clearRangeRes = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${CAR_FROM}&dateTo=2026-09-21&guests=1`,
    );
    expect(clearRangeRes.status).toBe(200);
    expect(clearRangeRes.body.data.map((r) => r.id)).toContain(listingCar);

    // The existing HOTEL stay-range assertions above (`STAY_FROM`/
    // `STAY_TO`) already prove the symmetric case: `listingRoomy` stays
    // included for that exact range with no block on it at all, and
    // `listingSoldOut`/`listingBlackout`'s own blocks are scoped to the
    // consumed nights, never to their own checkout day — checkout-
    // exclusivity for accommodation is unchanged by this fix.
  });

  // Launch-blocker remediation (P0-C): before this fix, `listingCar`
  // (VEHICLE, capacity=1 — one row per VIN under this app's fleet-
  // inventory data model) was wrongly compared against the requested
  // party size, the same as a TOUR_DEPARTURE's seat count. A single
  // available vehicle was excluded from any `guests >= 2` search even
  // though it had nothing to do with how many people it could seat.
  // `CAR_FROM`..`2026-09-21` is the same "clear range" (no blocks) the
  // existing inclusive-final-day test above already establishes.
  test('a single available VEHICLE remains discoverable for guests=2 and guests=3 (P0-C)', async () => {
    const guests2 = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${CAR_FROM}&dateTo=2026-09-21&guests=2`,
    );
    expect(guests2.status).toBe(200);
    expect(guests2.body.data.map((r) => r.id)).toContain(listingCar);

    const guests3 = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${CAR_FROM}&dateTo=2026-09-21&guests=3`,
    );
    expect(guests3.status).toBe(200);
    expect(guests3.body.data.map((r) => r.id)).toContain(listingCar);
  });

  // The genuine-unavailability case (its one VIN blocked on CAR_TO) must
  // still exclude the listing regardless of guest count — proving the
  // P0-C fix changed WHAT capacity is compared against, not whether a
  // truly unavailable vehicle can still be found.
  test('a genuinely unavailable VEHICLE (blocked inventory) stays excluded even at guests=2 (P0-C)', async () => {
    const res = await request(app).get(
      `/api/v1/search?keyword=Availability&dateFrom=${CAR_FROM}&dateTo=${CAR_TO}&guests=2`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.id)).not.toContain(listingCar);
  });

  test('without dateFrom/dateTo, availability is not filtered at all (every fixture listing appears)', async () => {
    const res = await request(app).get('/api/v1/search?keyword=Availability');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        listingRoomy,
        listingSoldOut,
        listingBlackout,
        listingTour,
      ]),
    );
  });

  test('dateFrom without dateTo is rejected with 422', async () => {
    const res = await request(app).get(`/api/v1/search?dateFrom=${STAY_FROM}`);
    expect(res.status).toBe(422);
  });

  test('dateTo before dateFrom is rejected with 422', async () => {
    const res = await request(app).get(
      `/api/v1/search?dateFrom=${STAY_TO}&dateTo=${STAY_FROM}`,
    );
    expect(res.status).toBe(422);
  });
});

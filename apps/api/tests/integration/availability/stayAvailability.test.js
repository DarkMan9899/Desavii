/**
 * Sprint C-3 (Date-Range Room Availability + Stay Pricing) —
 * `GET /availability/:listingId/units?checkIn=&checkOut=`. Proves the new
 * read-only stay-range preview correctly REFLECTS the existing, unmodified
 * capacity engine (`AvailabilityService#reserveCapacity`/`releaseHold`/
 * `releaseExpiredHoldsBatch`, `BookingService#cancelBooking`) rather than
 * re-implementing any of it — every fixture here creates REAL holds/
 * bookings through the real HTTP API, never a direct DB write standing in
 * for one.
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
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let vendor;
let customer;
let partnerId;
let languageId;
let pool;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+37400000000',
};

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

/** Mirrors bookingCreation.test.js's own helper exactly — a published HOTEL listing, ready for real units/holds/bookings. */
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

async function registerUnit(listingId, overrides = {}) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      capacity: 1,
      basePriceAmount: 10000,
      basePriceCurrency: 'AMD',
      ...overrides,
    });
  return res.body.data.id;
}

async function createHold(unitId, dateFrom, dateTo, quantity = 1, extra = {}) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity, ...extra }],
    });
  return res.body.data.items[0].hold_ids;
}

async function createBookingFromHold(holdIds) {
  const res = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ holdIds, guests: [{ fullName: 'Ada Lovelace' }] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  return res.body.data;
}

async function getStayAvailability(listingId, checkIn, checkOut) {
  return request(app).get(
    `/api/v1/availability/${listingId}/units?checkIn=${checkIn}&checkOut=${checkOut}`,
  );
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

describe('GET /availability/:listingId/units?checkIn=&checkOut= (Sprint C-3)', () => {
  test('A: a fresh room with no consumption is AVAILABLE for a valid stay', async () => {
    const listingId = await createListing(`Stay Fresh ${Date.now()}`);
    // capacity must clear LOW_STOCK_THRESHOLD (5) for a plain AVAILABLE
    // bucket — a smaller capacity would correctly (and separately) bucket
    // as LOW even with zero consumption.
    const unitId = await registerUnit(listingId, {
      unitLabel: 'Fresh Room',
      capacity: 10,
    });

    const res = await getStayAvailability(
      listingId,
      '2027-03-01',
      '2027-03-04',
    );
    expect(res.status).toBe(200);
    const unit = res.body.data.find((u) => u.id === unitId);
    expect(unit.availability_status_for_stay).toBe('AVAILABLE');
    expect(unit.remaining_count_for_stay).toBeNull();
  });

  test('B + N: checkout night is excluded, night count and stay total are computed server-side', async () => {
    const listingId = await createListing(`Stay Nights ${Date.now()}`);
    const unitId = await registerUnit(listingId, {
      unitLabel: 'Nights Room',
      capacity: 10,
      basePriceAmount: 12000,
      basePriceCurrency: 'AMD',
    });

    // 2027-04-10 -> 2027-04-13 = 3 occupied nights (10, 11, 12); the 13th
    // (checkout) is never consumed or priced.
    const res = await getStayAvailability(
      listingId,
      '2027-04-10',
      '2027-04-13',
    );
    const unit = res.body.data.find((u) => u.id === unitId);
    expect(unit.night_count_for_stay).toBe(3);
    expect(unit.stay_total_amount).toBe('36000.00');
    expect(unit.stay_total_currency).toBe('AMD');

    // A hold that consumes ONLY the checkout night must never affect this
    // stay's availability — proves the checkout day really is excluded.
    await createHold(unitId, '2027-04-13', '2027-04-14', 5);
    const res2 = await getStayAvailability(
      listingId,
      '2027-04-10',
      '2027-04-13',
    );
    expect(
      res2.body.data.find((u) => u.id === unitId).availability_status_for_stay,
    ).toBe('AVAILABLE');
  });

  test('D: sold out on one night makes the entire stay unavailable, even with open nights on both sides', async () => {
    const listingId = await createListing(`Stay OneNightSoldOut ${Date.now()}`);
    const unitId = await registerUnit(listingId, {
      unitLabel: 'OneNightSoldOut Room',
      capacity: 2,
    });

    // Consume all capacity for exactly the middle night (2027-05-11) only.
    await createHold(unitId, '2027-05-11', '2027-05-12', 2);

    const res = await getStayAvailability(
      listingId,
      '2027-05-10',
      '2027-05-13',
    );
    const unit = res.body.data.find((u) => u.id === unitId);
    expect(unit.availability_status_for_stay).toBe('SOLD_OUT');
    expect(unit.remaining_count_for_stay).toBe(0);
  });

  test('E + K: remaining count is the TRUE minimum across every night, at the exact capacity boundary', async () => {
    const listingId = await createListing(`Stay Minimum ${Date.now()}`);
    const unitId = await registerUnit(listingId, {
      unitLabel: 'Minimum Room',
      capacity: 3,
    });

    // Night 1 (06-01): consume 2 of 3 -> remaining 1.
    await createHold(unitId, '2027-06-01', '2027-06-02', 2);
    // Night 2 (06-02): consume 0 -> remaining 3.
    // Night 3 (06-03): consume 1 of 3 -> remaining 2.
    await createHold(unitId, '2027-06-03', '2027-06-04', 1);

    const res = await getStayAvailability(
      listingId,
      '2027-06-01',
      '2027-06-04',
    );
    const unit = res.body.data.find((u) => u.id === unitId);
    // min(1, 3, 2) = 1 — never the min of only the non-zero/high nights.
    expect(unit.availability_status_for_stay).toBe('LOW');
    expect(unit.remaining_count_for_stay).toBe(1);
  });

  test('G: an active hold (never converted to a booking) reduces stay availability', async () => {
    const listingId = await createListing(`Stay ActiveHold ${Date.now()}`);
    const unitId = await registerUnit(listingId, {
      unitLabel: 'ActiveHold Room',
      capacity: 1,
    });

    await createHold(unitId, '2027-07-01', '2027-07-03', 1);

    const res = await getStayAvailability(
      listingId,
      '2027-07-01',
      '2027-07-03',
    );
    const unit = res.body.data.find((u) => u.id === unitId);
    expect(unit.availability_status_for_stay).toBe('SOLD_OUT');
  });

  test('H: an expired, swept hold no longer reduces stay availability', async () => {
    const listingId = await createListing(`Stay ExpiredHold ${Date.now()}`);
    // capacity must clear LOW_STOCK_THRESHOLD (5) so the fully-restored
    // state below reads as a plain AVAILABLE rather than LOW; the hold
    // below fully consumes it to reach SOLD_OUT first.
    const unitId = await registerUnit(listingId, {
      unitLabel: 'ExpiredHold Room',
      capacity: 10,
    });
    await createHold(unitId, '2027-08-01', '2027-08-03', 10);

    const before = await getStayAvailability(
      listingId,
      '2027-08-01',
      '2027-08-03',
    );
    expect(
      before.body.data.find((u) => u.id === unitId)
        .availability_status_for_stay,
    ).toBe('SOLD_OUT');

    // Force every active hold to look expired, then run the real sweep
    // (`AvailabilityService#releaseExpiredHoldsBatch`, unmodified) —
    // exactly what the scheduled job in server.js calls.
    await pool.query(
      'UPDATE reservation_holds SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE bookable_unit_id = ?',
      [unitId],
    );
    await services.availabilityService.releaseExpiredHoldsBatch();

    const after = await getStayAvailability(
      listingId,
      '2027-08-01',
      '2027-08-03',
    );
    expect(
      after.body.data.find((u) => u.id === unitId).availability_status_for_stay,
    ).toBe('AVAILABLE');
  });

  test('F + I: a booking consumes inventory, and cancelling it restores stay availability', async () => {
    const listingId = await createListing(
      `Stay BookingLifecycle ${Date.now()}`,
    );
    // capacity must clear LOW_STOCK_THRESHOLD (5) so the restored state
    // after cancellation reads as a plain AVAILABLE rather than LOW; the
    // hold/booking below fully consumes it to reach SOLD_OUT first.
    const unitId = await registerUnit(listingId, {
      unitLabel: 'BookingLifecycle Room',
      capacity: 10,
    });
    const holdIds = await createHold(unitId, '2027-09-01', '2027-09-03', 10);
    const booking = await createBookingFromHold(holdIds);
    expect(booking.status).toBe('PENDING_VENDOR');

    const duringRes = await getStayAvailability(
      listingId,
      '2027-09-01',
      '2027-09-03',
    );
    expect(
      duringRes.body.data.find((u) => u.id === unitId)
        .availability_status_for_stay,
    ).toBe('SOLD_OUT');

    // A customer can only cancel a CONFIRMED booking (the state machine
    // has no PENDING_VENDOR -> CANCELLED_BY_CUSTOMER edge) — the vendor
    // must confirm it first.
    await request(app)
      .post(`/api/v1/bookings/${booking.id}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Sprint C-3 test cleanup' });

    const afterRes = await getStayAvailability(
      listingId,
      '2027-09-01',
      '2027-09-03',
    );
    expect(
      afterRes.body.data.find((u) => u.id === unitId)
        .availability_status_for_stay,
    ).toBe('AVAILABLE');
  });

  test('J: room types on the same listing are independent — one sold out never affects another', async () => {
    const listingId = await createListing(`Stay Independence ${Date.now()}`);
    const roomA = await registerUnit(listingId, {
      unitLabel: 'Room A',
      capacity: 1,
    });
    // Room B's capacity must clear LOW_STOCK_THRESHOLD (5) for a plain
    // AVAILABLE bucket, distinct from room A's SOLD_OUT.
    const roomB = await registerUnit(listingId, {
      unitLabel: 'Room B',
      capacity: 10,
    });
    await createHold(roomA, '2027-10-01', '2027-10-03', 1);

    const res = await getStayAvailability(
      listingId,
      '2027-10-01',
      '2027-10-03',
    );
    const a = res.body.data.find((u) => u.id === roomA);
    const b = res.body.data.find((u) => u.id === roomB);
    expect(a.availability_status_for_stay).toBe('SOLD_OUT');
    expect(b.availability_status_for_stay).toBe('AVAILABLE');
  });

  test('M: invalid date ranges are rejected — checkout before/equal check-in, malformed dates, oversized span', async () => {
    const listingId = await createListing(`Stay Invalid ${Date.now()}`);

    const equalDates = await getStayAvailability(
      listingId,
      '2027-11-05',
      '2027-11-05',
    );
    expect(equalDates.status).toBe(422);

    const reversed = await getStayAvailability(
      listingId,
      '2027-11-10',
      '2027-11-05',
    );
    expect(reversed.status).toBe(422);

    const malformed = await request(app).get(
      `/api/v1/availability/${listingId}/units?checkIn=not-a-date&checkOut=2027-11-05`,
    );
    expect(malformed.status).toBe(422);

    const oneSided = await request(app).get(
      `/api/v1/availability/${listingId}/units?checkIn=2027-11-05`,
    );
    expect(oneSided.status).toBe(422);

    const tooLong = await getStayAvailability(
      listingId,
      '2027-01-01',
      '2029-01-01',
    );
    expect(tooLong.status).toBe(422);
  });

  test('backward compatible: the existing single-date ?date= time-slot pathway is unaffected', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'TOUR',
        translations: [
          { languageId, title: `Stay Regression Tour ${Date.now()}` },
        ],
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
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'TOUR_DEPARTURE',
        timeSlotStart: '09:00',
        timeSlotEnd: '11:00',
        // Clears LOW_STOCK_THRESHOLD (5) so the plain ?date= pathway
        // reads AVAILABLE, matching this test's own assertion.
        capacity: 10,
      });
    const unitId = unitRes.body.data.id;
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const dateRes = await request(app).get(
      `/api/v1/availability/${listingId}/units?date=2027-12-01`,
    );
    expect(dateRes.status).toBe(200);
    const unit = dateRes.body.data.find((u) => u.id === unitId);
    expect(unit.availability_status_for_date).toBe('AVAILABLE');
    expect(unit).not.toHaveProperty('availability_status_for_stay');

    // date and checkIn/checkOut together must be rejected.
    const both = await request(app).get(
      `/api/v1/availability/${listingId}/units?date=2027-12-01&checkIn=2027-12-01&checkOut=2027-12-02`,
    );
    expect(both.status).toBe(422);
  });

  test('O: a client-injected price/amount field in a hold request is ignored — the server-computed price is what is actually charged', async () => {
    const listingId = await createListing(`Stay TamperedPrice ${Date.now()}`);
    const unitId = await registerUnit(listingId, {
      unitLabel: 'TamperedPrice Room',
      capacity: 1,
      basePriceAmount: 5000,
      basePriceCurrency: 'AMD',
    });

    const res = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2027-12-10',
            dateTo: '2027-12-11',
            quantity: 1,
            // Not a real field on the schema — must be silently stripped,
            // never honored.
            price: 1,
            amount: 1,
            totalAmount: '1.00',
          },
        ],
      });
    const holdIds = res.body.data.items[0].hold_ids;
    const booking = await createBookingFromHold(holdIds);
    // The real base price (5000), never the tampered "1".
    expect(booking.total_amount).toBe('5000.00');
  });
});

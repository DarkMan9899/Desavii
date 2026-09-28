/**
 * Marketplace Product Completeness Sprint B (Car Rental Pickup/Return
 * Interval) — `POST /booking-holds` for a VEHICLE unit: real pickup/
 * return time persistence + validation, and the full overlap matrix the
 * Sprint B brief requires (A-J). The underlying capacity engine is
 * deliberately UNCHANGED from Sprint 10/Phase 17 — still day-granularity,
 * still `resolveConsumedRange`'s existing inclusive-of-return-day rule
 * for VEHICLE (`accommodationDateSemantics.js`) — this suite proves that
 * existing, already-correct engine also protects the new pickup/return-
 * time-aware flow, not that its granularity changed.
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

let vendor;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function createCarRentalListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'CAR_RENTAL',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function registerVehicleUnit(listingId, label, capacity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      listingId,
      bookableUnitType: 'VEHICLE',
      unitLabel: label,
      capacity,
    });
  return res.body.data.id;
}

function createHold(unitId, dateFrom, dateTo, startTime, endTime) {
  return request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, startTime, endTime }],
    });
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
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /booking-holds — Car Rental pickup/return time persistence + validation', () => {
  test('a VEHICLE hold persists and echoes the real pickup/return time', async () => {
    const listingId = await createCarRentalListing(
      `Rental Time Test ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Toyota RAV4');

    const res = await createHold(
      unitId,
      '2027-09-10',
      '2027-09-12',
      '10:00',
      '18:00',
    );

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].start_time).toBe('10:00');
    expect(res.body.data.items[0].end_time).toBe('18:00');
  });

  test('rejects a same-day rental whose return time is not after the pickup time (422)', async () => {
    const listingId = await createCarRentalListing(
      `Rental Invalid Interval Test ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Hyundai Tucson');

    const res = await createHold(
      unitId,
      '2027-09-15',
      '2027-09-15',
      '18:00',
      '09:00',
    );

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'RETURN_NOT_AFTER_PICKUP'),
    ).toBe(true);
  });

  test('rejects a zero-duration rental (identical pickup and return datetime) with 422', async () => {
    const listingId = await createCarRentalListing(
      `Rental Zero Duration Test ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Nissan X-Trail');

    const res = await createHold(
      unitId,
      '2027-09-16',
      '2027-09-16',
      '10:00',
      '10:00',
    );

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'RETURN_NOT_AFTER_PICKUP'),
    ).toBe(true);
  });

  test('a malformed time string is rejected at the schema layer (422 VALIDATION_FAILED)', async () => {
    const listingId = await createCarRentalListing(
      `Rental Malformed Time Test ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Kia Sportage');

    const res = await createHold(
      unitId,
      '2027-09-17',
      '2027-09-18',
      'not-a-time',
      '10:00',
    );

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('a non-VEHICLE unit silently ignores any client-supplied time — never a way to set a Tour departure time via the hold payload', async () => {
    // Step L6.2B: a TOUR_DEPARTURE unit belongs to a TOUR listing — the
    // hold's time gate is keyed on the unit's own type.
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'TOUR',
        translations: [
          { languageId, title: `Non-Vehicle Time Ignored Test ${Date.now()}` },
        ],
      });
    const listingId = listingRes.body.data.id;
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'TOUR_DEPARTURE',
        capacity: 5,
      });
    const unitId = res.body.data.id;

    const holdRes = await createHold(
      unitId,
      '2027-09-20',
      '2027-09-20',
      '10:00',
      '18:00',
    );

    expect(holdRes.status).toBe(201);
    expect(holdRes.body.data.items[0].start_time).toBeNull();
    expect(holdRes.body.data.items[0].end_time).toBeNull();
  });
});

describe('POST /booking-holds — Car Rental overlap matrix (A-J)', () => {
  test('A. non-overlapping intervals on the same vehicle are both accepted', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap A ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle A1');

    const first = await createHold(
      unitId,
      '2027-10-01',
      '2027-10-03',
      '10:00',
      '10:00',
    );
    const second = await createHold(
      unitId,
      '2027-10-05',
      '2027-10-07',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  test('B. an exact duplicate interval on the same vehicle is rejected', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap B ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle B1');

    const first = await createHold(
      unitId,
      '2027-10-10',
      '2027-10-12',
      '10:00',
      '10:00',
    );
    const second = await createHold(
      unitId,
      '2027-10-10',
      '2027-10-12',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('AVAILABILITY_CONFLICT');
  });

  test('C. a request starting during an existing rental is rejected', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap C ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle C1');

    const first = await createHold(
      unitId,
      '2027-10-15',
      '2027-10-20',
      '10:00',
      '10:00',
    );
    // Starts on Oct 18, inside the existing Oct15-20 rental.
    const second = await createHold(
      unitId,
      '2027-10-18',
      '2027-10-22',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  test('D. a request ending during an existing rental is rejected', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap D ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle D1');

    const first = await createHold(
      unitId,
      '2027-10-25',
      '2027-10-30',
      '10:00',
      '10:00',
    );
    // Ends on Oct 27, inside the existing Oct25-30 rental.
    const second = await createHold(
      unitId,
      '2027-10-23',
      '2027-10-27',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  test('E. a request that fully contains an existing rental is rejected', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap E ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle E1');

    const first = await createHold(
      unitId,
      '2027-11-05',
      '2027-11-07',
      '10:00',
      '10:00',
    );
    const second = await createHold(
      unitId,
      '2027-11-01',
      '2027-11-12',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  test('F. a request fully contained by an existing rental is rejected', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap F ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle F1');

    const first = await createHold(
      unitId,
      '2027-11-15',
      '2027-11-25',
      '10:00',
      '10:00',
    );
    const second = await createHold(
      unitId,
      '2027-11-18',
      '2027-11-20',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  /**
   * G. boundary-touch: the existing engine treats VEHICLE ranges as
   * inclusive of the return day (`accommodationDateSemantics.js` —
   * "a rental billed by the calendar day, inclusive of the return day"),
   * so a new rental starting on the SAME calendar day an existing rental
   * returns is a genuine day-level conflict under the current,
   * deliberately-unchanged capacity engine. Documenting this explicitly
   * rather than silently relying on it: same-day turnover is NOT
   * supported yet (a known, already-audited P1, not a Sprint B
   * regression — see the Marketplace Product Completeness audit).
   */
  test('G. boundary-touch: a new rental starting the same day an existing one returns conflicts (same-day turnover is not supported by the current day-granularity engine)', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap G ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle G1');

    const first = await createHold(
      unitId,
      '2027-12-01',
      '2027-12-05',
      '10:00',
      '10:00',
    );
    // Pickup on Dec 5, the exact day the first rental returns.
    const second = await createHold(
      unitId,
      '2027-12-05',
      '2027-12-08',
      '14:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('AVAILABILITY_CONFLICT');
  });

  test('I. releasing a hold restores capacity, so a subsequent overlapping request then succeeds', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap I ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle I1');

    const first = await createHold(
      unitId,
      '2027-12-15',
      '2027-12-18',
      '10:00',
      '10:00',
    );
    expect(first.status).toBe(201);

    await request(app)
      .delete('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ holdIds: first.body.data.items[0].hold_ids });

    const second = await createHold(
      unitId,
      '2027-12-15',
      '2027-12-18',
      '10:00',
      '10:00',
    );
    expect(second.status).toBe(201);
  });

  // Step L6.2B: a Car Rental listing holds exactly one VEHICLE unit, so the
  // two vehicles live on two listings — the overlap check is still scoped
  // to the vehicle unit actually taken.
  test('J. a different vehicle unit can be rented for the exact same interval concurrently', async () => {
    const listingA = await createCarRentalListing(
      `Rental Overlap J-A ${Date.now()}`,
    );
    const listingB = await createCarRentalListing(
      `Rental Overlap J-B ${Date.now()}`,
    );
    const unitA = await registerVehicleUnit(listingA, 'Vehicle J-A');
    const unitB = await registerVehicleUnit(listingB, 'Vehicle J-B');

    const first = await createHold(
      unitA,
      '2027-12-20',
      '2027-12-23',
      '10:00',
      '10:00',
    );
    const second = await createHold(
      unitB,
      '2027-12-20',
      '2027-12-23',
      '10:00',
      '10:00',
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  test('H. two simultaneous requests for the same overlapping interval — exactly one succeeds, no double booking', async () => {
    const listingId = await createCarRentalListing(
      `Rental Overlap H ${Date.now()}`,
    );
    const unitId = await registerVehicleUnit(listingId, 'Vehicle H1');

    const [first, second] = await Promise.all([
      createHold(unitId, '2028-01-05', '2028-01-08', '10:00', '10:00'),
      createHold(unitId, '2028-01-05', '2028-01-08', '10:00', '10:00'),
    ]);
    const statuses = [first.status, second.status].sort();

    expect(statuses).toEqual([201, 409]);
  });
});

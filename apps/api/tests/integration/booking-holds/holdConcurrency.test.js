/**
 * Step L6.2H4 — one hold, exactly one winner.
 *
 * Booking conversion, customer release and the expiry sweep all act on a
 * hold only after row-locking it (`SELECT … FOR UPDATE` on their own
 * transaction connection) and require every locked row to be deleted. These
 * tests make the races deterministic with a barrier: a separate connection
 * locks the hold rows first, the competing requests are started, the test
 * waits (no sleeps) until MySQL's processlist shows them queued on those
 * rows, and only then releases the barrier.
 *
 * Invariants checked every time: one booking at most, the held capacity
 * consumed exactly once (never restored under a booking, never consumed
 * twice), no negative availability.
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
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { sweepExpiredHolds } from '../../../src/modules/booking-holds/jobs/holdExpirySweep.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const CAPACITY = 5;
const HELD = 2;
// Upper bound on processlist polls while waiting for queued requests — a
// guard against a hung test, not a timing assumption.
const MAX_BARRIER_POLLS = 2000;

let pool;
let vendor;
let customer;
let unitId;
let listingId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(who) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send(DEV_CREDENTIALS[who]);
  return res.body.data.access_token;
}

async function hold(date) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [
        {
          bookableUnitId: unitId,
          dateFrom: date,
          dateTo: date,
          quantity: HELD,
        },
      ],
    });
  expect(res.status).toBe(201);
  return rememberHoldQuotes(res).body.data.items[0].hold_ids;
}

function book(holdIds) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({
      items: [quotedItem(holdIds)],
      guestContactSnapshot: GUEST_CONTACT,
    });
}

function release(holdIds) {
  return request(app)
    .delete('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ holdIds });
}

/** A transaction holding the row locks on `holdIds` until `open()`. */
async function lockHolds(holdIds) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  await connection.query(
    `SELECT id FROM reservation_holds WHERE id IN (${holdIds.map(() => '?').join(', ')}) FOR UPDATE`,
    holdIds,
  );
  return {
    connection,
    async open() {
      await connection.commit();
      connection.release();
    },
  };
}

/** Polls until `count` requests are queued on the hold-row lock. */
async function waitForQueuedHoldLocks(count) {
  for (let poll = 0; poll < MAX_BARRIER_POLLS; poll += 1) {
    // eslint-disable-next-line no-await-in-loop -- each poll must observe the previous one's state.
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS queued FROM information_schema.PROCESSLIST
       WHERE INFO LIKE 'SELECT * FROM reservation_holds%FOR UPDATE'`,
    );
    if (row.queued >= count) return;
  }
  throw new Error(`Fewer than ${count} requests queued on the hold rows.`);
}

async function placesLeft(date) {
  const [[row]] = await pool.query(
    'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
    [unitId, date],
  );
  return row.quantity_available;
}

async function bookedOn(date) {
  const [[row]] = await pool.query(
    `SELECT COUNT(DISTINCT booking_id) AS bookings, COUNT(*) AS items,
            COALESCE(SUM(quantity), 0) AS seats
     FROM booking_items WHERE bookable_unit_id = ? AND date_from = ?`,
    [unitId, date],
  );
  return { bookings: row.bookings, items: row.items, seats: Number(row.seats) };
}

async function ledgerDeltas(date) {
  const [rows] = await pool.query(
    'SELECT delta FROM inventory_ledger WHERE bookable_unit_id = ? AND date = ? ORDER BY id',
    [unitId, date],
  );
  return rows.map((row) => row.delta);
}

async function holdRows(holdIds) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total FROM reservation_holds WHERE id IN (${holdIds.map(() => '?').join(', ')})`,
    holdIds,
  );
  return row.total;
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  const admin = await login('admin');
  vendor = await login('vendor');
  customer = await login('customer');
  const [[partner]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  const [[category]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'tours'",
  );
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId: partner.id,
      listingType: 'TOUR',
      categoryIds: [category.id],
      translations: [
        { languageId: language.id, title: `L6.2H4 race ${Date.now()}` },
      ],
      pricing: { modelCode: 'PER_PERSON', amount: 8000, currencyCode: 'AMD' },
    });
  listingId = listingRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      policyValues: [{ code: 'cancellation_policy', value: 'FLEXIBLE' }],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const unitRes = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: CAPACITY,
    });
  unitId = unitRes.body.data.id;
  const published = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  expect(published.status).toBe(200);
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('duplicate booking submissions of one hold', () => {
  test('two simultaneous POST /bookings: exactly one booking, one capacity consumption', async () => {
    const date = day(9);
    const holdIds = await hold(date);
    const barrier = await lockHolds(holdIds);
    const racing = [book(holdIds), book(holdIds)].map((req) =>
      req.then((res) => res),
    );
    await waitForQueuedHoldLocks(2);
    await barrier.open();
    const results = await Promise.all(racing);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const loser = results.find((res) => res.status === 409);
    expect(loser.body.error.code).toBe('HOLD_EXPIRED');
    expect(await bookedOn(date)).toEqual({
      bookings: 1,
      items: 1,
      seats: HELD,
    });
    expect(await placesLeft(date)).toBe(CAPACITY - HELD);
    expect(await ledgerDeltas(date)).toEqual([-HELD]);
    expect(await holdRows(holdIds)).toBe(0);
  });

  test('a sequential resubmission of a converted hold is HOLD_EXPIRED', async () => {
    const date = day(10);
    const holdIds = await hold(date);
    expect((await book(holdIds)).status).toBe(201);

    const again = await book(holdIds);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('HOLD_EXPIRED');
    expect(await bookedOn(date)).toEqual({
      bookings: 1,
      items: 1,
      seats: HELD,
    });
    expect(await placesLeft(date)).toBe(CAPACITY - HELD);
  });
});

describe('release vs booking of one hold', () => {
  test('simultaneous release and booking serialize: exactly one wins and the state matches it', async () => {
    const date = day(11);
    const holdIds = await hold(date);
    const barrier = await lockHolds(holdIds);
    const bookingReq = book(holdIds).then((res) => res);
    const releaseReq = release(holdIds).then((res) => res);
    await waitForQueuedHoldLocks(2);
    await barrier.open();
    const [booked, released] = await Promise.all([bookingReq, releaseReq]);

    const bookingWon = booked.status === 201;
    expect(bookingWon).toBe(released.status === 409);
    const loser = bookingWon ? released : booked;
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe('HOLD_EXPIRED');
    expect(await holdRows(holdIds)).toBe(0);
    if (bookingWon) {
      expect(await bookedOn(date)).toEqual({
        bookings: 1,
        items: 1,
        seats: HELD,
      });
      expect(await placesLeft(date)).toBe(CAPACITY - HELD);
      expect(await ledgerDeltas(date)).toEqual([-HELD]);
    } else {
      expect(await bookedOn(date)).toEqual({ bookings: 0, items: 0, seats: 0 });
      expect(await placesLeft(date)).toBe(CAPACITY);
      expect(await ledgerDeltas(date)).toEqual([-HELD, HELD]);
    }
  });

  test('booking first: the later release fails safely and capacity stays consumed', async () => {
    const date = day(12);
    const holdIds = await hold(date);
    expect((await book(holdIds)).status).toBe(201);

    const released = await release(holdIds);

    expect(released.status).toBe(409);
    expect(released.body.error.code).toBe('HOLD_EXPIRED');
    expect(await placesLeft(date)).toBe(CAPACITY - HELD);
    expect(await ledgerDeltas(date)).toEqual([-HELD]);
  });

  test('release first: the later booking fails safely and capacity is restored once', async () => {
    const date = day(13);
    const holdIds = await hold(date);
    expect((await release(holdIds)).status).toBeLessThan(300);

    const booked = await book(holdIds);

    expect(booked.status).toBe(409);
    expect(booked.body.error.code).toBe('HOLD_EXPIRED');
    expect(await bookedOn(date)).toEqual({ bookings: 0, items: 0, seats: 0 });
    expect(await placesLeft(date)).toBe(CAPACITY);
    expect(await ledgerDeltas(date)).toEqual([-HELD, HELD]);
  });
});

describe('expiry sweep vs an in-flight conversion', () => {
  test('the sweep skips hold rows another transaction has locked, never restoring them twice', async () => {
    const date = day(14);
    const holdIds = await hold(date);
    await pool.query(
      `UPDATE reservation_holds SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
       WHERE id IN (${holdIds.map(() => '?').join(', ')})`,
      holdIds,
    );
    // Stands in for a conversion that locked the rows just before expiry.
    const inFlight = await lockHolds(holdIds);

    await sweepExpiredHolds(services.availabilityService);

    expect(await placesLeft(date)).toBe(CAPACITY - HELD);
    await inFlight.connection.query(
      `DELETE FROM reservation_holds WHERE id IN (${holdIds.map(() => '?').join(', ')})`,
      holdIds,
    );
    await inFlight.open();
    await sweepExpiredHolds(services.availabilityService);
    expect(await placesLeft(date)).toBe(CAPACITY - HELD);
    expect(await ledgerDeltas(date)).toEqual([-HELD]);
  });
});

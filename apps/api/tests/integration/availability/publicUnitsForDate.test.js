/**
 * Marketplace Product Completeness Sprint A (Time-Aware Booking
 * Foundation) — `GET /availability/:listingId/units?date=`, the minimal
 * extension `availabilityService.js#getPublicUnits` adds so the public
 * Tour/Attraction time-slot picker can learn, for the one date a customer
 * already picked, which sibling departure/session units actually have
 * capacity — before the customer commits to a specific time.
 *
 * Mirrors `availabilityDayStatus.test.js`'s fixture style (two
 * TOUR_DEPARTURE units standing in for two daily departures, one fully
 * blocked on the test date) plus `bookingCreation.test.js`'s `setPrice`
 * helper, since this endpoint resolves both availability and price.
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
let admin;
let vendor;
let partnerId;
let languageId;

let listingId;
let morningUnitId;
let afternoonUnitId;
let draftListingId;

const THE_DATE = '2027-04-10';
const OTHER_DATE = '2027-04-11';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function createListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'TOUR',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function registerTimeSlotUnit(targetListingId, label, start, end) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      listingId: targetListingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      unitLabel: label,
      capacity: 10,
      timeSlotStart: start,
      timeSlotEnd: end,
    });
  return res.body.data.id;
}

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
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );

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

  listingId = await createListing(`Public Units For Date ${Date.now()}`);
  morningUnitId = await registerTimeSlotUnit(
    listingId,
    '09:00 Departure',
    '09:00',
    '11:30',
  );
  afternoonUnitId = await registerTimeSlotUnit(
    listingId,
    '14:00 Departure',
    '14:00',
    '16:30',
  );
  await publishListing(listingId);

  // The morning departure is fully booked out on THE_DATE only — the
  // afternoon departure, and every other date, stay open.
  await request(app)
    .post('/api/v1/availability/blocks')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: morningUnitId,
      dateFrom: THE_DATE,
      dateTo: THE_DATE,
      quantity: 10,
      reasonCode: 'MAINTENANCE',
    });
  // A date-specific price override for the afternoon departure only.
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: afternoonUnitId,
      dateFrom: THE_DATE,
      dateTo: THE_DATE,
      status: 'AVAILABLE',
      priceOverrideAmount: 12_000,
      priceOverrideCurrency: 'AMD',
    });

  draftListingId = await createListing(`Public Units Draft ${Date.now()}`);
  await registerTimeSlotUnit(
    draftListingId,
    '09:00 Departure',
    '09:00',
    undefined,
  );
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /availability/:listingId/units', () => {
  test('omitting ?date= returns the exact same shape as before — fully backward compatible for every existing caller', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units`,
    );
    expect(res.status).toBe(200);
    const morning = res.body.data.find((unit) => unit.id === morningUnitId);
    expect(morning).not.toHaveProperty('availability_status_for_date');
    expect(morning).not.toHaveProperty('remaining_count_for_date');
    expect(morning).not.toHaveProperty('price_amount_for_date');
    expect(morning).not.toHaveProperty('price_currency_for_date');
    expect(morning.time_slot_start).toBe('09:00');
    expect(morning.time_slot_end).toBe('11:30');
  });

  test('?date= augments each sibling unit with a real, per-unit availability status for that one date', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units?date=${THE_DATE}`,
    );
    expect(res.status).toBe(200);

    const morning = res.body.data.find((unit) => unit.id === morningUnitId);
    const afternoon = res.body.data.find((unit) => unit.id === afternoonUnitId);

    // Fully blocked on THE_DATE — sold out, not merely "low".
    expect(morning.availability_status_for_date).toBe('SOLD_OUT');
    expect(morning.remaining_count_for_date).toBe(0);

    // Untouched capacity of 10 (above LOW_STOCK_THRESHOLD=5) resolves to
    // a plain AVAILABLE status with no raw count leaked — same
    // customer-safe bucketing as every other public availability read.
    expect(afternoon.availability_status_for_date).toBe('AVAILABLE');
    expect(afternoon.remaining_count_for_date).toBeNull();
    // The date-specific override price set above, not the unit's own
    // (unset) base price or any listing-level fallback.
    expect(afternoon.price_amount_for_date).toBe('12000.00');
    expect(afternoon.price_currency_for_date).toBe('AMD');
  });

  test('a different date is unaffected by a block/override scoped to THE_DATE only', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units?date=${OTHER_DATE}`,
    );
    expect(res.status).toBe(200);

    const morning = res.body.data.find((unit) => unit.id === morningUnitId);
    const afternoon = res.body.data.find((unit) => unit.id === afternoonUnitId);
    expect(morning.availability_status_for_date).toBe('AVAILABLE');
    expect(afternoon.price_amount_for_date).toBeNull();
  });

  test('a draft listing 404s for an anonymous caller with ?date= too (same masking as every other public availability read)', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${draftListingId}/units?date=${THE_DATE}`,
    );
    expect(res.status).toBe(404);
  });

  test('a malformed date is rejected with 422', async () => {
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units?date=not-a-date`,
    );
    expect(res.status).toBe(422);
  });
});

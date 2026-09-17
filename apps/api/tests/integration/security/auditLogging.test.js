/**
 * Phase 11 pre-flight verification: `bookingService`/`availabilityService`
 * previously wrote no audit_logs rows at all despite performing
 * state-changing actions (booking status transitions, bookable-unit
 * registration, calendar writes) — both services now accept an
 * `auditLogger` and call it at the exact points `listingService.js`
 * already established the convention for. This test proves rows are
 * actually written for a bookable-unit registration and a full
 * create -> confirm booking flow, not just that the code compiles.
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
  return { accessToken: res.body.data.access_token };
}

async function latestAuditRow(action, targetType) {
  const pool = getMysqlPool();
  const [rows] = await pool.query(
    `SELECT actor_id, target_id, after_snapshot FROM audit_logs
     WHERE action = ? AND target_type = ? ORDER BY id DESC LIMIT 1`,
    [action, targetType],
  );
  return rows[0];
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

describe('Audit logging: availability + bookings', () => {
  test('POST /availability/units writes a bookable_unit.registered audit row', async () => {
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [{ languageId, title: `Audit Log Test ${Date.now()}` }],
      });
    const listingId = listingRes.body.data.id;

    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 2 });
    expect(unitRes.status).toBe(201);
    const unitId = unitRes.body.data.id;

    const auditRow = await latestAuditRow(
      'bookable_unit.registered',
      'bookable_unit',
    );
    expect(auditRow).toBeDefined();
    expect(auditRow.target_id).toBe(unitId);
  });

  test('confirming a booking writes both booking.created and booking.status_changed audit rows', async () => {
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Audit Log Booking Test ${Date.now()}` },
        ],
      });
    const listingId = listingRes.body.data.id;
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1772, longitude: 44.5035 } });

    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
    const unitId = unitRes.body.data.id;

    const ONE_PX_PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

    const dateFrom = '2027-03-01';
    const dateTo = '2027-03-02';
    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom,
        dateTo,
        status: 'AVAILABLE',
        priceOverrideAmount: 10_000,
        priceOverrideCurrency: 'AMD',
      });

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    const holdIds = holdRes.body.data.items[0].hold_ids;

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [{ fullName: 'Ada Lovelace' }] }],
        guestContactSnapshot: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
          phone: '+37400000000',
        },
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;

    const createdAuditRow = await latestAuditRow('booking.created', 'booking');
    expect(createdAuditRow.target_id).toBe(bookingId);

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);

    const transitionAuditRow = await latestAuditRow(
      'booking.status_changed',
      'booking',
    );
    expect(transitionAuditRow.target_id).toBe(bookingId);
    // mysql2 returns a native JSON column already parsed, not a string.
    expect(transitionAuditRow.after_snapshot).toEqual({
      status: 'CONFIRMED',
    });
  });
});

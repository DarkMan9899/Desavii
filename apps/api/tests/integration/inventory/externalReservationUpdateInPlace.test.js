/**
 * Sprint D-1 (P0-4): `AvailabilityService#applySystemExternalReservation`
 * deduplicates a connector-synced event on `(connectionId,
 * externalEventUid)` — before this fix, finding an existing row for that
 * pair unconditionally short-circuited with `{created: false}` and
 * NEVER compared or updated it. An upstream reservation that kept its UID
 * but moved (dates shifted/extended/shortened, or its mapped unit
 * changed) would leave the OLD interval's nights consumed forever while
 * the NEW interval sold as if it had never been touched — a real
 * double-booking risk on every OTA that reuses a stable UID for an edited
 * reservation (Airbnb/VRBO/Booking.com all do).
 *
 * Uses the real `ICAL` connector against `config.fixtureIcs` — the same
 * no-network mechanism `inventorySyncConflictSafety.test.js` already
 * established as equivalent to a real `feedUrl` fetch for this connector.
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
let partnerId;
let languageId;

function toIcsDate(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildIcs(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0'];
  events.forEach(({ uid, from, to, summary }) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${toIcsDate(from)}`,
      `DTEND;VALUE=DATE:${toIcsDate(to)}`,
      `SUMMARY:${summary}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

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
      listingType: 'HOTEL',
      translations: [{ languageId, title }],
    });
  return res.body.data.id;
}

async function registerUnit(listingId, capacity = 1) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity });
  return res.body.data.id;
}

async function createIcalConnection(listingId, fixtureIcs) {
  const res = await request(app)
    .post('/api/v1/inventory-connections')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingId,
      connectorType: 'ICAL',
      direction: 'IMPORT',
      name: `P0-4 Update In Place Test ${Date.now()}`,
      config: { fixtureIcs },
    });
  return res.body.data;
}

async function setFixtureIcs(connectionId, fixtureIcs) {
  await request(app)
    .patch(`/api/v1/inventory-connections/${connectionId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ config: { fixtureIcs } });
}

async function mapDefault(connectionId, unitId) {
  await request(app)
    .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ externalResourceId: 'default', bookableUnitId: unitId });
}

async function sync(connectionId) {
  const res = await request(app)
    .post(`/api/v1/inventory-connections/${connectionId}/sync`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({});
  return res.body.data;
}

async function getCalendarEntry(listingId, unitId, date) {
  const res = await request(app)
    .get(`/api/v1/availability?listingId=${listingId}&from=${date}&to=${date}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
  return res.body.data.find((e) => e.bookable_unit_id === unitId);
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

describe('Sprint D-1 (P0-4) — external reservation update-in-place on a re-synced UID', () => {
  test('A) same UID, unchanged dates -> idempotent no-op', async () => {
    const anchor = new Date('2027-04-01T00:00:00.000Z');
    const from = addDays(anchor, 0);
    const to = addDays(anchor, 2);

    const listingId = await createListing(`P0-4 Idempotent ${Date.now()}`);
    const unitId = await registerUnit(listingId, 3);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([{ uid: 'STABLE-UID', from, to, summary: 'Stay' }]),
    );
    await mapDefault(connection.id, unitId);

    const firstRun = await sync(connection.id);
    expect(firstRun.status).toBe('SUCCESS');
    expect(firstRun.records_created).toBe(1);
    const afterFirst = await getCalendarEntry(
      listingId,
      unitId,
      toIsoDate(from),
    );

    const secondRun = await sync(connection.id);
    expect(secondRun.status).toBe('SUCCESS');
    expect(secondRun.records_created).toBe(0);
    expect(secondRun.records_updated).toBe(0);
    const afterSecond = await getCalendarEntry(
      listingId,
      unitId,
      toIsoDate(from),
    );
    expect(afterSecond.quantity_available).toBe(afterFirst.quantity_available);
  });

  test('B) same UID, dates extended -> newly-added nights are consumed', async () => {
    const anchor = new Date('2027-04-10T00:00:00.000Z');
    const from = addDays(anchor, 0);
    const originalTo = addDays(anchor, 2); // consumes night 0 only (checkout-exclusive)
    const extendedTo = addDays(anchor, 5); // consumes nights 0-4

    const listingId = await createListing(`P0-4 Extended ${Date.now()}`);
    const unitId = await registerUnit(listingId, 3);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([{ uid: 'MOVING-UID', from, to: originalTo, summary: 'Stay' }]),
    );
    await mapDefault(connection.id, unitId);
    await sync(connection.id);

    const newNightDate = toIsoDate(addDays(anchor, 3));
    const beforeExtend = await getCalendarEntry(
      listingId,
      unitId,
      newNightDate,
    );
    // Untouched by the first sync — still full capacity (no row yet, or a
    // fresh row at the unit's default capacity).
    expect(beforeExtend?.quantity_available ?? 3).toBe(3);

    await setFixtureIcs(
      connection.id,
      buildIcs([{ uid: 'MOVING-UID', from, to: extendedTo, summary: 'Stay' }]),
    );
    const secondRun = await sync(connection.id);
    expect(secondRun.status).toBe('SUCCESS');
    expect(secondRun.records_created).toBe(0);
    expect(secondRun.records_updated).toBe(1);

    const afterExtend = await getCalendarEntry(listingId, unitId, newNightDate);
    expect(afterExtend.quantity_available).toBe(2);

    // Exactly one row for this UID — updated in place, not duplicated.
    const [rows] = await pool.query(
      `SELECT id, date_from, date_to FROM external_reservations
       WHERE connection_id = ? AND external_event_uid = 'MOVING-UID' AND cancelled_at IS NULL`,
      [connection.id],
    );
    expect(rows).toHaveLength(1);
  });

  test('C) same UID, dates shortened -> released nights are restored', async () => {
    const anchor = new Date('2027-04-20T00:00:00.000Z');
    const from = addDays(anchor, 0);
    const longTo = addDays(anchor, 5); // consumes nights 0-4
    const shortTo = addDays(anchor, 2); // consumes night 0 only

    const listingId = await createListing(`P0-4 Shortened ${Date.now()}`);
    const unitId = await registerUnit(listingId, 3);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([{ uid: 'SHRINKING-UID', from, to: longTo, summary: 'Stay' }]),
    );
    await mapDefault(connection.id, unitId);
    await sync(connection.id);

    const releasedNightDate = toIsoDate(addDays(anchor, 3));
    const beforeShrink = await getCalendarEntry(
      listingId,
      unitId,
      releasedNightDate,
    );
    expect(beforeShrink.quantity_available).toBe(2);

    await setFixtureIcs(
      connection.id,
      buildIcs([{ uid: 'SHRINKING-UID', from, to: shortTo, summary: 'Stay' }]),
    );
    const secondRun = await sync(connection.id);
    expect(secondRun.status).toBe('SUCCESS');
    expect(secondRun.records_updated).toBe(1);

    const afterShrink = await getCalendarEntry(
      listingId,
      unitId,
      releasedNightDate,
    );
    expect(afterShrink.quantity_available).toBe(3);
  });

  test('D) same UID, dates shifted completely -> old interval restored, new interval consumed', async () => {
    const anchor = new Date('2027-05-01T00:00:00.000Z');
    const oldFrom = addDays(anchor, 0);
    const oldTo = addDays(anchor, 2);
    const newFrom = addDays(anchor, 20);
    const newTo = addDays(anchor, 22);

    const listingId = await createListing(`P0-4 Shifted ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([
        { uid: 'SHIFTING-UID', from: oldFrom, to: oldTo, summary: 'Stay' },
      ]),
    );
    await mapDefault(connection.id, unitId);
    await sync(connection.id);

    const oldNightDate = toIsoDate(oldFrom);
    expect(
      (await getCalendarEntry(listingId, unitId, oldNightDate))
        .quantity_available,
    ).toBe(1);

    await setFixtureIcs(
      connection.id,
      buildIcs([
        { uid: 'SHIFTING-UID', from: newFrom, to: newTo, summary: 'Stay' },
      ]),
    );
    const secondRun = await sync(connection.id);
    expect(secondRun.status).toBe('SUCCESS');
    expect(secondRun.records_updated).toBe(1);

    const oldAfter = await getCalendarEntry(listingId, unitId, oldNightDate);
    expect(oldAfter.quantity_available).toBe(2); // fully restored

    const newNightDate = toIsoDate(newFrom);
    const newAfter = await getCalendarEntry(listingId, unitId, newNightDate);
    expect(newAfter.quantity_available).toBe(1); // newly consumed
  });

  test('G) an update that would conflict with an existing Desavii hold fails safely and leaves the original reservation intact', async () => {
    const anchor = new Date('2027-05-15T00:00:00.000Z');
    const originalFrom = addDays(anchor, 0);
    const originalTo = addDays(anchor, 2);
    const conflictFrom = addDays(anchor, 10);
    const conflictTo = addDays(anchor, 12);

    const listingId = await createListing(
      `P0-4 Conflict Rollback ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId, 1);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([
        {
          uid: 'ROLLBACK-UID',
          from: originalFrom,
          to: originalTo,
          summary: 'Stay',
        },
      ]),
    );
    await mapDefault(connection.id, unitId);
    await sync(connection.id);

    // Occupy the target date via a real hold, so the update's new
    // interval has nowhere to go — capacity is 1 and it's already spoken
    // for.
    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: toIsoDate(conflictFrom),
            dateTo: toIsoDate(conflictFrom),
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);

    await setFixtureIcs(
      connection.id,
      buildIcs([
        {
          uid: 'ROLLBACK-UID',
          from: conflictFrom,
          to: conflictTo,
          summary: 'Stay',
        },
      ]),
    );
    const secondRun = await sync(connection.id);
    expect(secondRun.status).toBe('PARTIAL');
    expect(secondRun.conflicts_count).toBe(1);

    // The original reservation/dates must survive untouched — the
    // restore-then-consume sequence rolled back cleanly.
    const [[row]] = await pool.query(
      `SELECT DATE_FORMAT(date_from, '%Y-%m-%d') AS date_from,
              DATE_FORMAT(date_to, '%Y-%m-%d') AS date_to
       FROM external_reservations
       WHERE connection_id = ? AND external_event_uid = 'ROLLBACK-UID' AND cancelled_at IS NULL`,
      [connection.id],
    );
    expect(row.date_from).toBe(toIsoDate(originalFrom));

    const originalNight = await getCalendarEntry(
      listingId,
      unitId,
      toIsoDate(originalFrom),
    );
    expect(originalNight.quantity_available).toBe(0); // still consumed, not restored then lost
  });

  test('J) the ledger remains coherent after an update-in-place move', async () => {
    const anchor = new Date('2027-06-01T00:00:00.000Z');
    const from = addDays(anchor, 0);
    const originalTo = addDays(anchor, 2);
    const extendedTo = addDays(anchor, 4);

    const listingId = await createListing(`P0-4 Ledger ${Date.now()}`);
    const unitId = await registerUnit(listingId, 2);
    const connection = await createIcalConnection(
      listingId,
      buildIcs([{ uid: 'LEDGER-UID', from, to: originalTo, summary: 'Stay' }]),
    );
    await mapDefault(connection.id, unitId);
    await sync(connection.id);

    await setFixtureIcs(
      connection.id,
      buildIcs([{ uid: 'LEDGER-UID', from, to: extendedTo, summary: 'Stay' }]),
    );
    await sync(connection.id);

    const newNightDate = toIsoDate(addDays(anchor, 2));
    const ledgerRes = await request(app)
      .get(`/api/v1/availability/units/${unitId}/ledger`)
      .query({ from: newNightDate, to: newNightDate })
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(ledgerRes.status).toBe(200);
    const connectorEntries = ledgerRes.body.data.filter(
      (e) => e.source_type === 'CONNECTOR_SYNC',
    );
    expect(connectorEntries.length).toBeGreaterThan(0);

    const afterNight = await getCalendarEntry(listingId, unitId, newNightDate);
    expect(afterNight.quantity_available).toBe(1);
  });
});

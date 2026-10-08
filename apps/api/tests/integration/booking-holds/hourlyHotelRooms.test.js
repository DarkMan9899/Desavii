/**
 * Step L6.3B — optional hourly booking of a HOTEL_ROOM, through the API.
 *
 * - Hourly booking is a ROOM-level opt-in: a room without it stays
 *   nightly-only and refuses hourly holds; nightly stays never change.
 * - An hourly stay is one Asia/Yerevan date, whole hours, inside the room's
 *   window and min..max duration, starting in the future.
 * - Price = hourly rate × hours × rooms, in the rate's own currency; guests
 *   only validate occupancy.
 * - Inventory is time-overlap aware ([start, end) half-open): sequential
 *   stays reuse a room, overlapping ones add up, and nightly stays, blocks
 *   and hourly stays can never together exceed the room's capacity.
 * - Holds reserve timed capacity; release/expiry/cancellation give back
 *   exactly their own; races have exactly one winner (deterministic
 *   barriers, no sleeps); H4 PRICE_CHANGED protects the hourly quote.
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
// Upper bound on processlist polls while waiting for queued requests — a
// guard against a hung test, not a timing assumption.
const MAX_BARRIER_POLLS = 2000;
const HOURLY = {
  hourlyEnabled: true,
  hourlyPriceAmount: 8000,
  hourlyPriceCurrency: 'AMD',
  hourlyMinDurationHours: 2,
  hourlyMaxDurationHours: 6,
  hourlyAvailableFrom: '10:00',
  hourlyAvailableUntil: '20:00',
};

let pool;
let admin;
let vendor;
let customer;
let partnerId;
let languageId;
let today;
const day = (offset) => addIsoDays(today, offset);

async function login(who) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send(DEV_CREDENTIALS[who]);
  return res.body.data.access_token;
}

function registerUnit(body, token = vendor) {
  return request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

/** A second, approved Partner company (the `openingHours.test.js` fixture shape). */
async function registerApprovedOtherPartner() {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const registered = await request(app)
    .post('/api/v1/auth/register')
    .send({
      email: `other-vendor-hourly-${suffix}@example.com`,
      password: 'OtherVendor!2024',
      firstName: 'Other',
      lastName: 'Vendor',
    });
  const token = registered.body.data.access_token;
  const application = await request(app)
    .post('/api/v1/partners/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ displayName: `Cross-Partner Hourly Fixture ${suffix}` });
  const otherPartnerId = application.body.data.id;
  await request(app)
    .patch(`/api/v1/partners/applications/${otherPartnerId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      legalName: 'Cross-Partner Hourly Fixture LLC',
      email: 'contact@crosspartnerhourly.example',
      phone: '+37400000097',
      description: 'RBAC fixture partner — never used for real bookings.',
    });
  await request(app)
    .post(`/api/v1/partners/applications/${otherPartnerId}/submit`)
    .set('Authorization', `Bearer ${token}`);
  const approved = await request(app)
    .patch(`/api/v1/partners/admin/${otherPartnerId}/verification-status`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ status: 'APPROVED' });
  expect(approved.status).toBe(200);
  return token;
}

function patchUnit(unitId, body, token = vendor) {
  return request(app)
    .patch(`/api/v1/availability/units/${unitId}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function createListing(listingType) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `L6.3B ${listingType} ${Date.now()}` },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function publish(listingId, listingFields = {}) {
  const draft = await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      location: { latitude: 40.1772, longitude: 44.5035 },
      ...listingFields,
    });
  expect(draft.status).toBe(200);
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const res = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${admin}`)
    .send({ publicationPeriodDays: 90 });
  expect(res.status).toBe(200);
}

/**
 * A published hotel with one room per spec (each `{label, ...unit fields}`),
 * default capacity 3, max 2 guests, nightly base price 30,000 AMD.
 */
async function hotelWithRooms(specs, listingFields = {}) {
  const listingId = await createListing('HOTEL');
  const rooms = {};
  // eslint-disable-next-line no-restricted-syntax -- rooms are registered in a stable order
  for (const { label, ...fields } of specs) {
    // eslint-disable-next-line no-await-in-loop -- sequential by design
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      capacity: 3,
      maxGuests: 2,
      unitLabel: label,
      basePriceAmount: 30000,
      basePriceCurrency: 'AMD',
      ...fields,
    });
    expect(res.status).toBe(201);
    rooms[label] = res.body.data;
  }
  await publish(listingId, listingFields);
  return { listingId, rooms };
}

async function hourlyRoom(fields = {}, listingFields = {}) {
  const { listingId, rooms } = await hotelWithRooms(
    [{ label: 'Day Room', ...HOURLY, ...fields }],
    listingFields,
  );
  return { listingId, unit: rooms['Day Room'] };
}

function holdItem(unitId, date, start, end, quantity = 1, extra = {}) {
  return {
    bookableUnitId: unitId,
    dateFrom: date,
    dateTo: date,
    startTime: start,
    endTime: end,
    quantity,
    bookingMode: 'HOURLY',
    ...extra,
  };
}

async function hold(items, token = customer) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${token}`)
    .send({ items });
  return rememberHoldQuotes(res);
}

function book(items) {
  return request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer}`)
    .send({ items, guestContactSnapshot: GUEST_CONTACT });
}

function release(holdIds) {
  return request(app)
    .delete('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer}`)
    .send({ holdIds });
}

function expectIssue(res, field, issue) {
  expect(res.status).toBe(422);
  expect(res.body.error.details).toEqual(
    expect.arrayContaining([expect.objectContaining({ field, issue })]),
  );
}

function expectConflict(res, code) {
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe(code);
}

async function timedRows(unitId, date) {
  const [rows] = await pool.query(
    `SELECT start_time, end_time, quantity, source_type, reservation_hold_id,
            booking_item_id, released_at
     FROM hourly_inventory_reservations
     WHERE bookable_unit_id = ? AND date = ? ORDER BY id`,
    [unitId, date],
  );
  return rows;
}

async function activeTimedQuantity(unitId, date) {
  const rows = await timedRows(unitId, date);
  return rows
    .filter((row) => row.released_at === null)
    .reduce((sum, row) => sum + row.quantity, 0);
}

async function quantityAvailable(unitId, date) {
  const [[row]] = await pool.query(
    'SELECT quantity_available FROM availability_calendar WHERE bookable_unit_id = ? AND date = ?',
    [unitId, date],
  );
  return row?.quantity_available ?? null;
}

/** A transaction holding row locks until `open()` — a deterministic barrier. */
async function lockRows(sql, params) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  await connection.query(sql, params);
  return {
    async open() {
      await connection.commit();
      connection.release();
    },
  };
}

/** Polls until `count` statements matching `infoPattern` are queued. */
async function waitForQueued(infoPattern, count) {
  for (let poll = 0; poll < MAX_BARRIER_POLLS; poll += 1) {
    // eslint-disable-next-line no-await-in-loop -- each poll must observe the previous one's state.
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS queued FROM information_schema.PROCESSLIST
       WHERE INFO LIKE ?`,
      [infoPattern],
    );
    if (row.queued >= count) return;
  }
  throw new Error(`Fewer than ${count} statements queued on ${infoPattern}.`);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
  [admin, vendor, customer] = await Promise.all(
    ['admin', 'vendor', 'customer'].map(login),
  );
  const [[partner]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partner.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  today = (await businessNow(pool)).date;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('room-level opt-in and configuration', () => {
  test('a room is nightly-only by default; an enabled room keeps a full hourly configuration', async () => {
    const { listingId, rooms } = await hotelWithRooms([
      { label: 'Standard' },
      { label: 'Day Room', ...HOURLY },
    ]);
    expect(rooms.Standard).toMatchObject({
      hourly_enabled: false,
      hourly_price_amount: null,
    });
    expect(rooms['Day Room']).toMatchObject({
      hourly_enabled: true,
      hourly_price_amount: '8000.00',
      hourly_price_currency: 'AMD',
      hourly_min_duration_hours: 2,
      hourly_max_duration_hours: 6,
      hourly_available_from: '10:00',
      hourly_available_until: '20:00',
    });

    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units`,
    );
    const byLabel = Object.fromEntries(
      res.body.data.map((unit) => [unit.unit_label, unit]),
    );
    expect(byLabel.Standard.hourly_enabled).toBe(false);
    expect(byLabel['Day Room']).toMatchObject({
      hourly_enabled: true,
      hourly_price_amount: '8000.00',
    });
  });

  test.each([
    [
      { hourlyPriceAmount: undefined, hourlyPriceCurrency: undefined },
      'hourlyPriceAmount',
      'HOURLY_CONFIG_INCOMPLETE',
    ],
    [
      { hourlyMinDurationHours: undefined },
      'hourlyMinDurationHours',
      'HOURLY_CONFIG_INCOMPLETE',
    ],
    [
      { hourlyMinDurationHours: 5, hourlyMaxDurationHours: 3 },
      'hourlyMaxDurationHours',
      'HOURLY_DURATION_RANGE_INVALID',
    ],
    [
      { hourlyAvailableFrom: '20:00', hourlyAvailableUntil: '10:00' },
      'hourlyAvailableUntil',
      'HOURLY_WINDOW_INVALID',
    ],
    [
      { hourlyAvailableFrom: '10:00', hourlyAvailableUntil: '11:00' },
      'hourlyAvailableUntil',
      'HOURLY_WINDOW_INVALID',
    ],
  ])(
    'an incomplete or incoherent enabled configuration %p is rejected',
    async (override, field, issue) => {
      const listingId = await createListing('HOTEL');
      const res = await registerUnit({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        capacity: 2,
        unitLabel: `Bad ${Date.now()}`,
        ...HOURLY,
        ...override,
      });
      expectIssue(res, field, issue);
    },
  );

  test.each([
    [
      'a half-hour window start',
      { hourlyAvailableFrom: '10:30' },
      'hourlyAvailableFrom',
    ],
    [
      'a fractional duration',
      { hourlyMinDurationHours: 1.5 },
      'hourlyMinDurationHours',
    ],
    [
      'a string duration',
      { hourlyMaxDurationHours: '4' },
      'hourlyMaxDurationHours',
    ],
    ['a negative rate', { hourlyPriceAmount: -1 }, 'hourlyPriceAmount'],
    [
      'a rate without currency',
      { hourlyPriceCurrency: undefined },
      'hourlyPriceCurrency',
    ],
  ])('%s is malformed and never coerced', async (_label, override, field) => {
    const listingId = await createListing('HOTEL');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      capacity: 2,
      unitLabel: `Malformed ${Date.now()}`,
      ...HOURLY,
      ...override,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((detail) => detail.field)).toContain(
      `body.${field}`,
    );
  });

  test('an unknown hourly currency is rejected', async () => {
    const listingId = await createListing('HOTEL');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      capacity: 2,
      unitLabel: `Currency ${Date.now()}`,
      ...HOURLY,
      hourlyPriceCurrency: 'XYZ',
    });
    expectIssue(res, 'hourlyPriceCurrency', 'UNKNOWN_CURRENCY');
  });

  test.each([
    ['PROPERTY', 'PROPERTY_UNIT'],
    ['TOUR', 'TOUR_DEPARTURE'],
    ['RESTAURANT', 'RESTAURANT_TABLE'],
    ['CAR_RENTAL', 'VEHICLE'],
  ])(
    'hourly fields on a %s unit (%s) are not applicable',
    async (listingType, bookableUnitType) => {
      const listingId = await createListing(listingType);
      const res = await registerUnit({
        listingId,
        bookableUnitType,
        capacity: 2,
        hourlyEnabled: false,
      });
      expectIssue(res, 'hourlyEnabled', 'NOT_APPLICABLE_FOR_UNIT_TYPE');
    },
  );

  test('enabling later, disabling keeps the settings, and only the owner may edit them', async () => {
    const { rooms } = await hotelWithRooms([{ label: 'Later' }]);
    const unitId = rooms.Later.id;

    const enabled = await patchUnit(unitId, HOURLY);
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.hourly_enabled).toBe(true);

    const disabled = await patchUnit(unitId, { hourlyEnabled: false });
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toMatchObject({
      hourly_enabled: false,
      hourly_price_amount: '8000.00',
      hourly_available_from: '10:00',
    });

    expectIssue(
      await patchUnit(unitId, {
        hourlyEnabled: true,
        hourlyPriceAmount: null,
        hourlyPriceCurrency: null,
      }),
      'hourlyPriceAmount',
      'HOURLY_CONFIG_INCOMPLETE',
    );

    const foreign = await patchUnit(unitId, { hourlyEnabled: true }, customer);
    expect(foreign.status).toBe(403);
  });

  test('another company’s Partner cannot change a room’s hourly settings; an admin keeps its existing access', async () => {
    const { unit } = await hourlyRoom();
    const otherPartner = await registerApprovedOtherPartner();

    const crossTenant = await patchUnit(
      unit.id,
      { hourlyEnabled: false },
      otherPartner,
    );
    expect(crossTenant.status).toBe(403);
    const crossTenantRegister = await registerUnit(
      {
        listingId: unit.listing_id,
        bookableUnitType: 'HOTEL_ROOM',
        capacity: 1,
        ...HOURLY,
      },
      otherPartner,
    );
    expect(crossTenantRegister.status).toBe(403);

    const byAdmin = await patchUnit(
      unit.id,
      { hourlyMinDurationHours: 3 },
      admin,
    );
    expect(byAdmin.status).toBe(200);

    const [[stored]] = await pool.query(
      'SELECT hourly_enabled, hourly_min_duration_hours FROM bookable_units WHERE id = ?',
      [unit.id],
    );
    expect(stored).toEqual({
      hourly_enabled: 1,
      hourly_min_duration_hours: 3,
    });
  });
});

describe('the hourly booking contract', () => {
  test('a nightly-only room refuses an hourly hold and still books nightly exactly as before', async () => {
    const { rooms } = await hotelWithRooms([{ label: 'Standard' }]);
    const unitId = rooms.Standard.id;
    const date = day(12);

    expectIssue(
      await hold([holdItem(unitId, date, '14:00', '16:00')]),
      'items',
      'HOURLY_BOOKING_NOT_SUPPORTED',
    );

    const nightly = await hold([
      { bookableUnitId: unitId, dateFrom: date, dateTo: day(14), quantity: 1 },
    ]);
    expect(nightly.status).toBe(201);
    expect(nightly.body.data.items[0]).toMatchObject({
      booking_mode: 'NIGHTLY',
      quote: {
        unit_price_amount: '60000.00',
        total_amount: '60000.00',
        currency: 'AMD',
      },
    });
    const booked = await book([
      quotedItem(nightly.body.data.items[0].hold_ids, { guestCount: 2 }),
    ]);
    expect(booked.status).toBe(201);
    expect(booked.body.data.items[0]).toMatchObject({
      booking_mode: 'NIGHTLY',
      date_from: date,
      date_to: day(14),
      start_time: null,
    });
    expect(await quantityAvailable(unitId, date)).toBe(2);
  });

  test('a same-day nightly request on an hourly room is still a zero-night stay', async () => {
    const { unit } = await hourlyRoom();
    expectIssue(
      await hold([
        {
          bookableUnitId: unit.id,
          dateFrom: day(12),
          dateTo: day(12),
          quantity: 1,
        },
      ]),
      'items',
      'ZERO_NIGHT_STAY',
    );
  });

  test('hourly rate × hours × rooms, booked with its times, guests and mode — never touching the nightly date quantity', async () => {
    const { unit } = await hourlyRoom();
    const date = day(13);

    const held = await hold([holdItem(unit.id, date, '14:00', '18:00', 2)]);
    expect(held.status).toBe(201);
    const [item] = held.body.data.items;
    expect(item).toMatchObject({
      booking_mode: 'HOURLY',
      start_time: '14:00',
      end_time: '18:00',
      quantity: 2,
      quote: {
        unit_price_amount: '32000.00',
        total_amount: '64000.00',
        currency: 'AMD',
      },
    });
    expect(await activeTimedQuantity(unit.id, date)).toBe(2);
    expect(await quantityAvailable(unit.id, date)).toBe(3);

    const booked = await book([quotedItem(item.hold_ids, { guestCount: 4 })]);
    expect(booked.status).toBe(201);
    expect(booked.body.data).toMatchObject({
      total_amount: '64000.00',
      currency: 'AMD',
    });
    expect(booked.body.data.items[0]).toMatchObject({
      booking_mode: 'HOURLY',
      date_from: date,
      date_to: date,
      start_time: '14:00',
      end_time: '18:00',
      quantity: 2,
      guest_count: 4,
      unit_price_amount: '32000.00',
    });
    const rows = await timedRows(unit.id, date);
    expect(rows).toHaveLength(2);
    rows.forEach((row) => {
      expect(row.source_type).toBe('TRAVELHUB_BOOKING');
      expect(row.booking_item_id).toBe(booked.body.data.items[0].id);
      expect(row.released_at).toBeNull();
    });
    expect(await quantityAvailable(unit.id, date)).toBe(3);

    const forPartner = await request(app)
      .get(`/api/v1/bookings/${booked.body.data.id}`)
      .set('Authorization', `Bearer ${vendor}`);
    expect(forPartner.status).toBe(200);
    expect(forPartner.body.data.items[0]).toMatchObject({
      booking_mode: 'HOURLY',
      start_time: '14:00',
      end_time: '18:00',
    });
  });

  test('guests never change the price; more guests than the rooms sleep are refused', async () => {
    const { unit } = await hourlyRoom();
    const date = day(14);
    const first = await hold([holdItem(unit.id, date, '10:00', '12:00', 2)]);
    const tooMany = await book([
      quotedItem(first.body.data.items[0].hold_ids, { guestCount: 5 }),
    ]);
    expectIssue(tooMany, 'items', 'GUEST_CAPACITY_EXCEEDED');

    const fewGuests = await book([
      quotedItem(first.body.data.items[0].hold_ids, { guestCount: 1 }),
    ]);
    expect(fewGuests.status).toBe(201);
    expect(fewGuests.body.data.total_amount).toBe('32000.00');
  });

  test.each([
    ['a missing start time', { startTime: undefined }, 'HOURLY_TIME_INVALID'],
    ['a missing end time', { endTime: undefined }, 'HOURLY_TIME_INVALID'],
    [
      'an end before the start',
      { startTime: '16:00', endTime: '14:00' },
      'HOURLY_TIME_INVALID',
    ],
    [
      'a zero-length stay',
      { startTime: '14:00', endTime: '14:00' },
      'HOURLY_TIME_INVALID',
    ],
    [
      'a half-hour boundary',
      { startTime: '14:30', endTime: '16:30' },
      'HOURLY_TIME_INVALID',
    ],
    [
      'a stay below the minimum',
      { startTime: '14:00', endTime: '15:00' },
      'HOURLY_DURATION_OUT_OF_RANGE',
    ],
    [
      'a stay above the maximum',
      { startTime: '10:00', endTime: '17:00' },
      'HOURLY_DURATION_OUT_OF_RANGE',
    ],
    [
      'a stay starting before the window',
      { startTime: '09:00', endTime: '12:00' },
      'HOURLY_TIME_OUTSIDE_WINDOW',
    ],
    [
      'a stay ending after the window',
      { startTime: '19:00', endTime: '21:00' },
      'HOURLY_TIME_OUTSIDE_WINDOW',
    ],
  ])('%s is refused', async (_label, override, issue) => {
    const { unit } = await hourlyRoom();
    const date = day(15);
    expectIssue(
      await hold([holdItem(unit.id, date, '14:00', '16:00', 1, override)]),
      'items',
      issue,
    );
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);
  });

  test('the window edges themselves are bookable', async () => {
    const { unit } = await hourlyRoom();
    expect(
      (await hold([holdItem(unit.id, day(16), '10:00', '12:00')])).status,
    ).toBe(201);
    expect(
      (await hold([holdItem(unit.id, day(16), '18:00', '20:00')])).status,
    ).toBe(201);
  });

  test('a cross-midnight stay is refused — use a nightly stay instead', async () => {
    const { unit } = await hourlyRoom({
      hourlyAvailableFrom: '00:00',
      hourlyAvailableUntil: '24:00',
    });
    expectIssue(
      await hold([
        holdItem(unit.id, day(17), '22:00', '02:00', 1, { dateTo: day(18) }),
      ]),
      'items',
      'HOURLY_CROSS_MIDNIGHT_NOT_SUPPORTED',
    );
  });

  test('a stay that already started (yesterday) is refused by the server clock', async () => {
    const { unit } = await hourlyRoom({
      hourlyAvailableFrom: '00:00',
      hourlyAvailableUntil: '24:00',
    });
    expectIssue(
      await hold([holdItem(unit.id, day(-1), '14:00', '16:00')]),
      'items',
      'BOOKING_IN_PAST',
    );
  });

  test('advance rules govern hourly stays; nightly min/max nights do not', async () => {
    const { unit } = await hourlyRoom(
      {},
      { bookingRules: { minimumStayNights: 2, advanceBookingMaxDays: 30 } },
    );
    expect(
      (await hold([holdItem(unit.id, day(20), '10:00', '12:00')])).status,
    ).toBe(201);
    expectIssue(
      await hold([holdItem(unit.id, day(40), '10:00', '12:00')]),
      'items',
      'BOOKING_TOO_FAR_AHEAD',
    );
  });

  test('an hourly hold on a non-hotel unit type is refused', async () => {
    const listingId = await createListing('PROPERTY');
    const unit = await registerUnit({
      listingId,
      bookableUnitType: 'PROPERTY_UNIT',
      capacity: 1,
      basePriceAmount: 20000,
      basePriceCurrency: 'AMD',
    });
    await publish(listingId);
    expectIssue(
      await hold([holdItem(unit.body.data.id, day(12), '14:00', '16:00')]),
      'items',
      'HOURLY_BOOKING_NOT_SUPPORTED',
    );
  });
});

describe('time-overlap inventory', () => {
  test('half-open intervals: back-to-back stays reuse every room, an overlapping one does not fit', async () => {
    const { unit } = await hourlyRoom();
    const date = day(21);
    expect(
      (await hold([holdItem(unit.id, date, '10:00', '12:00', 3)])).status,
    ).toBe(201);
    expect(
      (await hold([holdItem(unit.id, date, '12:00', '14:00', 3)])).status,
    ).toBe(201);
    expectConflict(
      await hold([holdItem(unit.id, date, '11:00', '13:00', 1)]),
      'AVAILABILITY_CONFLICT',
    );
    expect(await quantityAvailable(unit.id, date)).toBe(3);
  });

  test('nightly occupancy + overlapping hourly stays never exceed the room count', async () => {
    const { unit } = await hourlyRoom();
    const date = day(22);
    const nightly = await hold([
      { bookableUnitId: unit.id, dateFrom: date, dateTo: day(23), quantity: 1 },
    ]);
    expect(nightly.status).toBe(201);

    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 1)])).status,
    ).toBe(201);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 1)])).status,
    ).toBe(201);
    expectConflict(
      await hold([holdItem(unit.id, date, '15:00', '17:00', 1)]),
      'AVAILABILITY_CONFLICT',
    );
    expect(
      (await hold([holdItem(unit.id, date, '18:00', '20:00', 2)])).status,
    ).toBe(201);
  });

  test('a new nightly stay cannot take rooms already committed to hourly stays', async () => {
    const { unit } = await hourlyRoom();
    const date = day(24);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 2)])).status,
    ).toBe(201);
    expectConflict(
      await hold([
        {
          bookableUnitId: unit.id,
          dateFrom: day(23),
          dateTo: day(25),
          quantity: 2,
        },
      ]),
      'AVAILABILITY_CONFLICT',
    );
    expect(
      (
        await hold([
          {
            bookableUnitId: unit.id,
            dateFrom: day(23),
            dateTo: day(25),
            quantity: 1,
          },
        ])
      ).status,
    ).toBe(201);
  });

  test('a blocked date and a full manual block make hourly stays unavailable', async () => {
    const { unit } = await hourlyRoom();
    const blockedDate = day(26);
    const blocked = await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId: unit.id,
        dateFrom: blockedDate,
        dateTo: blockedDate,
        status: 'BLOCKED',
      });
    expect(blocked.status).toBe(201);
    expectConflict(
      await hold([holdItem(unit.id, blockedDate, '14:00', '16:00')]),
      'BLACKOUT_DATE',
    );

    const fullDate = day(27);
    const manual = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId: unit.id,
        dateFrom: fullDate,
        dateTo: day(28),
        quantity: 3,
        reasonCode: 'MAINTENANCE',
      });
    expect(manual.status).toBe(201);
    expectConflict(
      await hold([holdItem(unit.id, fullDate, '14:00', '16:00')]),
      'AVAILABILITY_CONFLICT',
    );
  });

  test('a manual block cannot take rooms an hourly stay holds', async () => {
    const { unit } = await hourlyRoom();
    const date = day(29);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 2)])).status,
    ).toBe(201);
    const manual = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor}`)
      .send({
        unitId: unit.id,
        dateFrom: date,
        dateTo: day(30),
        quantity: 2,
        reasonCode: 'MAINTENANCE',
      });
    expectConflict(manual, 'AVAILABILITY_CONFLICT');
  });

  test('public reads reflect hourly commitments: hourly slots and the nightly stay preview', async () => {
    const { listingId, unit } = await hourlyRoom();
    const date = day(31);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 3)])).status,
    ).toBe(201);

    const slots = await request(app).get(
      `/api/v1/availability/${listingId}/units/${unit.id}/hourly-availability?date=${date}`,
    );
    expect(slots.status).toBe(200);
    const byStart = Object.fromEntries(
      slots.body.data.slots.map((slot) => [slot.start_time, slot]),
    );
    expect(Object.keys(byStart)).toHaveLength(10);
    expect(byStart['14:00'].status).toBe('SOLD_OUT');
    expect(byStart['15:00'].status).toBe('SOLD_OUT');
    expect(byStart['16:00']).toMatchObject({
      status: 'LOW',
      remaining_count: 3,
    });

    const stay = await request(app).get(
      `/api/v1/availability/${listingId}/units?checkIn=${date}&checkOut=${day(32)}`,
    );
    expect(stay.body.data[0].availability_status_for_stay).toBe('SOLD_OUT');
  });

  test('search and the availability badge never offer a night whose rooms hourly stays already hold', async () => {
    const { listingId, unit } = await hourlyRoom();
    const date = day(36);
    const listing = await request(app).get(`/api/v1/listings/${listingId}`);
    // The title's timestamp is a unique full-text token for this hotel.
    const keyword = listing.body.data.translations[0].title.split(' ').pop();
    const searchNight = () =>
      request(app).get(
        `/api/v1/search?keyword=${keyword}&dateFrom=${date}&dateTo=${day(37)}&guests=1`,
      );
    const badge = async () =>
      (
        await request(app).get(
          `/api/v1/availability/${listingId}/availability-summary?from=${date}&to=${date}`,
        )
      ).body.data[0];

    // Two of three rooms held 10:00–12:00, and a back-to-back 12:00–14:00
    // hold that never overlaps them: the busiest hour still leaves one.
    expect(
      (await hold([holdItem(unit.id, date, '10:00', '12:00', 2)])).status,
    ).toBe(201);
    expect(
      (await hold([holdItem(unit.id, date, '12:00', '14:00', 1)])).status,
    ).toBe(201);
    expect((await searchNight()).body.data.map((row) => row.id)).toContain(
      listingId,
    );
    expect(await badge()).toMatchObject({
      availability_status: 'LOW',
      remaining_count: 1,
    });

    // The last room overlapping 11:00 — that night has nothing free.
    expect(
      (await hold([holdItem(unit.id, date, '11:00', '13:00', 1)])).status,
    ).toBe(201);
    const search = await searchNight();
    expect(search.status).toBe(200);
    expect(search.body.data.map((row) => row.id)).not.toContain(listingId);
    expect((await badge()).availability_status).toBe('SOLD_OUT');
  });

  test('hourly availability of a nightly-only room is refused', async () => {
    const { listingId, rooms } = await hotelWithRooms([{ label: 'Standard' }]);
    const res = await request(app).get(
      `/api/v1/availability/${listingId}/units/${rooms.Standard.id}/hourly-availability?date=${day(12)}`,
    );
    expectIssue(res, 'unitId', 'HOURLY_BOOKING_NOT_SUPPORTED');
  });
});

describe('hold lifecycle', () => {
  test('release and expiry give back exactly their own timed rooms', async () => {
    const { unit } = await hourlyRoom();
    const date = day(33);
    const held = await hold([holdItem(unit.id, date, '10:00', '12:00', 3)]);
    expect((await release(held.body.data.items[0].hold_ids)).status).toBe(200);
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);

    const again = await hold([holdItem(unit.id, date, '10:00', '12:00', 3)]);
    expect(again.status).toBe(201);
    await pool.query(
      `UPDATE reservation_holds SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
       WHERE id IN (?)`,
      [again.body.data.items[0].hold_ids],
    );
    await sweepExpiredHolds(services.availabilityService);
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);
    expect(await quantityAvailable(unit.id, date)).toBe(3);
    expect(
      (await hold([holdItem(unit.id, date, '10:00', '12:00', 3)])).status,
    ).toBe(201);
  });

  test('a mixed nightly + hourly hold batch on one room releases and expires both', async () => {
    const { unit } = await hourlyRoom();
    const date = day(38);
    const mixedItems = [
      {
        bookableUnitId: unit.id,
        dateFrom: date,
        dateTo: day(39),
        quantity: 1,
      },
      holdItem(unit.id, date, '10:00', '12:00', 1),
    ];
    const allHoldIds = (res) =>
      res.body.data.items.flatMap((item) => item.hold_ids);

    const held = await hold(mixedItems);
    expect(held.status).toBe(201);
    expect(await quantityAvailable(unit.id, date)).toBe(2);
    expect(await activeTimedQuantity(unit.id, date)).toBe(1);
    expect((await release(allHoldIds(held))).status).toBe(200);
    expect(await quantityAvailable(unit.id, date)).toBe(3);
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);

    const again = await hold(mixedItems);
    expect(again.status).toBe(201);
    await pool.query(
      `UPDATE reservation_holds SET expires_at = UTC_TIMESTAMP(3) - INTERVAL 1 SECOND
       WHERE id IN (?)`,
      [allHoldIds(again)],
    );
    await sweepExpiredHolds(services.availabilityService);
    expect(await quantityAvailable(unit.id, date)).toBe(3);
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);
  });

  test('a rejected hourly booking frees its timed rooms', async () => {
    const { unit } = await hourlyRoom();
    const date = day(34);
    const held = await hold([holdItem(unit.id, date, '14:00', '16:00', 3)]);
    const booked = await book([quotedItem(held.body.data.items[0].hold_ids)]);
    expect(booked.status).toBe(201);
    const rejected = await request(app)
      .post(`/api/v1/bookings/${booked.body.data.id}/reject`)
      .set('Authorization', `Bearer ${vendor}`)
      .send({ reason: 'Closed for a private event.' });
    expect(rejected.status).toBe(200);
    expect(await activeTimedQuantity(unit.id, date)).toBe(0);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 3)])).status,
    ).toBe(201);
  });

  test('two simultaneous conversions of one hourly hold: exactly one booking owns the rooms', async () => {
    const { unit } = await hourlyRoom();
    const date = day(35);
    const held = await hold([holdItem(unit.id, date, '14:00', '16:00', 2)]);
    const holdIds = held.body.data.items[0].hold_ids;
    const barrier = await lockRows(
      'SELECT id FROM reservation_holds WHERE id IN (?) FOR UPDATE',
      [holdIds],
    );
    // Supertest requests start only once `.then` is called.
    const racing = [
      book([quotedItem(holdIds)]),
      book([quotedItem(holdIds)]),
    ].map((req) => req.then((res) => res));
    await waitForQueued('SELECT * FROM reservation_holds%FOR UPDATE', 2);
    await barrier.open();
    const results = await Promise.all(racing);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    const rows = await timedRows(unit.id, date);
    const winner = results.find((res) => res.status === 201).body.data;
    expect(rows.filter((row) => row.released_at === null)).toHaveLength(2);
    rows.forEach((row) => expect(row.booking_item_id).toBe(winner.items[0].id));
  });

  test('simultaneous release and booking: exactly one wins and the rooms match it', async () => {
    const { unit } = await hourlyRoom();
    const date = day(36);
    const held = await hold([holdItem(unit.id, date, '14:00', '16:00', 2)]);
    const holdIds = held.body.data.items[0].hold_ids;
    const barrier = await lockRows(
      'SELECT id FROM reservation_holds WHERE id IN (?) FOR UPDATE',
      [holdIds],
    );
    const bookingReq = book([quotedItem(holdIds)]).then((res) => res);
    const releaseReq = release(holdIds).then((res) => res);
    await waitForQueued('SELECT * FROM reservation_holds%FOR UPDATE', 2);
    await barrier.open();
    const [booked, released] = await Promise.all([bookingReq, releaseReq]);
    const bookingWon = booked.status === 201;
    expect(bookingWon).toBe(released.status !== 200);
    expect(await activeTimedQuantity(unit.id, date)).toBe(bookingWon ? 2 : 0);
  });

  test('two simultaneous holds for the last overlapping room: exactly one wins', async () => {
    const { unit } = await hourlyRoom();
    const date = day(37);
    expect(
      (await hold([holdItem(unit.id, date, '14:00', '16:00', 2)])).status,
    ).toBe(201);
    const barrier = await lockRows(
      'SELECT id FROM availability_calendar WHERE bookable_unit_id = ? AND date = ? FOR UPDATE',
      [unit.id, date],
    );
    const racing = [
      hold([holdItem(unit.id, date, '15:00', '17:00', 1)]),
      hold([holdItem(unit.id, date, '14:00', '16:00', 1)]),
    ];
    await waitForQueued('INSERT INTO availability_calendar%', 2);
    await barrier.open();
    const results = await Promise.all(racing);
    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await activeTimedQuantity(unit.id, date)).toBe(3);
  });
});

describe('hourly price integrity (H4)', () => {
  test.each([
    ['an increase', 9000, '18000.00'],
    ['a decrease', 7000, '14000.00'],
  ])(
    '%s during the hold is PRICE_CHANGED; accepting the new quote books it',
    async (_label, newRate, newTotal) => {
      const { unit } = await hourlyRoom();
      const date = day(38);
      const held = await hold([holdItem(unit.id, date, '14:00', '16:00')]);
      const holdIds = held.body.data.items[0].hold_ids;
      expect(
        (
          await patchUnit(unit.id, {
            hourlyPriceAmount: newRate,
            hourlyPriceCurrency: 'AMD',
          })
        ).status,
      ).toBe(200);

      const stale = await book([quotedItem(holdIds)]);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('PRICE_CHANGED');
      expect(stale.body.error.details).toEqual([
        {
          field: 'items.0',
          issue: 'PRICE_CHANGED',
          unit_price_amount: newTotal,
          total_amount: newTotal,
          currency: 'AMD',
        },
      ]);
      expect(await activeTimedQuantity(unit.id, date)).toBe(1);

      const accepted = await book([
        { holdIds, expectedTotalAmount: newTotal, expectedCurrency: 'AMD' },
      ]);
      expect(accepted.status).toBe(201);
      expect(accepted.body.data.total_amount).toBe(newTotal);
    },
  );

  test.each([
    ['a tampered lower amount', { expectedTotalAmount: '1.00' }],
    ['a tampered higher amount', { expectedTotalAmount: '99999.00' }],
    ['a different valid currency', { expectedCurrency: 'USD' }],
  ])('%s never books', async (_label, override) => {
    const { unit } = await hourlyRoom();
    const held = await hold([holdItem(unit.id, day(39), '14:00', '16:00')]);
    const res = await book([
      { ...quotedItem(held.body.data.items[0].hold_ids), ...override },
    ]);
    expectConflict(res, 'PRICE_CHANGED');
  });

  test('nightly and hourly prices are separate, and history keeps the accepted price', async () => {
    const { unit } = await hourlyRoom();
    const date = day(41);
    const held = await hold([holdItem(unit.id, date, '14:00', '16:00')]);
    const booked = await book([quotedItem(held.body.data.items[0].hold_ids)]);
    expect(booked.body.data.total_amount).toBe('16000.00');

    expect(
      (
        await patchUnit(unit.id, {
          basePriceAmount: 45000,
          basePriceCurrency: 'AMD',
        })
      ).status,
    ).toBe(200);
    const hourlyAfterNightlyEdit = await hold([
      holdItem(unit.id, day(42), '14:00', '16:00'),
    ]);
    expect(hourlyAfterNightlyEdit.body.data.items[0].quote.total_amount).toBe(
      '16000.00',
    );

    expect(
      (
        await patchUnit(unit.id, {
          hourlyPriceAmount: 9500,
          hourlyPriceCurrency: 'AMD',
        })
      ).status,
    ).toBe(200);
    const nightlyAfterHourlyEdit = await hold([
      {
        bookableUnitId: unit.id,
        dateFrom: day(43),
        dateTo: day(44),
        quantity: 1,
      },
    ]);
    expect(nightlyAfterHourlyEdit.body.data.items[0].quote.total_amount).toBe(
      '45000.00',
    );

    const history = await request(app)
      .get(`/api/v1/bookings/${booked.body.data.id}`)
      .set('Authorization', `Bearer ${customer}`);
    expect(history.body.data.total_amount).toBe('16000.00');
    expect(history.body.data.items[0].unit_price_amount).toBe('16000.00');
  });

  test('a non-AMD hourly rate quotes and books in its own currency', async () => {
    const { unit } = await hourlyRoom({
      hourlyPriceAmount: 12.35,
      hourlyPriceCurrency: 'USD',
    });
    const held = await hold([holdItem(unit.id, day(45), '14:00', '17:00', 2)]);
    expect(held.body.data.items[0].quote).toEqual({
      unit_price_amount: '37.05',
      total_amount: '74.10',
      currency: 'USD',
    });
    const booked = await book([quotedItem(held.body.data.items[0].hold_ids)]);
    expect(booked.status).toBe(201);
    expect(booked.body.data).toMatchObject({
      total_amount: '74.10',
      currency: 'USD',
    });
  });
});

describe('changing a room’s hourly settings', () => {
  test('disabling stops new hourly holds; an active hold still converts and history stays readable', async () => {
    const { unit } = await hourlyRoom();
    const date = day(46);
    const active = await hold([holdItem(unit.id, date, '14:00', '16:00')]);
    expect((await patchUnit(unit.id, { hourlyEnabled: false })).status).toBe(
      200,
    );

    expectIssue(
      await hold([holdItem(unit.id, date, '16:00', '18:00')]),
      'items',
      'HOURLY_BOOKING_NOT_SUPPORTED',
    );
    const booked = await book([quotedItem(active.body.data.items[0].hold_ids)]);
    expect(booked.status).toBe(201);
    expect(booked.body.data.items[0].booking_mode).toBe('HOURLY');
  });

  test('narrowing the window keeps a confirmed booking outside it; new holds follow the new window', async () => {
    const { unit } = await hourlyRoom();
    const date = day(47);
    const held = await hold([holdItem(unit.id, date, '18:00', '20:00')]);
    const booked = await book([quotedItem(held.body.data.items[0].hold_ids)]);
    expect(
      (
        await request(app)
          .post(`/api/v1/bookings/${booked.body.data.id}/confirm`)
          .set('Authorization', `Bearer ${vendor}`)
      ).status,
    ).toBe(200);

    expect(
      (await patchUnit(unit.id, { hourlyAvailableUntil: '17:00' })).status,
    ).toBe(200);
    const after = await request(app)
      .get(`/api/v1/bookings/${booked.body.data.id}`)
      .set('Authorization', `Bearer ${customer}`);
    expect(after.body.data.status).toBe('CONFIRMED');
    expect(after.body.data.items[0]).toMatchObject({
      start_time: '18:00',
      end_time: '20:00',
    });
    expect(await activeTimedQuantity(unit.id, date)).toBe(1);
    expectIssue(
      await hold([holdItem(unit.id, day(48), '16:00', '18:00')]),
      'items',
      'HOURLY_TIME_OUTSIDE_WINDOW',
    );
  });
});

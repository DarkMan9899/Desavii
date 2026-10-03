/**
 * Step L6.3A — hotel room details and decision information, through the API.
 *
 * - A HOTEL_ROOM carries a structured sleeping setup (`bedConfiguration`:
 *   one entry per bed type, integer 0..20, zeros dropped), including the
 *   separate child bed / baby crib / extra bed options, and a meal / board
 *   basis (`mealPlan`, a closed code set) next to size, bathroom, view and
 *   smoking.
 * - These are hotel-room-only: other unit types are rejected server-side.
 * - An omitted field keeps its value; an explicit `null` clears it.
 * - The public units DTO exposes the same data; other unit types serialize
 *   the room fields as `null`.
 * - A legacy room with none of it stays readable and bookable, and the meal
 *   basis never changes the nightly charge.
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
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const FULL_ROOM = {
  maxGuests: 4,
  bedConfiguration: [
    { type: 'SINGLE', count: 2 },
    { type: 'DOUBLE', count: 1 },
    { type: 'CHILD_BED', count: 1 },
    { type: 'CRIB', count: 0 },
  ],
  roomSizeSqm: 24.5,
  bathroomType: 'PRIVATE',
  viewType: 'MOUNTAIN',
  smokingPolicy: 'NON_SMOKING',
  mealPlan: 'BREAKFAST_INCLUDED',
};

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

async function createListing(listingType) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor}`)
    .send({
      partnerId,
      listingType,
      translations: [
        { languageId, title: `L6.3A ${listingType} ${Date.now()}` },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function publish(listingId) {
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
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

function registerUnit(body) {
  return request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor}`)
    .send(body);
}

function patchUnit(unitId, body) {
  return request(app)
    .patch(`/api/v1/availability/units/${unitId}`)
    .set('Authorization', `Bearer ${vendor}`)
    .send(body);
}

async function hotelRoom(extra = {}, label = `Room ${Date.now()}`) {
  const listingId = await createListing('HOTEL');
  const res = await registerUnit({
    listingId,
    bookableUnitType: 'HOTEL_ROOM',
    capacity: 3,
    unitLabel: label,
    basePriceAmount: 10000,
    basePriceCurrency: 'AMD',
    ...extra,
  });
  expect(res.status).toBe(201);
  return { listingId, unit: res.body.data };
}

function expectIssue(res, field, issue) {
  expect(res.status).toBe(422);
  expect(res.body.error.details).toEqual(
    expect.arrayContaining([expect.objectContaining({ field, issue })]),
  );
}

async function publicUnit(listingId, unitId) {
  const res = await request(app).get(`/api/v1/availability/${listingId}/units`);
  expect(res.status).toBe(200);
  return res.body.data.find((unit) => unit.id === unitId);
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  const pool = getMysqlPool();
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

describe('a hotel room describes its real sleeping setup and meals', () => {
  test('single, double and child beds, a crib at zero, size, bathroom, view, smoking and meals round-trip', async () => {
    const { listingId, unit } = await hotelRoom(FULL_ROOM);

    expect(unit).toMatchObject({
      max_guests: 4,
      bed_configuration: [
        { type: 'SINGLE', count: 2 },
        { type: 'DOUBLE', count: 1 },
        { type: 'CHILD_BED', count: 1 },
      ],
      room_size_sqm: '24.50',
      bathroom_type: 'PRIVATE',
      view_type: 'MOUNTAIN',
      smoking_policy: 'NON_SMOKING',
      meal_plan: 'BREAKFAST_INCLUDED',
    });

    await publish(listingId);
    const shown = await publicUnit(listingId, unit.id);
    expect(shown).toMatchObject({
      bed_configuration: unit.bed_configuration,
      meal_plan: 'BREAKFAST_INCLUDED',
      bathroom_type: 'PRIVATE',
      room_size_sqm: '24.50',
    });
    expect(shown).not.toHaveProperty('listing_id');
    expect(shown).not.toHaveProperty('created_at');
  });

  test.each([
    'NO_MEALS',
    'BREAKFAST_INCLUDED',
    'BREAKFAST_AVAILABLE_EXTRA',
    'HALF_BOARD',
    'FULL_BOARD',
    'ALL_INCLUSIVE',
  ])('meal basis %s is accepted', async (mealPlan) => {
    const { unit } = await hotelRoom({ mealPlan });
    expect(unit.meal_plan).toBe(mealPlan);
  });

  test('extra bed, child bed and crib are three distinct options', async () => {
    const { unit } = await hotelRoom({
      bedConfiguration: [
        { type: 'EXTRA_BED', count: 1 },
        { type: 'CHILD_BED', count: 2 },
        { type: 'CRIB', count: 1 },
        { type: 'SOFA_BED', count: 1 },
      ],
    });
    expect(unit.bed_configuration.map((row) => row.type)).toEqual([
      'EXTRA_BED',
      'CHILD_BED',
      'CRIB',
      'SOFA_BED',
    ]);
  });

  test('a setup with every count at zero is stored as no stated beds', async () => {
    const { unit } = await hotelRoom({
      bedConfiguration: [
        { type: 'SINGLE', count: 0 },
        { type: 'DOUBLE', count: 0 },
      ],
    });
    expect(unit.bed_configuration).toBeNull();
  });
});

describe('validation', () => {
  test.each([
    [
      'a negative count',
      [{ type: 'SINGLE', count: -1 }],
      'bedConfiguration.0.count',
    ],
    [
      'a fractional count',
      [{ type: 'SINGLE', count: 1.5 }],
      'bedConfiguration.0.count',
    ],
    [
      'a string count',
      [{ type: 'SINGLE', count: '2' }],
      'bedConfiguration.0.count',
    ],
    [
      'a huge count',
      [{ type: 'SINGLE', count: 21 }],
      'bedConfiguration.0.count',
    ],
    [
      'an unknown bed type',
      [{ type: 'HAMMOCK', count: 1 }],
      'bedConfiguration.0.type',
    ],
    [
      'a repeated bed type',
      [
        { type: 'SINGLE', count: 1 },
        { type: 'SINGLE', count: 1 },
      ],
      'bedConfiguration.1.type',
    ],
  ])('%s is rejected', async (_label, bedConfiguration, field) => {
    const listingId = await createListing('HOTEL');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      bedConfiguration,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((detail) => detail.field)).toContain(
      `body.${field}`,
    );
  });

  test('an unknown meal basis is rejected', async () => {
    const listingId = await createListing('HOTEL');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      mealPlan: 'BED_AND_DINNER',
    });
    expectIssue(res, 'body.mealPlan', 'invalid_enum_value');
  });

  test('room size keeps its existing storage bounds', async () => {
    const listingId = await createListing('HOTEL');
    const res = await registerUnit({
      listingId,
      bookableUnitType: 'HOTEL_ROOM',
      roomSizeSqm: 1000.5,
    });
    expect(res.status).toBe(422);
  });
});

describe('category applicability is enforced by the server', () => {
  test.each([
    ['TOUR', 'TOUR_DEPARTURE', { mealPlan: 'BREAKFAST_INCLUDED' }, 'mealPlan'],
    [
      'TOUR',
      'TOUR_DEPARTURE',
      { bedConfiguration: [{ type: 'SINGLE', count: 1 }] },
      'bedConfiguration',
    ],
    ['RESTAURANT', 'RESTAURANT_TABLE', { mealPlan: 'NO_MEALS' }, 'mealPlan'],
    ['CAR_RENTAL', 'VEHICLE', { mealPlan: 'NO_MEALS' }, 'mealPlan'],
    ['PROPERTY', 'PROPERTY_UNIT', { mealPlan: 'HALF_BOARD' }, 'mealPlan'],
  ])(
    'a %s unit cannot carry hotel-room %s',
    async (listingType, bookableUnitType, extra, field) => {
      const listingId = await createListing(listingType);
      const res = await registerUnit({ listingId, bookableUnitType, ...extra });
      expectIssue(res, field, 'NOT_APPLICABLE_FOR_UNIT_TYPE');
    },
  );

  test('a non-room unit cannot be edited into hotel-room details, even to clear them', async () => {
    const listingId = await createListing('TOUR');
    const created = await registerUnit({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: 10,
    });
    expect(created.status).toBe(201);

    const res = await patchUnit(created.body.data.id, { mealPlan: null });

    expectIssue(res, 'mealPlan', 'NOT_APPLICABLE_FOR_UNIT_TYPE');
  });

  test('a non-room unit serializes the room fields as null, never misleading values', async () => {
    const listingId = await createListing('TOUR');
    const created = await registerUnit({
      listingId,
      bookableUnitType: 'TOUR_DEPARTURE',
      capacity: 10,
    });
    expect(created.body.data).toMatchObject({
      bed_configuration: null,
      meal_plan: null,
      room_size_sqm: null,
      bathroom_type: null,
    });
  });
});

describe('partial edits', () => {
  test('an omitted field keeps its value', async () => {
    const { unit } = await hotelRoom(FULL_ROOM);

    const res = await patchUnit(unit.id, { unitLabel: 'Renamed Room' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      unit_label: 'Renamed Room',
      bed_configuration: unit.bed_configuration,
      meal_plan: 'BREAKFAST_INCLUDED',
      room_size_sqm: '24.50',
      bathroom_type: 'PRIVATE',
      view_type: 'MOUNTAIN',
      smoking_policy: 'NON_SMOKING',
      max_guests: 4,
    });
  });

  test('an explicit null clears each optional room detail', async () => {
    const { unit } = await hotelRoom(FULL_ROOM);

    const res = await patchUnit(unit.id, {
      maxGuests: null,
      bedConfiguration: null,
      roomSizeSqm: null,
      bathroomType: null,
      viewType: null,
      smokingPolicy: null,
      mealPlan: null,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      max_guests: null,
      bed_configuration: null,
      room_size_sqm: null,
      bathroom_type: null,
      view_type: null,
      smoking_policy: null,
      meal_plan: null,
    });
  });

  test('changing beds and meals replaces them exactly', async () => {
    const { unit } = await hotelRoom(FULL_ROOM);

    const res = await patchUnit(unit.id, {
      bedConfiguration: [{ type: 'KING', count: 1 }],
      mealPlan: 'ALL_INCLUSIVE',
    });

    expect(res.body.data.bed_configuration).toEqual([
      { type: 'KING', count: 1 },
    ]);
    expect(res.body.data.meal_plan).toBe('ALL_INCLUSIVE');
  });
});

describe('legacy rooms and the nightly charge', () => {
  test('a legacy room with no stated details stays readable and bookable', async () => {
    const { listingId, unit } = await hotelRoom({}, 'Legacy Room');
    await publish(listingId);

    const shown = await publicUnit(listingId, unit.id);
    expect(shown).toMatchObject({
      bed_configuration: null,
      meal_plan: null,
      max_guests: null,
      room_size_sqm: null,
    });

    const held = rememberHoldQuotes(
      await request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          items: [
            {
              bookableUnitId: unit.id,
              dateFrom: day(30),
              dateTo: day(32),
              quantity: 1,
            },
          ],
        }),
    );
    expect(held.status).toBe(201);
    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [quotedItem(held.body.data.items[0].hold_ids)],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(booked.status).toBe(201);
    expect(booked.body.data.total_amount).toBe('20000.00');
  });

  test('the meal basis never changes the charge: 2 rooms × 2 nights of a breakfast-included room', async () => {
    const { listingId, unit } = await hotelRoom({
      ...FULL_ROOM,
      mealPlan: 'BREAKFAST_INCLUDED',
    });
    await publish(listingId);

    const stay = await request(app).get(
      `/api/v1/availability/${listingId}/units?checkIn=${day(40)}&checkOut=${day(42)}`,
    );
    const stayUnit = stay.body.data.find((row) => row.id === unit.id);
    expect(stayUnit.night_count_for_stay).toBe(2);
    expect(stayUnit.stay_total_amount).toBe('20000.00');

    const held = rememberHoldQuotes(
      await request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          items: [
            {
              bookableUnitId: unit.id,
              dateFrom: day(40),
              dateTo: day(42),
              quantity: 2,
            },
          ],
        }),
    );
    expect(held.body.data.items[0].quote).toEqual({
      unit_price_amount: '20000.00',
      total_amount: '40000.00',
      currency: 'AMD',
    });
    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [
          quotedItem(held.body.data.items[0].hold_ids, { guestCount: 8 }),
        ],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(booked.status).toBe(201);
    expect(booked.body.data.total_amount).toBe('40000.00');
  });

  test('max guests still caps occupancy per room', async () => {
    const { listingId, unit } = await hotelRoom({ ...FULL_ROOM, maxGuests: 2 });
    await publish(listingId);
    const held = rememberHoldQuotes(
      await request(app)
        .post('/api/v1/booking-holds')
        .set('Authorization', `Bearer ${customer}`)
        .send({
          items: [
            {
              bookableUnitId: unit.id,
              dateFrom: day(45),
              dateTo: day(46),
              quantity: 1,
            },
          ],
        }),
    );

    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer}`)
      .send({
        items: [
          quotedItem(held.body.data.items[0].hold_ids, { guestCount: 3 }),
        ],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expectIssue(booked, 'items', 'GUEST_CAPACITY_EXCEEDED');
  });
});

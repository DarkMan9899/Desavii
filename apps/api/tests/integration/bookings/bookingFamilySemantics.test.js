/**
 * Booking-family semantics and abuse cases over HTTP
 * (docs/BOOKING_WIDGET_REBUILD.md §10–§12):
 *
 * - a restaurant reservation must fall inside the published opening hours,
 *   including a window that runs past midnight;
 * - a car rental is priced by calendar days, both ends inclusive — pickup
 *   and return times never change the count;
 * - every family (lodging, tour, car, attraction/entertainment) refuses
 *   foreign or unbookable inventory, impossible quantities and occupancy,
 *   invalid dates, and a tampered client total; the server derives the
 *   total; another customer or partner never reaches someone else's booking.
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
import { rememberHoldQuotes, quotedItem } from '../helpers/holdQuotes.js';
import { addIsoDays, businessNow } from '../helpers/isoDates.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';
import { YEREVAN_CITY_ID } from '../helpers/seededCities.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const DAILY_RATE = 20000;

let pool;
let vendor;
let customer;
let otherCustomer;
let otherOwner;
let partnerId;
let languageId;
let categoryIdBySlug;
let today;

const as = (token, req) => req.set('Authorization', `Bearer ${token}`);
const issues = (res) => (res.body.error?.details ?? []).map((d) => d.issue);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

async function register(label) {
  const email = `family-${label}-${SUFFIX}@example.test`;
  const password = 'Family-Pass1!';
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Family',
    lastName: label,
  });
  return { userId: res.body.data.user.id, email, password };
}

/** A listing of `listingType`, published directly (only booking is under test). */
async function createListing(listingType, categorySlug, pricing) {
  const res = await as(vendor, request(app).post('/api/v1/listings')).send({
    partnerId,
    listingType,
    translations: [{ languageId, title: `Family ${listingType} ${SUFFIX}` }],
    categoryIds: [categoryIdBySlug[categorySlug]],
    pricing: { currencyCode: 'AMD', ...pricing },
  });
  expect(res.status).toBe(201);
  const listingId = res.body.data.id;
  await as(vendor, request(app).patch(`/api/v1/listings/${listingId}`)).send({
    location: {
      cityId: YEREVAN_CITY_ID,
      latitude: 40.1772,
      longitude: 44.5035,
    },
  });
  await as(vendor, request(app).post(`/api/v1/listings/${listingId}/media`))
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await pool.query(
    "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id = ?",
    [listingId],
  );
  return listingId;
}

async function createUnit(listingId, bookableUnitType, capacity, extra = {}) {
  const res = await as(
    vendor,
    request(app).post('/api/v1/availability/units'),
  ).send({ listingId, bookableUnitType, capacity, ...extra });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

function hold(items, token = customer) {
  return as(token, request(app).post('/api/v1/booking-holds'))
    .send({ items })
    .then(rememberHoldQuotes);
}

function book(holdIds, item = {}, token = customer) {
  return as(token, request(app).post('/api/v1/bookings')).send({
    items: [quotedItem(holdIds, item)],
    guestContactSnapshot: GUEST_CONTACT,
  });
}

/** The first date from `fromDays` ahead that falls on `dayOfWeek`. */
function nextWeekday(dayOfWeek, fromDays) {
  let date = addIsoDays(today, fromDays);
  while (new Date(`${date}T00:00:00Z`).getUTCDay() !== dayOfWeek) {
    date = addIsoDays(date, 1);
  }
  return date;
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
  const second = await register('customer-b');
  otherCustomer = await login(second.email, second.password);

  const [[partner]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partner.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [categories] = await pool.query(
    'SELECT id, slug FROM listing_categories',
  );
  categoryIdBySlug = Object.fromEntries(
    categories.map((category) => [category.slug, category.id]),
  );
  today = (await businessNow(pool)).date;

  // An unrelated company: its owner must never reach these bookings.
  const ownerB = await register('owner-b');
  const [[approved]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  const [partnerB] = await pool.query(
    `INSERT INTO partners (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'Family B LLC',
      'Family B',
      `family-b-${SUFFIX}`,
      approved.id,
      approved.id,
      ownerB.userId,
    ],
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerB.insertId, ownerB.userId, ownerRole.id],
  );
  otherOwner = await login(ownerB.email, ownerB.password);
}, 120_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('restaurant reservations fall inside the opening hours, overnight windows included', () => {
  let unitId;
  let friday;
  let saturday;
  let sunday;

  beforeAll(async () => {
    const listingId = await createListing('RESTAURANT', 'restaurants', {
      modelCode: 'PER_PERSON',
      amount: 6500,
    });
    unitId = await createUnit(listingId, 'RESTAURANT_TABLE', 20);
    const res = await as(
      vendor,
      request(app).put(`/api/v1/listings/${listingId}/opening-hours`),
    ).send({
      days: [
        { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
        { dayOfWeek: 6, opensAt: '12:00', closesAt: '23:00' },
        { dayOfWeek: 0, isClosed: true },
      ],
    });
    expect(res.status).toBe(200);
    friday = nextWeekday(5, 7);
    saturday = addIsoDays(friday, 1);
    sunday = addIsoDays(friday, 2);
  });

  const reserve = (date, startTime) =>
    hold([{ bookableUnitId: unitId, dateFrom: date, dateTo: date, startTime }]);

  test.each([
    ['Friday 18:00 (opening)', 'friday', '18:00'],
    ['Friday 23:30', 'friday', '23:30'],
    ['Saturday 00:30 (after midnight, Friday service)', 'saturday', '00:30'],
    ['Saturday 01:30 (last half hour)', 'saturday', '01:30'],
    ['Saturday 12:00 (its own opening)', 'saturday', '12:00'],
  ])('%s is accepted', async (_label, day, time) => {
    const dates = { friday, saturday, sunday };
    expect((await reserve(dates[day], time)).status).toBe(201);
  });

  test.each([
    ['Friday 17:30 (before opening)', 'friday', '17:30'],
    ['Friday 01:00 (Thursday has no hours)', 'friday', '01:00'],
    ['Saturday 02:00 (the closing minute)', 'saturday', '02:00'],
    ['Saturday 11:30 (the gap before reopening)', 'saturday', '11:30'],
    ['Saturday 23:00 (its closing minute)', 'saturday', '23:00'],
    ['Sunday 19:00 (closed)', 'sunday', '19:00'],
    ['Sunday 00:30 (Saturday does not run past midnight)', 'sunday', '00:30'],
  ])('%s is refused, reserving nothing', async (_label, day, time) => {
    const dates = { friday, saturday, sunday };
    const res = await reserve(dates[day], time);
    expect(res.status).toBe(422);
    expect(issues(res)).toEqual(['RESERVATION_OUTSIDE_OPENING_HOURS']);
  });

  test('a window ending exactly at midnight has no after-midnight tail', async () => {
    const listingId = await createListing('RESTAURANT', 'restaurants', {
      modelCode: 'PER_PERSON',
      amount: 6500,
    });
    const tableId = await createUnit(listingId, 'RESTAURANT_TABLE', 5);
    await as(
      vendor,
      request(app).put(`/api/v1/listings/${listingId}/opening-hours`),
    ).send({ days: [{ dayOfWeek: 5, opensAt: '18:00', closesAt: '00:00' }] });
    const at = (date, startTime) =>
      hold([
        { bookableUnitId: tableId, dateFrom: date, dateTo: date, startTime },
      ]);
    expect((await at(friday, '23:30')).status).toBe(201);
    expect((await at(saturday, '00:00')).status).toBe(422);
  });

  test('a restaurant with no published hours is not restricted', async () => {
    const listingId = await createListing('RESTAURANT', 'restaurants', {
      modelCode: 'PER_PERSON',
      amount: 6500,
    });
    const tableId = await createUnit(listingId, 'RESTAURANT_TABLE', 5);
    const res = await hold([
      {
        bookableUnitId: tableId,
        dateFrom: sunday,
        dateTo: sunday,
        startTime: '04:00',
      },
    ]);
    expect(res.status).toBe(201);
  });
});

describe('a car rental is priced by calendar days, both ends inclusive', () => {
  let carUnitId;
  // Far enough ahead to stay clear of "now" in Asia/Yerevan.
  const base = () => addIsoDays(today, 30);

  beforeAll(async () => {
    const listingId = await createListing('CAR_RENTAL', 'car-rentals', {
      modelCode: 'PER_DAY',
      amount: DAILY_RATE,
    });
    carUnitId = await createUnit(listingId, 'VEHICLE', 50);
  });

  const rent = (dateFrom, startTime, dateTo, endTime, quantity = 1) =>
    hold([
      {
        bookableUnitId: carUnitId,
        dateFrom,
        dateTo,
        startTime,
        endTime,
        quantity,
      },
    ]);

  test.each([
    ['same day, 8 hours', 0, '10:00', 0, '18:00', 1],
    ['same day, midnight to 23:59', 0, '00:00', 0, '23:59', 1],
    ['two dates, under 24 hours (22:00 → 09:00)', 0, '22:00', 1, '09:00', 2],
    ['around midnight (23:30 → 00:30)', 0, '23:30', 1, '00:30', 2],
    ['exactly 24 hours (10:00 → 10:00)', 0, '10:00', 1, '10:00', 2],
    ['24 hours and 1 minute', 0, '10:00', 1, '10:01', 2],
    ['25 hours', 0, '10:00', 1, '11:00', 2],
    ['three full days (Mon 10:00 → Thu 10:00)', 0, '10:00', 3, '10:00', 4],
  ])(
    '%s → %#: billed for the calendar days it touches',
    async (_label, fromOffset, startTime, toOffset, endTime, days) => {
      const res = await rent(
        addIsoDays(base(), fromOffset),
        startTime,
        addIsoDays(base(), toOffset),
        endTime,
      );
      expect(res.status).toBe(201);
      const [item] = res.body.data.items;
      expect(item.quote.total_amount).toBe(`${days * DAILY_RATE}.00`);

      // The booking charges exactly the held quote, derived by the server.
      const booked = await book(item.hold_ids);
      expect(booked.status).toBe(201);
      expect(booked.body.data.total_amount).toBe(`${days * DAILY_RATE}.00`);
    },
  );

  test('two cars double the calendar-day price', async () => {
    const res = await rent(base(), '10:00', addIsoDays(base(), 2), '09:00', 2);
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].quote.total_amount).toBe(
      `${3 * DAILY_RATE * 2}.00`,
    );
  });

  test('a pickup already past in Asia/Yerevan is refused', async () => {
    const res = await rent(today, '00:00', addIsoDays(today, 1), '10:00');
    expect(res.status).toBe(422);
    expect(issues(res)).toContain('BOOKING_IN_PAST');
  });
});

describe('every booking family refuses tampering; the server owns the total', () => {
  let hotelRoomId;
  let tourDepartureId;
  let carUnitId;
  let attractionUnitId;
  let venueUnitId;
  let draftUnitId;
  let dayOffset = 40;
  const nextDay = () => {
    dayOffset += 3;
    return addIsoDays(today, dayOffset);
  };

  beforeAll(async () => {
    const hotelId = await createListing('HOTEL', 'hotels', {
      modelCode: 'PER_NIGHT',
      amount: 30000,
    });
    hotelRoomId = await createUnit(hotelId, 'HOTEL_ROOM', 2, { maxGuests: 2 });
    const tourId = await createListing('TOUR', 'tours', {
      modelCode: 'PER_PERSON',
      amount: 15000,
    });
    tourDepartureId = await createUnit(tourId, 'TOUR_DEPARTURE', 3, {
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
    });
    const carId = await createListing('CAR_RENTAL', 'car-rentals', {
      modelCode: 'PER_DAY',
      amount: DAILY_RATE,
    });
    carUnitId = await createUnit(carId, 'VEHICLE', 1);
    const attractionId = await createListing('ATTRACTION', 'attractions', {
      modelCode: 'PER_PERSON',
      amount: 4000,
    });
    attractionUnitId = await createUnit(attractionId, 'TOUR_DEPARTURE', 3);
    const venueId = await createListing('ATTRACTION', 'entertainment-venues', {
      modelCode: 'PER_PERSON',
      amount: 8000,
    });
    venueUnitId = await createUnit(venueId, 'TOUR_DEPARTURE', 4, {
      timeSlotStart: '20:00',
      timeSlotEnd: '21:00',
    });
    // A listing that is not bookable (left as a draft by its partner).
    const draftRes = await as(
      vendor,
      request(app).post('/api/v1/listings'),
    ).send({
      partnerId,
      listingType: 'TOUR',
      translations: [{ languageId, title: `Family draft ${SUFFIX}` }],
      categoryIds: [categoryIdBySlug.tours],
      pricing: { modelCode: 'PER_PERSON', amount: 1, currencyCode: 'AMD' },
    });
    draftUnitId = await createUnit(draftRes.body.data.id, 'TOUR_DEPARTURE', 9);
  });

  const nightsFrom = (date, nights) => ({
    dateFrom: date,
    dateTo: addIsoDays(date, nights),
  });

  describe('lodging', () => {
    test('an unknown unit, and a unit of a draft listing, are both 404', async () => {
      const date = nextDay();
      expect(
        (await hold([{ bookableUnitId: 999999999, ...nightsFrom(date, 1) }]))
          .status,
      ).toBe(404);
      const draft = await hold([
        { bookableUnitId: draftUnitId, dateFrom: date, dateTo: date },
      ]);
      // A non-public listing answers like one that does not exist.
      expect(draft.status).toBe(404);
    });

    test('more guests than the rooms sleep is refused at booking', async () => {
      const held = await hold([
        { bookableUnitId: hotelRoomId, ...nightsFrom(nextDay(), 2) },
      ]);
      expect(held.status).toBe(201);
      const res = await book(held.body.data.items[0].hold_ids, {
        guestCount: 3,
      });
      expect(res.status).toBe(422);
      expect(issues(res)).toContain('GUEST_CAPACITY_EXCEEDED');
    });

    test('more rooms than exist is a conflict, reserving nothing', async () => {
      const res = await hold([
        {
          bookableUnitId: hotelRoomId,
          ...nightsFrom(nextDay(), 1),
          quantity: 3,
        },
      ]);
      expect(res.status).toBe(409);
    });

    test.each([
      [
        'check-out before check-in',
        (d) => ({ dateFrom: d, dateTo: addIsoDays(d, -1) }),
      ],
      ['a zero-night stay', (d) => ({ dateFrom: d, dateTo: d })],
    ])('%s is refused', async (_label, range) => {
      const res = await hold([
        { bookableUnitId: hotelRoomId, ...range(nextDay()) },
      ]);
      expect(res.status).toBe(422);
    });

    test.each([
      [{ expectedTotalAmount: '1.00' }],
      [{ expectedTotalAmount: '0.00' }],
      [{ expectedCurrency: 'USD' }],
    ])(
      'a tampered client total %p is refused; the server total stands',
      async (tamper) => {
        const held = await hold([
          { bookableUnitId: hotelRoomId, ...nightsFrom(nextDay(), 2) },
        ]);
        const holdIds = held.body.data.items[0].hold_ids;
        const res = await book(holdIds, { guestCount: 2, ...tamper });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('PRICE_CHANGED');
        // The untampered request still books at the server's own total.
        const ok = await book(holdIds, { guestCount: 2 });
        expect(ok.status).toBe(201);
        expect(ok.body.data.total_amount).toBe('60000.00');
      },
    );
  });

  describe('tour', () => {
    test('more travellers than seats is a conflict', async () => {
      const date = nextDay();
      const res = await hold([
        {
          bookableUnitId: tourDepartureId,
          dateFrom: date,
          dateTo: date,
          quantity: 4,
        },
      ]);
      expect(res.status).toBe(409);
    });

    test('a client-sent departure time is ignored; the departure keeps its own', async () => {
      const date = nextDay();
      const held = await hold([
        {
          bookableUnitId: tourDepartureId,
          dateFrom: date,
          dateTo: date,
          startTime: '23:00',
          endTime: '23:30',
        },
      ]);
      expect(held.status).toBe(201);
      const res = await book(held.body.data.items[0].hold_ids);
      expect(res.status).toBe(201);
      expect(res.body.data.items[0].start_time).toBe('09:00');
    });

    test('a departure on a past date is refused', async () => {
      const yesterday = addIsoDays(today, -1);
      const res = await hold([
        {
          bookableUnitId: tourDepartureId,
          dateFrom: yesterday,
          dateTo: yesterday,
        },
      ]);
      expect(res.status).toBe(422);
    });

    test('a tampered total is refused; the server books 15,000 per traveller', async () => {
      const date = nextDay();
      const held = await hold([
        {
          bookableUnitId: tourDepartureId,
          dateFrom: date,
          dateTo: date,
          quantity: 2,
        },
      ]);
      const holdIds = held.body.data.items[0].hold_ids;
      const tampered = await book(holdIds, { expectedTotalAmount: '15000.00' });
      expect(tampered.status).toBe(409);
      const ok = await book(holdIds);
      expect(ok.body.data.total_amount).toBe('30000.00');
    });
  });

  describe('car rental', () => {
    test('a return before pickup is refused', async () => {
      const date = nextDay();
      const res = await hold([
        {
          bookableUnitId: carUnitId,
          dateFrom: date,
          dateTo: date,
          startTime: '18:00',
          endTime: '10:00',
        },
      ]);
      expect(res.status).toBe(422);
      expect(issues(res)).toContain('RETURN_NOT_AFTER_PICKUP');
    });

    test('the only car, already held, is unavailable to the next customer', async () => {
      const date = nextDay();
      const item = {
        bookableUnitId: carUnitId,
        dateFrom: date,
        dateTo: addIsoDays(date, 1),
        startTime: '10:00',
        endTime: '10:00',
      };
      expect((await hold([item])).status).toBe(201);
      expect((await hold([item], otherCustomer)).status).toBe(409);
    });

    test.each([[2], [999999]])(
      '%s cars of a one-car fleet is a conflict',
      async (quantity) => {
        const date = nextDay();
        const res = await hold([
          {
            bookableUnitId: carUnitId,
            dateFrom: date,
            dateTo: date,
            startTime: '10:00',
            endTime: '12:00',
            quantity,
          },
        ]);
        expect(res.status).toBe(409);
      },
    );

    test.each([[0], [-1], [1.5], ['two']])(
      'a malformed quantity %p is refused at the boundary',
      async (quantity) => {
        const date = nextDay();
        const res = await hold([
          {
            bookableUnitId: carUnitId,
            dateFrom: date,
            dateTo: date,
            startTime: '10:00',
            endTime: '12:00',
            quantity,
          },
        ]);
        expect(res.status).toBe(422);
        expect(JSON.stringify(res.body)).not.toMatch(/sql|stack|at \w+ \(/i);
      },
    );

    test('a tampered total is refused', async () => {
      const date = nextDay();
      const held = await hold([
        {
          bookableUnitId: carUnitId,
          dateFrom: date,
          dateTo: addIsoDays(date, 1),
          startTime: '10:00',
          endTime: '09:00',
        },
      ]);
      const res = await book(held.body.data.items[0].hold_ids, {
        expectedTotalAmount: `${DAILY_RATE}.00`,
      });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRICE_CHANGED');
    });
  });

  describe('attraction and entertainment', () => {
    test('more visitors than places is a conflict', async () => {
      const date = nextDay();
      const res = await hold([
        {
          bookableUnitId: attractionUnitId,
          dateFrom: date,
          dateTo: date,
          quantity: 4,
        },
      ]);
      expect(res.status).toBe(409);
    });

    test('stale availability: the second customer cannot take places already held', async () => {
      const date = nextDay();
      const item = {
        bookableUnitId: venueUnitId,
        dateFrom: date,
        dateTo: date,
        quantity: 3,
      };
      expect((await hold([item])).status).toBe(201);
      expect((await hold([item], otherCustomer)).status).toBe(409);
    });

    test('sessions of two different venues cannot be booked as one', async () => {
      const date = nextDay();
      const held = await hold([
        { bookableUnitId: attractionUnitId, dateFrom: date, dateTo: date },
        { bookableUnitId: venueUnitId, dateFrom: date, dateTo: date },
      ]);
      expect(held.status).toBe(201);
      const [first, second] = held.body.data.items;
      const res = await as(
        customer,
        request(app).post('/api/v1/bookings'),
      ).send({
        items: [quotedItem(first.hold_ids), quotedItem(second.hold_ids)],
        guestContactSnapshot: GUEST_CONTACT,
      });
      expect(res.status).toBe(422);
      expect(issues(res)).toContain('MULTI_LISTING_BOOKING');
    });

    test('a tampered total is refused; the server books 8,000 per participant', async () => {
      const date = nextDay();
      const held = await hold([
        {
          bookableUnitId: venueUnitId,
          dateFrom: date,
          dateTo: date,
          quantity: 1,
        },
      ]);
      const holdIds = held.body.data.items[0].hold_ids;
      expect(
        (await book(holdIds, { expectedTotalAmount: '1.00' })).status,
      ).toBe(409);
      const ok = await book(holdIds);
      expect(ok.body.data.total_amount).toBe('8000.00');
    });
  });

  describe('tenant isolation', () => {
    test("another customer can neither book someone's holds nor read the booking; another partner cannot read it", async () => {
      const date = nextDay();
      const held = await hold([
        { bookableUnitId: hotelRoomId, ...nightsFrom(date, 1) },
      ]);
      const holdIds = held.body.data.items[0].hold_ids;

      const stolen = await book(holdIds, { guestCount: 1 }, otherCustomer);
      expect(stolen.status).not.toBe(201);
      expect([404, 409, 422]).toContain(stolen.status);

      const own = await book(holdIds, { guestCount: 1 });
      expect(own.status).toBe(201);
      const bookingId = own.body.data.id;
      const readBy = (token) =>
        as(token, request(app).get(`/api/v1/bookings/${bookingId}`));
      expect((await readBy(customer)).status).toBe(200);
      expect((await readBy(vendor)).status).toBe(200);
      expect((await readBy(otherCustomer)).status).toBe(404);
      expect((await readBy(otherOwner)).status).toBe(404);
    });
  });
});

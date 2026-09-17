/**
 * Sprint 10: `POST /bookings` converts already-granted holds into a real,
 * auditable booking. Exercises the happy path plus the schema-enforced
 * consistency rules (single listing, single unit type, single currency)
 * and the pricing-completeness/hold-ownership guards described in the
 * approved proposal §12.
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
let admin;
let partnerId;
let languageId;
let hotelCategoryId;
let yerevanCityId;
let pool;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

/**
 * `BookingService.createBooking` resolves the listing via `ListingService
 * .getListing(principal, ...)` with the CUSTOMER as principal — a DRAFT
 * listing 404s for any non-owner, so every listing created here is
 * published immediately; this file has no case that needs a draft.
 */
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
  // Must exist BEFORE publish — Phase 5's publish-readiness gate now
  // requires >=1 bookable unit (ListingService#checkPublishReadiness).
  // registerUnit (below) is idempotent per (listingId, bookableUnitTypeCode),
  // so each call site's own later registerUnit call is a harmless re-registration.
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return listingId;
}

async function registerUnit(
  listingId,
  bookableUnitType = 'HOTEL_ROOM',
  capacity = 1,
) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType, capacity });
  return res.body.data.id;
}

async function setPrice(unitId, dateFrom, dateTo, amount, currency = 'AMD') {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: currency,
    });
}

async function createHold(
  customerAuth,
  unitId,
  dateFrom,
  dateTo,
  quantity = 1,
  { startTime, endTime } = {},
) {
  const res = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customerAuth.accessToken}`)
    .send({
      items: [
        {
          bookableUnitId: unitId,
          dateFrom,
          dateTo,
          quantity,
          startTime,
          endTime,
        },
      ],
    });
  return res.body.data.items[0].hold_ids;
}

/**
 * Sprint B (Car Rental Pickup/Return Interval) — unlike `createListing`
 * above, sets a real `cityId` (not just lat/long): `pickup_location`/
 * `return_location` are derived from the listing's own resolved
 * `city_name`/`country_name` (`bookingService.js#formatListingLocationLabel`),
 * which is `NULL` without a real city.
 */
async function createCarRentalListing(title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'CAR_RENTAL',
      translations: [{ languageId, title }],
    });
  const listingId = res.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: {
        latitude: 40.1772,
        longitude: 44.5035,
        cityId: yerevanCityId,
      },
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'VEHICLE' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return listingId;
}

const GUEST_CONTACT = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+37400000000',
};

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
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );

  pool = getMysqlPool();
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[hotelCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelCategoryId = hotelCategory.id;
  const [[yerevanCity]] = await pool.query(
    "SELECT id FROM cities WHERE name = 'Yerevan' LIMIT 1",
  );
  yerevanCityId = yerevanCity.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /bookings — converts holds into a booking', () => {
  test('creates a PENDING_VENDOR booking with the correct total', async () => {
    const listingId = await createListing(
      `Booking Creation Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-02-01';
    const dateTo = '2027-02-02';
    await setPrice(unitId, dateFrom, dateTo, 10_000);
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [{ fullName: 'Ada Lovelace' }] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING_VENDOR');
    expect(res.body.data.listing_id).toBe(listingId);
    expect(res.body.data.booking_type).toBe('HOTEL_ROOM_BOOKING');
    expect(res.body.data.currency).toBe('AMD');
    // Checkout-exclusive: 2027-02-01 check-in / 2027-02-02 check-out is
    // exactly 1 occupied night at 10_000 (accommodation date semantics —
    // see accommodationDateSemantics.js).
    expect(res.body.data.total_amount).toBe('10000.00');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].guests).toHaveLength(1);
    expect(res.body.data.booking_reference).toMatch(/^BK-\d{8}-[A-Z2-9]{8}$/);
  });

  test('rejects a booking whose holds no longer exist (already consumed) with 409 HOLD_EXPIRED', async () => {
    const listingId = await createListing(
      `Booking Stale Hold Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-02-10';
    const dateTo = '2027-02-11';
    await setPrice(unitId, dateFrom, dateTo, 5_000);
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const firstAttempt = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(firstAttempt.status).toBe(201);

    const secondAttempt = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(secondAttempt.status).toBe(409);
    expect(secondAttempt.body.error.code).toBe('HOLD_EXPIRED');
  });

  test('rejects a booking spanning two different listings with 422 MULTI_LISTING_BOOKING', async () => {
    const listingA = await createListing(
      `Booking MultiListing A ${Date.now()}`,
    );
    const listingB = await createListing(
      `Booking MultiListing B ${Date.now()}`,
    );
    const unitA = await registerUnit(listingA);
    const unitB = await registerUnit(listingB);
    const dateFrom = '2027-02-15';
    const dateTo = '2027-02-16';
    await setPrice(unitA, dateFrom, dateTo, 5_000);
    await setPrice(unitB, dateFrom, dateTo, 5_000);
    const holdIdsA = await createHold(customer, unitA, dateFrom, dateTo, 1);
    const holdIdsB = await createHold(customer, unitB, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          { holdIds: holdIdsA, guests: [] },
          { holdIds: holdIdsB, guests: [] },
        ],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'MULTI_LISTING_BOOKING'),
    ).toBe(true);
  });

  test('rejects a booking when a requested date has no price set (422 PRICING_INCOMPLETE)', async () => {
    const listingId = await createListing(
      `Booking No Price Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-03-01';
    const dateTo = '2027-03-02';
    // Deliberately never call setPrice for this range.
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'PRICING_INCOMPLETE'),
    ).toBe(true);
  });
});

describe('P2.2A — accommodation price-resolution precedence (date override -> unit base -> listing base)', () => {
  async function registerUnitWithBasePrice(
    listingId,
    { amount, currency = 'AMD', label } = {},
  ) {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: label ?? `P2.2A price unit ${Date.now()}`,
        basePriceAmount: amount,
        basePriceCurrency: currency,
      });
    return res.body.data.id;
  }

  async function setListingBasePrice(listingId, amount, currencyCode = 'AMD') {
    // A listing's pricing is validated against its category's allowed
    // pricing models (`category_pricing_models`) — `createListing` above
    // never sets one, so it must be set here first.
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ categoryIds: [hotelCategoryId] });
    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ pricing: { modelCode: 'PER_NIGHT', amount, currencyCode } });
    if (res.status !== 200) {
      throw new Error(
        `setListingBasePrice failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
  }

  test("a unit's own base price is used when no calendar override exists", async () => {
    const listingId = await createListing(
      `P2.2A Unit Base Price ${Date.now()}`,
    );
    const unitId = await registerUnitWithBasePrice(listingId, { amount: 75 });
    const dateFrom = '2027-04-01';
    const dateTo = '2027-04-02';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    // 1 occupied night at the unit's own base price (75), not the (absent)
    // listing price.
    expect(res.body.data.total_amount).toBe('75.00');
  });

  test("a date-specific calendar override takes precedence over the unit's base price", async () => {
    const listingId = await createListing(
      `P2.2A Override Beats Unit Base ${Date.now()}`,
    );
    const unitId = await registerUnitWithBasePrice(listingId, { amount: 100 });
    const dateFrom = '2027-04-05';
    const dateTo = '2027-04-06';
    await setPrice(unitId, dateFrom, dateTo, 150);
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    // The override (150) wins, not the unit's own base price (100).
    expect(res.body.data.total_amount).toBe('150.00');
  });

  test('a currency mismatch between a date override and the unit base price is rejected, never silently combined', async () => {
    // The pre-existing, generic currency-consistency check (every
    // resolved per-date price in one item must share one currencyCode,
    // regardless of which rung produced it) already covers this new
    // combination transparently — proving it here, not re-implementing
    // it, per the P2.2A review's explicit currency-correctness question.
    const listingId = await createListing(
      `P2.2A Currency Mismatch Rejected ${Date.now()}`,
    );
    const unitId = await registerUnitWithBasePrice(listingId, {
      amount: 70,
      currency: 'EUR',
    });
    const day1 = '2027-04-20';
    // Checkout-exclusive: this hold occupies day1 (2027-04-20) and
    // 2027-04-21 — only day1 gets an override below, in a DIFFERENT
    // currency than the unit's own EUR base price, so 2027-04-21 falls
    // through to rung 2 (unit base, EUR). This one item's two occupied
    // nights would resolve to two different currencies if nothing
    // caught it.
    const checkout = '2027-04-22';
    await setPrice(unitId, day1, day1, 50, 'AMD');
    const holdIds = await createHold(customer, unitId, day1, checkout, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some(
        (d) => d.issue === 'PRICING_CURRENCY_MISMATCH',
      ),
    ).toBe(true);
  });

  test("the unit's base price takes precedence over the listing's fallback price", async () => {
    const listingId = await createListing(
      `P2.2A Unit Base Beats Listing Fallback ${Date.now()}`,
    );
    await setListingBasePrice(listingId, 40);
    const unitId = await registerUnitWithBasePrice(listingId, { amount: 60 });
    const dateFrom = '2027-04-10';
    const dateTo = '2027-04-11';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    // The unit's own base price (60) wins over the listing's flat
    // fallback (40).
    expect(res.body.data.total_amount).toBe('60.00');
  });

  test('a legacy unit with no base price still falls back to the listing price — pre-P2.2A behavior unchanged', async () => {
    const listingId = await createListing(
      `P2.2A Legacy Unit Listing Fallback ${Date.now()}`,
    );
    await setListingBasePrice(listingId, 40);
    // registerUnit (no base price fields) — the exact shape of a unit
    // created before this slice existed.
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-04-15';
    const dateTo = '2027-04-16';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total_amount).toBe('40.00');
  });

  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/bookings')
      .send({
        items: [{ holdIds: [1], guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(res.status).toBe(401);
  });
});

describe('P2.2B — booking-item unit identity and guest-capacity enforcement', () => {
  async function registerUnitWithGuestsAndLabel(
    listingId,
    { maxGuests, label, capacity = 1 } = {},
  ) {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: label ?? `P2.2B guest unit ${Date.now()}`,
        capacity,
        ...(maxGuests !== undefined ? { maxGuests } : {}),
      });
    return res.body.data.id;
  }

  test('a booking-item response includes the real unit_label and bookable_unit_type', async () => {
    const listingId = await createListing(`P2.2B Unit Identity ${Date.now()}`);
    const unitId = await registerUnitWithGuestsAndLabel(listingId, {
      label: 'Deluxe Suite',
    });
    await setPrice(unitId, '2027-05-01', '2027-05-02', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-01',
      '2027-05-02',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].unit_label).toBe('Deluxe Suite');
    expect(res.body.data.items[0].bookable_unit_type).toBe('HOTEL_ROOM');
    expect(res.body.data.items[0].bookable_unit_id).toBe(unitId);
  });

  test('a guest count within max_guests × quantity succeeds', async () => {
    const listingId = await createListing(`P2.2B Guest OK ${Date.now()}`);
    const unitId = await registerUnitWithGuestsAndLabel(listingId, {
      maxGuests: 2,
    });
    await setPrice(unitId, '2027-05-05', '2027-05-06', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-05',
      '2027-05-06',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 2 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
  });

  test('a guest count above max_guests × quantity is rejected with 422 GUEST_CAPACITY_EXCEEDED', async () => {
    const listingId = await createListing(`P2.2B Guest Over ${Date.now()}`);
    const unitId = await registerUnitWithGuestsAndLabel(listingId, {
      maxGuests: 2,
    });
    await setPrice(unitId, '2027-05-10', '2027-05-11', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-10',
      '2027-05-11',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 3 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'GUEST_CAPACITY_EXCEEDED'),
    ).toBe(true);
  });

  test('the allowed guest count scales with quantity (max_guests × quantity, not max_guests alone)', async () => {
    const listingId = await createListing(`P2.2B Guest Quantity ${Date.now()}`);
    const unitId = await registerUnitWithGuestsAndLabel(listingId, {
      maxGuests: 2,
      capacity: 2,
    });
    await setPrice(unitId, '2027-05-15', '2027-05-16', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-15',
      '2027-05-16',
      2,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        // 4 guests would exceed max_guests (2) alone, but not 2 x quantity(2).
        items: [{ holdIds, guests: [], guestCount: 4 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
  });

  test('a legacy unit with no max_guests never invents a limit — any guest count is accepted', async () => {
    const listingId = await createListing(
      `P2.2B Legacy No Max Guests ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId); // no maxGuests field at all
    await setPrice(unitId, '2027-05-20', '2027-05-21', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-20',
      '2027-05-21',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 999 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
  });

  test('an old caller that never submits guestCount at all stays fully compatible — no capacity claim, no enforcement', async () => {
    const listingId = await createListing(
      `P2.2B No GuestCount Field ${Date.now()}`,
    );
    const unitId = await registerUnitWithGuestsAndLabel(listingId, {
      maxGuests: 1,
    });
    await setPrice(unitId, '2027-05-25', '2027-05-26', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-05-25',
      '2027-05-26',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
  });
});

describe('P2.2B final review — mixed-price stay: UI estimate must equal the real booking total', () => {
  async function registerUnitWithBasePrice(
    listingId,
    amount,
    currency = 'AMD',
  ) {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `Mixed Price Unit ${Date.now()}`,
        basePriceAmount: amount,
        basePriceCurrency: currency,
      });
    return res.body.data.id;
  }

  test("night 1 = unit base, night 2 = override, night 3 = unit base, checkout day uncharged — the customer-facing calendar (the widget's own price source) resolves every consumed night, and its checkout-exclusive sum equals the real booking total", async () => {
    const listingId = await createListing(
      `P2.2B Mixed Price Stay ${Date.now()}`,
    );
    const unitId = await registerUnitWithBasePrice(listingId, 80);
    const checkIn = '2027-06-01';
    const night2 = '2027-06-02';
    const night3 = '2027-06-03';
    const checkout = '2027-06-04';
    // Only the middle night gets an explicit override.
    await setPrice(unitId, night2, night2, 150);
    // The checkout day gets a deliberately different price, so a leaked
    // inclusive-both-ends bug (charging/estimating it) would be caught
    // immediately rather than coincidentally matching.
    await setPrice(unitId, checkout, checkout, 999);

    // Before this review's fix, GET /calendar only ever returned an
    // explicit override — a day resolvable purely via the unit's own
    // base price (nights 1 and 3 here) silently came back
    // price_amount: null, making the customer's estimate go blank rather
    // than merely wrong. This is the direct proof that gap is closed.
    const calendarRes = await request(app).get(
      `/api/v1/availability/${listingId}/calendar?from=${checkIn}&to=${checkout}&unitId=${unitId}`,
    );
    expect(calendarRes.status).toBe(200);
    const byDate = Object.fromEntries(
      calendarRes.body.data.map((day) => [day.date, day]),
    );
    expect(byDate[checkIn].price_amount).toBe('80.00');
    expect(byDate[night2].price_amount).toBe('150.00');
    expect(byDate[night3].price_amount).toBe('80.00');

    // Checkout-exclusive sum, exactly mirroring reservationEstimate.js's
    // own computeEstimatedTotal for an accommodation unit type — the
    // checkout day (with its deliberately-mismatched 999 override) is
    // never included.
    const uiEstimatedTotal =
      Number(byDate[checkIn].price_amount) +
      Number(byDate[night2].price_amount) +
      Number(byDate[night3].price_amount);
    expect(uiEstimatedTotal).toBe(310);

    const holdIds = await createHold(customer, unitId, checkIn, checkout, 1);
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(bookingRes.status).toBe(201);
    // 80 + 150 + 80 = 310 — the checkout day's 999 override never applies.
    expect(bookingRes.body.data.total_amount).toBe('310.00');
    expect(Number(bookingRes.body.data.total_amount)).toBe(uiEstimatedTotal);
  });
});

describe('P2.2B final review — listing-fallback stay: UI estimate must equal the real booking total', () => {
  async function setListingBasePrice(listingId, amount, currencyCode = 'AMD') {
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ categoryIds: [hotelCategoryId] });
    const res = await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ pricing: { modelCode: 'PER_NIGHT', amount, currencyCode } });
    if (res.status !== 200) {
      throw new Error(
        `setListingBasePrice failed: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
  }

  test('a unit with no base price of its own, no calendar override, and a listing fallback price — calendar and booking total agree', async () => {
    const listingId = await createListing(
      `P2.2B Listing Fallback Stay ${Date.now()}`,
    );
    await setListingBasePrice(listingId, 45);
    // registerUnit — no basePriceAmount field at all, the legacy shape.
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-06-15';
    const dateTo = '2027-06-17';

    const calendarRes = await request(app).get(
      `/api/v1/availability/${listingId}/calendar?from=${dateFrom}&to=${dateTo}&unitId=${unitId}`,
    );
    expect(calendarRes.status).toBe(200);
    const byDate = Object.fromEntries(
      calendarRes.body.data.map((day) => [day.date, day]),
    );
    // Rung 3's amount comes from `listing.pricing.amount`, which (unlike
    // rungs 1/2's MySQL DECIMAL-as-string values) `ListingService` returns
    // as a bare JS number — the same type ambiguity
    // `bookingService.js#resolveItem` already defends against by
    // stringifying before `Money.fromDecimalString`. Compare numerically,
    // exactly as both that Money conversion and the frontend's own
    // `Number(day.price_amount)` already do — never a brittle exact-string
    // match on a value this method never promised a specific type for.
    expect(Number(byDate['2027-06-15'].price_amount)).toBe(45);
    expect(Number(byDate['2027-06-16'].price_amount)).toBe(45);
    const uiEstimatedTotal =
      Number(byDate['2027-06-15'].price_amount) +
      Number(byDate['2027-06-16'].price_amount);
    expect(uiEstimatedTotal).toBe(90);

    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data.total_amount).toBe('90.00');
    expect(Number(bookingRes.body.data.total_amount)).toBe(uiEstimatedTotal);
  });
});

describe('P2.2B final review — booking identity after unit retirement', () => {
  test("a retired (soft-deleted) unit's label remains resolvable on an existing booking — no snapshot needed, the LEFT JOIN finds it regardless of deleted_at", async () => {
    const listingId = await createListing(
      `P2.2B Retired Unit Identity ${Date.now()}`,
    );
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: 'Soon Retired Room',
        basePriceAmount: 30,
        basePriceCurrency: 'AMD',
      });
    const unitId = unitRes.body.data.id;
    const dateFrom = '2027-06-20';
    const dateTo = '2027-06-21';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;
    expect(bookingRes.body.data.items[0].unit_label).toBe('Soon Retired Room');

    // A second, always-on unit keeps the listing valid (publish readiness
    // requires >=1 unit) — retiring the booked unit doesn't touch this.
    await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });

    const retireRes = await request(app)
      .delete(`/api/v1/availability/units/${unitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(retireRes.status).toBe(200);
    expect(retireRes.body.data).toEqual({ deleted: true });

    const detailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.items[0].unit_label).toBe('Soon Retired Room');
    expect(detailRes.body.data.items[0].bookable_unit_type).toBe('HOTEL_ROOM');

    // The same shared DTO the partner/admin views use — one fetch proves
    // all three audiences see the identical, still-resolvable identity.
    const partnerRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(partnerRes.status).toBe(200);
    expect(partnerRes.body.data.items[0].unit_label).toBe('Soon Retired Room');
  });
});

describe('P2.2E — historical booking integrity: unit-label snapshot survives a later rename', () => {
  test('renaming a unit after booking does not change the label an existing booking displays', async () => {
    const listingId = await createListing(
      `P2.2E Rename Identity ${Date.now()}`,
    );
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: 'Standard Room',
        basePriceAmount: 30,
        basePriceCurrency: 'AMD',
      });
    const unitId = unitRes.body.data.id;
    const dateFrom = '2027-07-10';
    const dateTo = '2027-07-11';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;
    expect(bookingRes.body.data.items[0].unit_label).toBe('Standard Room');

    const renameRes = await request(app)
      .patch(`/api/v1/availability/units/${unitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitLabel: 'Deluxe King' });
    expect(renameRes.status).toBe(200);
    expect(renameRes.body.data.unit_label).toBe('Deluxe King');

    // The unit's own record now genuinely says "Deluxe King" — but the
    // existing booking, read by customer, partner, and admin
    // alike, must still show what the guest actually booked.
    const customerDetailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(customerDetailRes.status).toBe(200);
    expect(customerDetailRes.body.data.items[0].unit_label).toBe(
      'Standard Room',
    );

    const partnerDetailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(partnerDetailRes.status).toBe(200);
    expect(partnerDetailRes.body.data.items[0].unit_label).toBe(
      'Standard Room',
    );

    const adminDetailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.items[0].unit_label).toBe('Standard Room');
  });

  test('a legacy booking_item row with no snapshot (unit_label_snapshot IS NULL) still resolves its label via the live join', async () => {
    const listingId = await createListing(
      `P2.2E Legacy Snapshot Fallback ${Date.now()}`,
    );
    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: 'Legacy Room',
        basePriceAmount: 30,
        basePriceCurrency: 'AMD',
      });
    const unitId = unitRes.body.data.id;
    const dateFrom = '2027-08-01';
    const dateTo = '2027-08-02';
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);
    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;
    const bookingItemId = bookingRes.body.data.items[0].id;

    // Simulate a pre-P2.2E row: clear the snapshot this booking just wrote,
    // exactly the state every `booking_items` row created before migration
    // 0035 is in permanently.
    await pool.query(
      'UPDATE booking_items SET unit_label_snapshot = NULL WHERE id = ?',
      [bookingItemId],
    );

    const detailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.items[0].unit_label).toBe('Legacy Room');
  });
});

describe('P2.2B final review — guestCount schema validation edge cases', () => {
  // A unique `unitLabel` is required here, not optional decoration:
  // `mysqlBookableUnitRepository.findMatching`'s idempotency key is
  // `(listingId, bookableUnitTypeId, sourceTable, sourceId, unitLabel)`.
  // `createListing` above already registers its own plain, unlabeled
  // HOTEL_ROOM unit for every listing it creates — omitting `unitLabel`
  // here would silently match and reuse THAT unit (max_guests still
  // null) instead of creating a fresh one with this call's own
  // `maxGuests`, exactly the mistake this comment exists to prevent
  // re-introducing.
  async function registerUnitWithMaxGuests(listingId, maxGuests) {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'HOTEL_ROOM',
        unitLabel: `GuestCount Schema Unit ${Date.now()}-${Math.random()}`,
        maxGuests,
      });
    return res.body.data.id;
  }

  test('guestCount: 0 is rejected at the schema layer (structural, not the business capacity rule)', async () => {
    const listingId = await createListing(
      `P2.2B GuestCount Zero ${Date.now()}`,
    );
    const unitId = await registerUnitWithMaxGuests(listingId, 2);
    await setPrice(unitId, '2027-06-25', '2027-06-26', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-06-25',
      '2027-06-26',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 0 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('guestCount: a negative value is rejected at the schema layer', async () => {
    const listingId = await createListing(
      `P2.2B GuestCount Negative ${Date.now()}`,
    );
    const unitId = await registerUnitWithMaxGuests(listingId, 2);
    await setPrice(unitId, '2027-06-27', '2027-06-28', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-06-27',
      '2027-06-28',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: -3 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('guestCount: a fractional value is rejected at the schema layer', async () => {
    const listingId = await createListing(
      `P2.2B GuestCount Fractional ${Date.now()}`,
    );
    const unitId = await registerUnitWithMaxGuests(listingId, 2);
    await setPrice(unitId, '2027-06-29', '2027-06-30', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-06-29',
      '2027-06-30',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 1.5 }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('guestCount: a non-numeric string is rejected at the schema layer', async () => {
    const listingId = await createListing(
      `P2.2B GuestCount NonNumeric ${Date.now()}`,
    );
    const unitId = await registerUnitWithMaxGuests(listingId, 2);
    await setPrice(unitId, '2027-07-01', '2027-07-02', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-07-01',
      '2027-07-02',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [], guestCount: 'abc' }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test("guestCount: a numeric string is coerced (consistent with quantity's own existing convention) and still enforced against capacity", async () => {
    const listingId = await createListing(
      `P2.2B GuestCount StringCoerce ${Date.now()}`,
    );
    const unitId = await registerUnitWithMaxGuests(listingId, 2);
    await setPrice(unitId, '2027-07-03', '2027-07-04', 60);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-07-03',
      '2027-07-04',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        // "5" coerces to 5, which exceeds 2 max_guests x 1 quantity.
        items: [{ holdIds, guests: [], guestCount: '5' }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(422);
    expect(
      res.body.error.details.some((d) => d.issue === 'GUEST_CAPACITY_EXCEEDED'),
    ).toBe(true);
  });
});

describe('Sprint A (Time-Aware Booking Foundation) — booking_items.start_time/end_time', () => {
  async function registerTimeSlotUnit(
    listingId,
    { timeSlotStart, timeSlotEnd, label } = {},
  ) {
    const res = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        bookableUnitType: 'TOUR_DEPARTURE',
        unitLabel: label ?? `Sprint A departure ${Date.now()}`,
        capacity: 8,
        timeSlotStart,
        timeSlotEnd,
      });
    return res.body.data.id;
  }

  test('a booking against a time-slot unit snapshots its start_time/end_time onto the booking item, visible to customer/partner/admin alike', async () => {
    const listingId = await createListing(
      `Sprint A Time Slot Test ${Date.now()}`,
    );
    const unitId = await registerTimeSlotUnit(listingId, {
      timeSlotStart: '09:00',
      timeSlotEnd: '11:30',
      label: '09:00 Departure',
    });
    await setPrice(unitId, '2027-06-01', '2027-06-01', 5_000);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-06-01',
      '2027-06-01',
      1,
    );

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data.items[0].start_time).toBe('09:00');
    expect(bookingRes.body.data.items[0].end_time).toBe('11:30');
    const bookingId = bookingRes.body.data.id;

    const customerDetailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(customerDetailRes.body.data.items[0].start_time).toBe('09:00');
    expect(customerDetailRes.body.data.items[0].end_time).toBe('11:30');

    const partnerRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(partnerRes.body.data.items[0].start_time).toBe('09:00');
    expect(partnerRes.body.data.items[0].end_time).toBe('11:30');

    const adminRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminRes.body.data.items[0].start_time).toBe('09:00');
    expect(adminRes.body.data.items[0].end_time).toBe('11:30');

    // A later rename of the unit's own time slot must never retroactively
    // change what an already-placed booking displays — same snapshot
    // guarantee migration 0035 already established for unit_label.
    await request(app)
      .patch(`/api/v1/availability/units/${unitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ unitLabel: '14:00 Departure' });
    const afterRenameRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterRenameRes.body.data.items[0].start_time).toBe('09:00');
    expect(afterRenameRes.body.data.items[0].end_time).toBe('11:30');
  });

  test('a booking against a date-only (non-time-slot) unit leaves start_time/end_time null — no regression for Hotel/Property/Car Rental', async () => {
    const listingId = await createListing(
      `Sprint A Date Only Regression Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId, 'HOTEL_ROOM');
    await setPrice(unitId, '2027-06-10', '2027-06-11', 8_000);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-06-10',
      '2027-06-11',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].start_time).toBeNull();
    expect(res.body.data.items[0].end_time).toBeNull();
  });
});

describe('Sprint B (Car Rental Pickup/Return Interval) — booking_items.pickup_location/return_location', () => {
  test('a booking against a VEHICLE unit snapshots its real pickup/return time and location, visible to customer/partner/admin alike', async () => {
    const listingId = await createCarRentalListing(
      `Sprint B Rental Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId, 'VEHICLE');
    await setPrice(unitId, '2027-08-01', '2027-08-03', 15_000);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-08-01',
      '2027-08-03',
      1,
      { startTime: '10:00', endTime: '18:00' },
    );

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data.items[0].start_time).toBe('10:00');
    expect(bookingRes.body.data.items[0].end_time).toBe('18:00');
    expect(bookingRes.body.data.items[0].pickup_location).toBe(
      'Yerevan, Armenia',
    );
    expect(bookingRes.body.data.items[0].return_location).toBe(
      'Yerevan, Armenia',
    );
    const bookingId = bookingRes.body.data.id;

    const customerDetailRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(customerDetailRes.body.data.items[0].pickup_location).toBe(
      'Yerevan, Armenia',
    );
    expect(customerDetailRes.body.data.items[0].return_location).toBe(
      'Yerevan, Armenia',
    );

    const partnerRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(partnerRes.body.data.items[0].pickup_location).toBe(
      'Yerevan, Armenia',
    );
    expect(partnerRes.body.data.items[0].start_time).toBe('10:00');

    const adminRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminRes.body.data.items[0].return_location).toBe(
      'Yerevan, Armenia',
    );
    expect(adminRes.body.data.items[0].end_time).toBe('18:00');

    // A later change to the listing's own address must never retroactively
    // change what an already-placed booking displays — same snapshot
    // guarantee migration 0035 (unit_label) and Sprint A (start_time/
    // end_time) already established, now proven for location too.
    const [[otherCity]] = await pool.query(
      "SELECT id FROM cities WHERE name != 'Yerevan' LIMIT 1",
    );
    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { cityId: otherCity.id } });
    const afterMoveRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(afterMoveRes.body.data.items[0].pickup_location).toBe(
      'Yerevan, Armenia',
    );
  });

  test('a booking against a non-VEHICLE unit leaves pickup_location/return_location null — no regression for Hotel/Property/Tour', async () => {
    const listingId = await createListing(
      `Sprint B Non-Vehicle Regression Test ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-08-10', '2027-08-11', 8_000);
    const holdIds = await createHold(
      customer,
      unitId,
      '2027-08-10',
      '2027-08-11',
      1,
    );

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.items[0].pickup_location).toBeNull();
    expect(res.body.data.items[0].return_location).toBeNull();
  });
});

// Listing Lifetime / Renewal, Step B4 (brief §18/§27) — an expired listing
// must never accept a NEW booking initiation, at either of the two guard
// points: hold creation (the real, primary choke point — a booking can't
// exist without a hold) and booking confirmation itself (defense-in-depth
// for the narrow race window where a listing expires after its hold was
// already granted). Historical bookings/retrieval are proven completely
// unaffected.
describe('Listing Lifetime / Renewal, Step B4 — expired listings cannot accept new bookings', () => {
  async function expireListing(listingId) {
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [listingId],
    );
  }

  test('POST /booking-holds rejects a hold against an expired listing with 409 LISTING_NOT_BOOKABLE', async () => {
    const listingId = await createListing(
      `B4 Expired Hold Rejection ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-03-01';
    const dateTo = '2027-03-02';
    await setPrice(unitId, dateFrom, dateTo, 10_000);
    await expireListing(listingId);

    const res = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('LISTING_NOT_BOOKABLE');
  });

  test('POST /bookings rejects confirmation for the narrow race window where the listing expires after its hold was already granted', async () => {
    const listingId = await createListing(
      `B4 Expired Booking Race Rejection ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-03-05';
    const dateTo = '2027-03-06';
    await setPrice(unitId, dateFrom, dateTo, 10_000);
    // The hold is granted while the listing is still fully bookable.
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    // The listing expires AFTER the hold already exists — simulating the
    // sweep (or the expiry instant itself) landing in the gap between
    // hold creation and booking confirmation.
    await expireListing(listingId);

    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });

    // `BookingService#createBooking` already fetches the listing via
    // `ListingService#getListing(principal, ...)` before ever reaching
    // `#assertBookable` — and `getListing`'s own gate now masks an
    // expired listing exactly like a DRAFT one (404, never leaking that
    // it used to exist) for a non-owner customer. This is a STRONGER
    // outcome than a 409 would be (a 409 would confirm the listing still
    // exists), so this is the actually-correct rejection, not a gap:
    // `#assertBookable`'s own 409/LISTING_NOT_BOOKABLE only becomes
    // reachable for a caller `getListing` would otherwise let through
    // (the listing's own owner/admin) — see the sibling
    // "hold rejection" test above for that guard firing directly.
    expect(res.status).toBe(404);
  });

  test('a booking made before its listing later expires remains fully readable afterward — no retroactive effect on history', async () => {
    const listingId = await createListing(
      `B4 Historical Booking Unaffected ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    const dateFrom = '2027-03-10';
    const dateTo = '2027-03-11';
    await setPrice(unitId, dateFrom, dateTo, 10_000);
    const holdIds = await createHold(customer, unitId, dateFrom, dateTo, 1);

    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id;

    await expireListing(listingId);

    const getRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(bookingId);
    expect(getRes.body.data.listing_id).toBe(listingId);
  });
});

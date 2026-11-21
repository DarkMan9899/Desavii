/**
 * Restaurant menu pre-order (docs/BOOKING_WIDGET_REBUILD.md §5) over HTTP:
 * a table reservation alone, and a reservation that carries dishes from the
 * restaurant's own active menu — priced by the server, snapshotted at
 * booking time, paid at the restaurant (never charged) and visible to the
 * restaurant's partner only. Every abuse case is refused without losing
 * the customer's held table: another restaurant's dish, an inactive or
 * deleted dish, a changed price, tampered quantities, a pre-order on a
 * non-restaurant booking. Two simultaneous submits of the same held table
 * create exactly one booking.
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
const RESERVATION_TIME = '19:00';
const SUFFIX = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const SCRIPT_TITLE = '<img src=x onerror="alert(1)"> Dolma';

let pool;
let admin;
let vendor;
let customer;
let otherCustomer;
let otherOwner;
let partnerId;
let languageId;
let restaurantsCategoryId;
let toursCategoryId;
let today;
let dayOffset = 3;
const nextDay = () => {
  dayOffset += 1;
  return addIsoDays(today, dayOffset);
};

const as = (token, req) => req.set('Authorization', `Bearer ${token}`);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return res.body.data.access_token;
}

async function register(label) {
  const email = `preorder-${label}-${SUFFIX}@example.test`;
  const password = 'Preorder-Pass1!';
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Preorder',
    lastName: label,
  });
  return { userId: res.body.data.user.id, email, password };
}

async function createListing(listingType, categoryId, extra = {}) {
  const res = await as(vendor, request(app).post('/api/v1/listings')).send({
    partnerId,
    listingType,
    translations: [{ languageId, title: `Preorder ${listingType} ${SUFFIX}` }],
    categoryIds: [categoryId],
    pricing: { modelCode: 'PER_PERSON', amount: 6500, currencyCode: 'AMD' },
    ...extra,
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
  return listingId;
}

async function publish(listingId) {
  const res = await as(
    admin,
    request(app).post(`/api/v1/listings/${listingId}/publish`),
  ).send({ publicationPeriodDays: 90 });
  expect(res.status).toBe(200);
}

async function createUnit(listingId, bookableUnitType, capacity, extra = {}) {
  const res = await as(
    vendor,
    request(app).post('/api/v1/availability/units'),
  ).send({ listingId, bookableUnitType, capacity, ...extra });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function addItem(sectionId, title, priceAmount) {
  const res = await as(
    vendor,
    request(app).post(`/api/v1/listings/menu/sections/${sectionId}/items`),
  ).send({ title, priceAmount, priceCurrencyCode: 'AMD' });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

/** A published restaurant with one table and a two-section dinner menu. */
async function createRestaurant({ tables = 2 } = {}) {
  const listingId = await createListing('RESTAURANT', restaurantsCategoryId);
  const unitId = await createUnit(listingId, 'RESTAURANT_TABLE', tables);
  const menu = await as(
    vendor,
    request(app).post(`/api/v1/listings/${listingId}/menu`),
  ).send({ name: 'Dinner' });
  expect(menu.status).toBe(201);
  const section = async (title) => {
    const res = await as(
      vendor,
      request(app).post(`/api/v1/listings/menu/${menu.body.data.id}/sections`),
    ).send({ title });
    expect(res.status).toBe(201);
    return res.body.data.id;
  };
  const grill = await section('Grill');
  const desserts = await section('Desserts');
  const items = {
    khorovats: await addItem(grill, 'Khorovats', 12000),
    dolma: await addItem(grill, SCRIPT_TITLE, 4500),
    gata: await addItem(desserts, 'Gata', 1500),
  };
  await publish(listingId);
  return { listingId, unitId, menuId: menu.body.data.id, items };
}

function holdTable(token, unitId, date) {
  return as(token, request(app).post('/api/v1/booking-holds')).send({
    items: [
      {
        bookableUnitId: unitId,
        dateFrom: date,
        dateTo: date,
        startTime: RESERVATION_TIME,
      },
    ],
  });
}

async function heldTable(unitId, token = customer) {
  const res = rememberHoldQuotes(await holdTable(token, unitId, nextDay()));
  expect(res.status).toBe(201);
  return res.body.data.items[0].hold_ids;
}

function book(holdIds, item = {}, token = customer) {
  return as(token, request(app).post('/api/v1/bookings')).send({
    items: [quotedItem(holdIds, { guestCount: 4, ...item })],
    guestContactSnapshot: GUEST_CONTACT,
  });
}

const preorder = (selections, amount, currency = 'AMD') => ({
  menuSelections: selections,
  expectedMenuSubtotalAmount: amount,
  expectedMenuCurrency: currency,
});

const issues = (res) => (res.body.error?.details ?? []).map((d) => d.issue);

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
    "SELECT id, slug FROM listing_categories WHERE slug IN ('restaurants', 'tours')",
  );
  restaurantsCategoryId = categories.find((c) => c.slug === 'restaurants').id;
  toursCategoryId = categories.find((c) => c.slug === 'tours').id;
  today = (await businessNow(pool)).date;

  // A second, unrelated company (its owner must never see this pre-order).
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
      'Preorder B LLC',
      'Preorder B',
      `preorder-b-${SUFFIX}`,
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

describe('table only, and table with a pre-order', () => {
  test('a reservation alone has no pre-order and costs nothing', async () => {
    const { unitId } = await createRestaurant();
    const res = await book(await heldTable(unitId));
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].menu_preorder).toBeNull();
    expect(res.body.data.total_amount).toBe('0.00');
  });

  test('a pre-order is priced by the server, snapshotted, and paid at the restaurant — never charged', async () => {
    const { unitId, items } = await createRestaurant();
    const res = await book(
      await heldTable(unitId),
      preorder(
        [
          { menuItemId: items.khorovats, quantity: 2 },
          { menuItemId: items.gata, quantity: 3 },
        ],
        '28500.00',
      ),
    );
    expect(res.status).toBe(201);
    const [item] = res.body.data.items;
    expect(item.guest_count).toBe(4);
    expect(item.menu_preorder).toEqual({
      lines: [
        expect.objectContaining({
          menu_item_id: items.khorovats,
          title: 'Khorovats',
          section_title: 'Grill',
          quantity: 2,
          unit_price_amount: '12000.00',
          line_total_amount: '24000.00',
        }),
        expect.objectContaining({
          menu_item_id: items.gata,
          title: 'Gata',
          section_title: 'Desserts',
          quantity: 3,
          line_total_amount: '4500.00',
        }),
      ],
      subtotal_amount: '28500.00',
      currency: 'AMD',
      payment: 'PAY_AT_VENUE',
    });
    // The reservation stays free and payment-exempt.
    expect(res.body.data.total_amount).toBe('0.00');
    expect(res.body.data.payment_required).toBe(false);
  });

  test('a price sent by the client is ignored; only the menu prices', async () => {
    const { unitId, items } = await createRestaurant();
    const res = await book(await heldTable(unitId), {
      menuSelections: [
        { menuItemId: items.khorovats, quantity: 1, unitPriceAmount: '1.00' },
      ],
      expectedMenuSubtotalAmount: '1.00',
      expectedMenuCurrency: 'AMD',
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MENU_PRICE_CHANGED');
    expect(res.body.error.details.subtotal_amount).toBe('12000.00');
  });
});

describe('the menu changed while the customer was booking', () => {
  test('a changed price is refused with the current pre-order; the table stays held and the retry succeeds', async () => {
    const { unitId, items } = await createRestaurant();
    const holdIds = await heldTable(unitId);
    await as(
      vendor,
      request(app).patch(`/api/v1/listings/menu/items/${items.khorovats}`),
    ).send({ priceAmount: 13000 });

    const stale = await book(
      holdIds,
      preorder([{ menuItemId: items.khorovats, quantity: 1 }], '12000.00'),
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toEqual(
      expect.objectContaining({
        subtotal_amount: '13000.00',
        lines: [
          expect.objectContaining({
            unit_price_amount: '13000.00',
            line_total_amount: '13000.00',
          }),
        ],
      }),
    );
    const retried = await book(
      holdIds,
      preorder([{ menuItemId: items.khorovats, quantity: 1 }], '13000.00'),
    );
    expect(retried.status).toBe(201);
  });

  test.each([
    ['an inactive dish', 'item'],
    ['a dish of an inactive menu', 'menu'],
    ['a deleted dish', 'deleted'],
  ])(
    '%s is named as unavailable; dropping it keeps the reservation',
    async (_label, kind) => {
      const { unitId, menuId, items } = await createRestaurant();
      const holdIds = await heldTable(unitId);
      if (kind === 'item') {
        await as(
          vendor,
          request(app).patch(`/api/v1/listings/menu/items/${items.dolma}`),
        ).send({ isActive: false });
      } else if (kind === 'menu') {
        await as(
          vendor,
          request(app).patch(`/api/v1/listings/menu/${menuId}`),
        ).send({ isActive: false });
      } else {
        await as(
          vendor,
          request(app).delete(`/api/v1/listings/menu/items/${items.dolma}`),
        );
      }
      const refused = await book(
        holdIds,
        preorder([{ menuItemId: items.dolma, quantity: 1 }], '4500.00'),
      );
      expect(refused.status).toBe(422);
      expect(refused.body.error.details).toEqual([
        expect.objectContaining({
          issue: 'MENU_ITEM_UNAVAILABLE',
          menuItemId: items.dolma,
        }),
      ]);
      const withoutIt = await book(holdIds);
      expect(withoutIt.status).toBe(201);
    },
  );

  test('a later menu edit or deletion never rewrites a placed pre-order', async () => {
    const { unitId, items } = await createRestaurant();
    const placed = await book(
      await heldTable(unitId),
      preorder([{ menuItemId: items.gata, quantity: 2 }], '3000.00'),
    );
    expect(placed.status).toBe(201);
    await as(
      vendor,
      request(app).patch(`/api/v1/listings/menu/items/${items.gata}`),
    ).send({ title: 'Renamed', priceAmount: 9999 });
    const afterEdit = await as(
      vendor,
      request(app).get(`/api/v1/bookings/${placed.body.data.id}`),
    );
    expect(afterEdit.body.data.items[0].menu_preorder.lines[0]).toEqual(
      expect.objectContaining({
        title: 'Gata',
        unit_price_amount: '1500.00',
        menu_item_id: items.gata,
      }),
    );
    await as(
      vendor,
      request(app).delete(`/api/v1/listings/menu/items/${items.gata}`),
    );
    const afterDelete = await as(
      vendor,
      request(app).get(`/api/v1/bookings/${placed.body.data.id}`),
    );
    expect(afterDelete.body.data.items[0].menu_preorder.lines[0]).toEqual(
      expect.objectContaining({ title: 'Gata', menu_item_id: null }),
    );
  });
});

describe('abuse is refused, and the held table survives it', () => {
  test("another restaurant's dish cannot be paired with this table", async () => {
    const mine = await createRestaurant();
    const theirs = await createRestaurant();
    const holdIds = await heldTable(mine.unitId);
    const res = await book(
      holdIds,
      preorder(
        [{ menuItemId: theirs.items.khorovats, quantity: 1 }],
        '12000.00',
      ),
    );
    expect(res.status).toBe(422);
    expect(issues(res)).toEqual(['MENU_ITEM_UNAVAILABLE']);
    expect((await book(holdIds)).status).toBe(201);
  });

  test.each([
    ['zero portions', [{ quantity: 0 }]],
    ['negative portions', [{ quantity: -2 }]],
    ['more portions than allowed', [{ quantity: 21 }]],
    ['a huge quantity', [{ quantity: 2 ** 40 }]],
    ['a fractional quantity', [{ quantity: 1.5 }]],
    ['a malformed dish id', [{ menuItemId: "1' OR '1'='1" }]],
    ['a negative dish id', [{ menuItemId: -4 }]],
    ['the same dish twice', 'duplicate'],
    ['too many dishes', 'many'],
  ])('%s is refused (422)', async (_label, shape) => {
    const { unitId, items } = await createRestaurant();
    const base = { menuItemId: items.khorovats, quantity: 1 };
    let selections;
    if (shape === 'duplicate') selections = [base, base];
    else if (shape === 'many')
      selections = Array.from({ length: 31 }, (_, i) => ({
        menuItemId: items.khorovats + i,
        quantity: 1,
      }));
    else selections = [{ ...base, ...shape[0] }];
    const res = await book(
      await heldTable(unitId),
      preorder(selections, '1.00'),
    );
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toMatch(/sql|stack|at \w+ \(/i);
  });

  test('a pre-order without the confirmed subtotal is refused', async () => {
    const { unitId, items } = await createRestaurant();
    const res = await book(await heldTable(unitId), {
      menuSelections: [{ menuItemId: items.gata, quantity: 1 }],
    });
    expect(res.status).toBe(422);
  });

  test('a pre-order on a non-restaurant booking is refused', async () => {
    const tourId = await createListing('TOUR', toursCategoryId);
    const unitId = await createUnit(tourId, 'TOUR_DEPARTURE', 5);
    // Published directly: only the booking path is under test here.
    await pool.query(
      "UPDATE listings SET status_id = (SELECT id FROM listing_statuses WHERE code = 'PUBLISHED') WHERE id = ?",
      [tourId],
    );
    const { items } = await createRestaurant();
    const held = rememberHoldQuotes(
      await as(customer, request(app).post('/api/v1/booking-holds')).send({
        items: [
          { bookableUnitId: unitId, dateFrom: nextDay(), dateTo: nextDay() },
        ],
      }),
    );
    expect(held.status).toBe(201);
    const res = await book(held.body.data.items[0].hold_ids, {
      guestCount: 1,
      ...preorder([{ menuItemId: items.gata, quantity: 1 }], '1500.00'),
    });
    expect(res.status).toBe(422);
    expect(issues(res)).toContain('MENU_PREORDER_NOT_SUPPORTED');
  });

  test('script-shaped dish names are stored and returned as plain text', async () => {
    const { unitId, items } = await createRestaurant();
    const res = await book(
      await heldTable(unitId),
      preorder([{ menuItemId: items.dolma, quantity: 1 }], '4500.00'),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].menu_preorder.lines[0].title).toBe(
      SCRIPT_TITLE,
    );
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('who sees a pre-order', () => {
  test('the customer and the restaurant’s partner see it; another customer and another company never do', async () => {
    const { unitId, items } = await createRestaurant();
    const placed = await book(
      await heldTable(unitId),
      preorder([{ menuItemId: items.gata, quantity: 1 }], '1500.00'),
    );
    const { id } = placed.body.data;
    const read = (token) =>
      as(token, request(app).get(`/api/v1/bookings/${id}`));
    expect(
      (await read(customer)).body.data.items[0].menu_preorder,
    ).not.toBeNull();
    expect(
      (await read(vendor)).body.data.items[0].menu_preorder,
    ).not.toBeNull();
    expect((await read(otherCustomer)).status).toBe(404);
    expect((await read(otherOwner)).status).toBe(404);
  });
});

describe('concurrency', () => {
  test('two simultaneous submits of the same held table create exactly one booking', async () => {
    const { unitId, items } = await createRestaurant();
    const holdIds = await heldTable(unitId);
    const body = preorder([{ menuItemId: items.gata, quantity: 1 }], '1500.00');
    const responses = await Promise.all([
      book(holdIds, body),
      book(holdIds, body),
    ]);
    const statuses = responses.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.every((status) => status < 500)).toBe(true);
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM booking_items WHERE bookable_unit_id = ?`,
      [unitId],
    );
    expect(Number(total)).toBe(1);
    const [[{ lineCount }]] = await pool.query(
      `SELECT COUNT(*) AS lineCount FROM booking_item_menu_selections s
       JOIN booking_items bi ON bi.id = s.booking_item_id
       WHERE bi.bookable_unit_id = ?`,
      [unitId],
    );
    expect(Number(lineCount)).toBe(1);
  });

  test('two customers racing for the last table: exactly one holds it', async () => {
    const { unitId } = await createRestaurant({ tables: 1 });
    const date = nextDay();
    const responses = await Promise.all([
      holdTable(customer, unitId, date),
      holdTable(otherCustomer, unitId, date),
    ]);
    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([201, 409]);
  });
});

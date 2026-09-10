/**
 * Sprint I — Entertainment Venues. Architecture decision: category-only
 * (no new `listing_type`) — a partner picks the existing `ATTRACTION`
 * type plus the new `entertainment-venues` category, exactly the same
 * "one category, existing type" pattern Apartments/Villas/Guest Houses
 * already establish for `PROPERTY`. This proves that decision end to
 * end: the category is real seeded taxonomy, a listing can be
 * authored/published through it, it participates in category-filtered
 * search and CATEGORY_TOP promotion targeting, and the full booking
 * lifecycle (hold -> create -> confirm) works for its `TOUR_DEPARTURE`
 * bookable unit — the same reused unit/booking-type pair the existing
 * `attractions` category already uses (spec: no new bookable-unit or
 * booking-type vocabulary).
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

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

let pool;
let vendor;
let customer;
let admin;
let partnerId;
let languageId;
let categoryId;
let categoryTopProductId;

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
      listingType: 'ATTRACTION',
      translations: [{ languageId, title }],
      categoryIds: [categoryId],
    });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function registerUnit(listingId, capacity = 6) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'TOUR_DEPARTURE', capacity });
  expect(res.status).toBe(201);
  return res.body.data.id;
}

async function publishListing(id) {
  const patchRes = await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.1872, longitude: 44.5152 },
      policyValues: [{ code: 'children_allowed', value: 'true' }],
    });
  expect(patchRes.status).toBe(200);
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const res = await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
  expect(res.status).toBe(200);
}

async function setPrice(unitId, dateFrom, dateTo, amount) {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: 'AMD',
    });
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
  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[category]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'entertainment-venues'",
  );
  categoryId = category.id;
  const [[product]] = await pool.query(
    `SELECT ap.id FROM ad_products ap
     JOIN ad_placement_types apt ON apt.id = ap.ad_placement_type_id
     WHERE apt.code = 'CATEGORY_TOP' AND ap.duration_days = 7`,
  );
  categoryTopProductId = product.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Entertainment Venues taxonomy', () => {
  test('is real seeded category data with HY/RU/EN translations', async () => {
    const [rows] = await pool.query(
      `SELECT lct.language_id, l.code AS language_code, lct.name
       FROM listing_category_translations lct
       JOIN languages l ON l.id = lct.language_id
       WHERE lct.listing_category_id = ?`,
      [categoryId],
    );
    const byLocale = new Map(rows.map((r) => [r.language_code, r.name]));
    expect(byLocale.get('en')).toBe('Entertainment Venues');
    expect(byLocale.get('hy')).toBe('Ժամանցի վայրեր');
    expect(byLocale.get('ru')).toBe('Развлекательные заведения');
  });

  test('GET /search/categories includes it with a real listing_count field', async () => {
    const res = await request(app).get('/api/v1/search/categories');
    expect(res.status).toBe(200);
    const entertainment = res.body.data.find((c) => c.id === categoryId);
    expect(entertainment).toBeDefined();
    expect(entertainment.name).toBe('Entertainment Venues');
    expect(entertainment.listing_count).toEqual(expect.any(Number));
  });

  test('GET /listings/metadata?categoryId= returns the reused attribute/amenity/pricing/policy set', async () => {
    const res = await request(app).get(
      `/api/v1/listings/metadata?categoryId=${categoryId}`,
    );
    expect(res.status).toBe(200);
    const attributeCodes = res.body.data.attributes.map((a) => a.code);
    expect(attributeCodes).toEqual(
      expect.arrayContaining(['duration_minutes', 'max_group_size']),
    );
    const amenityNames = res.body.data.amenity_groups
      .flatMap((group) => group.amenities)
      .map((a) => a.code);
    expect(amenityNames).toEqual(expect.arrayContaining(['Air Conditioning']));
    const pricingModelCodes = res.body.data.pricing_models.map((p) => p.code);
    expect(pricingModelCodes).toEqual(
      expect.arrayContaining(['PER_PERSON', 'PER_HOUR']),
    );
  });
});

describe('Entertainment Venue listing lifecycle — ATTRACTION type, TOUR_DEPARTURE unit', () => {
  test('a partner can author, price, and publish one', async () => {
    const listingId = await createListing(`Escape Room Yerevan ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-07-01', '2027-12-31', 6_000);
    await publishListing(listingId);

    const detailRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.listing_type).toBe('ATTRACTION');
    expect(detailRes.body.data.status).toBe('PUBLISHED');
  });

  test('appears in category-filtered public search', async () => {
    const listingId = await createListing(`VR Arena Yerevan ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-07-01', '2027-12-31', 7_000);
    await publishListing(listingId);

    const res = await request(app).get(
      `/api/v1/search?categoryId=${categoryId}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.data.some((l) => l.id === listingId)).toBe(true);
  });

  test('the full booking lifecycle (hold -> create -> confirm) works for its TOUR_DEPARTURE unit', async () => {
    const listingId = await createListing(`Bowling Lane Yerevan ${Date.now()}`);
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-08-01', '2027-08-01', 5_000);
    await publishListing(listingId);

    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [
          {
            bookableUnitId: unitId,
            dateFrom: '2027-08-01',
            dateTo: '2027-08-01',
            quantity: 1,
          },
        ],
      });
    expect(holdRes.status).toBe(201);
    const holdIds = holdRes.body.data.items[0].hold_ids;

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
      });
    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.data.booking_type).toBe('TOUR_BOOKING');

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${bookingRes.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');
  });
});

describe('CATEGORY_TOP promotion can target Entertainment Venues', () => {
  test('an Admin can create a CATEGORY_TOP promotion for this category, and it shows in the public Top section without duplicating the normal grid', async () => {
    const listingId = await createListing(
      `Promoted Trampoline Park ${Date.now()}`,
    );
    const unitId = await registerUnit(listingId);
    await setPrice(unitId, '2027-07-01', '2027-12-31', 8_000);
    await publishListing(listingId);

    const promoRes = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'CATEGORY_TOP',
        categoryId,
        productId: categoryTopProductId,
        startDate: new Date().toISOString().slice(0, 10),
        markPaidNow: true,
      });
    expect(promoRes.status).toBe(201);
    expect(promoRes.body.data.placement_code).toBe('CATEGORY_TOP');

    const topRes = await request(app).get(
      `/api/v1/advertising/public/category-top?categoryId=${categoryId}&locale=en`,
    );
    expect(topRes.status).toBe(200);
    expect(topRes.body.data.some((l) => l.id === listingId)).toBe(true);

    const gridRes = await request(app).get(
      `/api/v1/search?categoryId=${categoryId}`,
    );
    expect(gridRes.body.data.some((l) => l.id === listingId)).toBe(false);
  });
});

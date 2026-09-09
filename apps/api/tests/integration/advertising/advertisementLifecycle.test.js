/**
 * Sprint E (TOP/Featured Listings + Promotion Engine). Exercises the
 * Advertising module end-to-end against the real seeded `advertisements`/
 * `ad_placement_types`/`ad_products`/`advertisement_statuses` schema
 * (migration 0010 + Sprint E's 0041 reminder-tracking columns): Admin
 * create/activate/extend/cancel, Home vs. Category placement
 * independence, overlap/date validation, authorization boundaries, and
 * the public query's server-authoritative "active" filtering (expired/
 * cancelled excluded, no duplicate between the Category-TOP section and
 * the normal category grid).
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
let listingId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function todayPlusDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  categoryId = category.id;

  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `Promotion Engine Test Hotel ${Date.now()}`,
          description: 'A hotel used only to exercise the promotion engine.',
        },
      ],
      categoryIds: [categoryId],
      location: { cityId: 1 },
    });
  listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /advertising/admin — authorization boundary', () => {
  test('a customer (no admin role) is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5,
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(res.status).toBe(403);
  });

  test('a partner owner (vendor, no admin role) is rejected — Sprint E has no partner self-service', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5,
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(res.status).toBe(403);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/api/v1/advertising/admin').send({});
    expect(res.status).toBe(401);
  });
});

describe('Admin promotion lifecycle — Home placement', () => {
  let homeAdId;

  test('create with markPaidNow walks the full state machine to ACTIVE in one call', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5, // 7-day HOMEPAGE_SECTION product, seeded
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status_code).toBe('ACTIVE');
    expect(res.body.data.placement_code).toBe('HOMEPAGE_SECTION');
    expect(res.body.data.payment_marked_paid_by).not.toBeNull();
    expect(res.body.data.approved_by).not.toBeNull();
    homeAdId = res.body.data.id;
  });

  test('appears in the public Home Featured section', async () => {
    const res = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(res.status).toBe(200);
    expect(res.body.data.some((l) => l.id === listingId)).toBe(true);
  });

  test('an overlapping request for the SAME listing/placement is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5,
        startDate: await todayPlusDays(1),
        markPaidNow: true,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROMOTION_PERIOD_OVERLAP');
  });

  test('extend pushes the SAME row forward, never creating a duplicate', async () => {
    const newEndDate = await todayPlusDays(30);
    const res = await request(app)
      .post(`/api/v1/advertising/admin/${homeAdId}/extend`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ endDate: newEndDate });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(homeAdId);
    expect(res.body.data.end_date).toBe(newEndDate);

    const listRes = await request(app)
      .get(`/api/v1/advertising/admin?listingId=${listingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(
      listRes.body.data.filter((ad) => ad.placement_code === 'HOMEPAGE_SECTION')
        .length,
    ).toBe(1);
  });

  test('extending with an earlier or equal end date is rejected', async () => {
    const res = await request(app)
      .post(`/api/v1/advertising/admin/${homeAdId}/extend`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ endDate: await todayPlusDays(0) });
    expect(res.status).toBe(422);
  });

  test('cancel removes it from public view immediately (server-authoritative on status)', async () => {
    const cancelRes = await request(app)
      .post(`/api/v1/advertising/admin/${homeAdId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status_code).toBe('CANCELLED');

    const publicRes = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(publicRes.body.data.some((l) => l.id === listingId)).toBe(false);
  });

  test('a terminal (cancelled) promotion cannot be cancelled or extended again', async () => {
    const cancelAgain = await request(app)
      .post(`/api/v1/advertising/admin/${homeAdId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(cancelAgain.status).toBe(409);

    const extendAgain = await request(app)
      .post(`/api/v1/advertising/admin/${homeAdId}/extend`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ endDate: await todayPlusDays(60) });
    expect(extendAgain.status).toBe(409);
  });
});

describe('Admin promotion lifecycle — Category placement is independent of Home', () => {
  let categoryAdId;

  test('a Category Top promotion can run alongside a separate Home request for the SAME listing, different dates', async () => {
    const homeRes = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5,
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(homeRes.status).toBe(201);

    const categoryRes = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'CATEGORY_TOP',
        categoryId,
        productId: 9, // 7-day CATEGORY_TOP product, seeded
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(categoryRes.status).toBe(201);
    expect(categoryRes.body.data.placement_code).toBe('CATEGORY_TOP');
    categoryAdId = categoryRes.body.data.id;
  });

  test('CATEGORY_TOP requires a categoryId the listing actually belongs to', async () => {
    const [[otherCategory]] = await pool.query(
      "SELECT id FROM listing_categories WHERE slug = 'tours'",
    );
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'CATEGORY_TOP',
        categoryId: otherCategory.id,
        productId: 9,
        startDate: await todayPlusDays(0),
        markPaidNow: true,
      });
    expect(res.status).toBe(422);
  });

  test('appears in the public Category Top section, and never duplicated in the normal category grid', async () => {
    const topRes = await request(app).get(
      `/api/v1/advertising/public/category-top?categoryId=${categoryId}&locale=en`,
    );
    expect(topRes.status).toBe(200);
    expect(topRes.body.data.some((l) => l.id === listingId)).toBe(true);

    const gridRes = await request(app).get(
      `/api/v1/search?categoryId=${categoryId}`,
    );
    expect(gridRes.status).toBe(200);
    expect(gridRes.body.data.some((l) => l.id === listingId)).toBe(false);
  });

  test('cancelling the Category promotion puts the listing back in the normal grid, without touching the still-active Home promotion', async () => {
    await request(app)
      .post(`/api/v1/advertising/admin/${categoryAdId}/cancel`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const gridRes = await request(app).get(
      `/api/v1/search?categoryId=${categoryId}`,
    );
    expect(gridRes.body.data.some((l) => l.id === listingId)).toBe(true);

    const homeRes = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(homeRes.body.data.some((l) => l.id === listingId)).toBe(true);
  });
});

describe('Listing/date validation', () => {
  test('a nonexistent listingId is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId: 999_999_999,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 5,
        startDate: await todayPlusDays(0),
      });
    expect(res.status).toBe(404);
  });

  test('a custom-period request without an explicit endDate is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/advertising/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        listingId,
        placementCode: 'HOMEPAGE_SECTION',
        productId: 8, // "Custom Period" — duration_days is NULL
        startDate: await todayPlusDays(90),
      });
    expect(res.status).toBe(422);
  });
});

describe('Server-authoritative public visibility — expired/scheduled rows never leak', () => {
  test('a row whose end_date is already in the past never appears publicly, even if its stored status is stale', async () => {
    // The prior describe block leaves a genuinely still-active
    // HOMEPAGE_SECTION promotion on `listingId` (proving Home/Category
    // independence there) — cancelled here first so THIS test's only
    // HOMEPAGE_SECTION row for this listing is the deliberately-stale
    // one being asserted on below.
    await pool.query(
      `UPDATE advertisements ad
       JOIN ad_placement_types apt ON apt.id = ad.ad_placement_type_id
       JOIN advertisement_statuses cancelled ON cancelled.code = 'CANCELLED'
       SET ad.status_id = cancelled.id
       WHERE ad.listing_id = ? AND apt.code = 'HOMEPAGE_SECTION'`,
      [listingId],
    );

    // Directly forces a stale ACTIVE row past its end_date — proves the
    // public query re-derives from dates rather than trusting a status
    // the sweep job simply hasn't gotten to yet (spec §14).
    const activeStatusId = await pool
      .query("SELECT id FROM advertisement_statuses WHERE code = 'ACTIVE'")
      .then(([rows]) => rows[0].id);
    const placementId = await pool
      .query(
        "SELECT id FROM ad_placement_types WHERE code = 'HOMEPAGE_SECTION'",
      )
      .then(([rows]) => rows[0].id);
    const productId = await pool
      .query(
        'SELECT id FROM ad_products WHERE ad_placement_type_id = ? AND duration_days = 7',
        [placementId],
      )
      .then(([rows]) => rows[0].id);
    const currencyId = await pool
      .query("SELECT id FROM currencies WHERE code = 'AMD'")
      .then(([rows]) => rows[0].id);
    const [insertResult] = await pool.query(
      `INSERT INTO advertisements
        (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id,
         price_snapshot_amount, currency_id, start_date, end_date, requested_by, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 1000, ?, DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_SUB(CURDATE(), INTERVAL 1 DAY), 1, 1, 1)`,
      [
        listingId,
        partnerId,
        placementId,
        productId,
        activeStatusId,
        currencyId,
      ],
    );
    const staleId = insertResult.insertId;

    const res = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(res.body.data.some((l) => l.id === listingId)).toBe(false);

    await pool.query('DELETE FROM advertisements WHERE id = ?', [staleId]);
  });
});

describe('Lifecycle sweep — reminder dedup (spec §15/§34, deterministic dates, no wall-clock waiting)', () => {
  let placementId;
  let productId;
  let currencyId;
  let statusIds;

  beforeAll(async () => {
    placementId = await pool
      .query(
        "SELECT id FROM ad_placement_types WHERE code = 'HOMEPAGE_SECTION'",
      )
      .then(([rows]) => rows[0].id);
    productId = await pool
      .query(
        'SELECT id FROM ad_products WHERE ad_placement_type_id = ? AND duration_days = 7',
        [placementId],
      )
      .then(([rows]) => rows[0].id);
    currencyId = await pool
      .query("SELECT id FROM currencies WHERE code = 'AMD'")
      .then(([rows]) => rows[0].id);
    const [rows] = await pool.query(
      "SELECT code, id FROM advertisement_statuses WHERE code IN ('ACTIVE','EXPIRED')",
    );
    statusIds = Object.fromEntries(rows.map((r) => [r.code, r.id]));
  });

  async function insertActiveAd({ endDateExpr }) {
    const [result] = await pool.query(
      `INSERT INTO advertisements
        (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id,
         price_snapshot_amount, currency_id, start_date, end_date, requested_by, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 1000, ?, DATE_SUB(CURDATE(), INTERVAL 1 DAY), ${endDateExpr}, 1, 1, 1)`,
      [
        listingId,
        partnerId,
        placementId,
        productId,
        statusIds.ACTIVE,
        currencyId,
      ],
    );
    return result.insertId;
  }

  test('a promotion entering the 7-day window gets exactly one reminder per sweep run, never a second on immediate re-run', async () => {
    const adId = await insertActiveAd({
      endDateExpr: 'DATE_ADD(CURDATE(), INTERVAL 7 DAY)',
    });

    const first = await services.advertisementService.runLifecycleSweep();
    expect(first.reminders7d).toBeGreaterThanOrEqual(1);

    const [[row1]] = await pool.query(
      'SELECT reminder_7d_sent_at FROM advertisements WHERE id = ?',
      [adId],
    );
    expect(row1.reminder_7d_sent_at).not.toBeNull();

    const second = await services.advertisementService.runLifecycleSweep();
    // Re-running immediately must not re-send: the row's own
    // reminder_7d_sent_at is now set, so it drops out of
    // `listDueForReminder`'s WHERE clause.
    const [[row2]] = await pool.query(
      'SELECT reminder_7d_sent_at FROM advertisements WHERE id = ?',
      [adId],
    );
    expect(row2.reminder_7d_sent_at.getTime()).toBe(
      row1.reminder_7d_sent_at.getTime(),
    );
    expect(second.reminders7d).toBe(0);

    await pool.query('DELETE FROM advertisements WHERE id = ?', [adId]);
  });

  test('a promotion entering the 2-day window gets its own independent reminder', async () => {
    const adId = await insertActiveAd({
      endDateExpr: 'DATE_ADD(CURDATE(), INTERVAL 2 DAY)',
    });

    const result = await services.advertisementService.runLifecycleSweep();
    expect(result.reminders2d).toBeGreaterThanOrEqual(1);

    const [[row]] = await pool.query(
      'SELECT reminder_2d_sent_at, reminder_7d_sent_at FROM advertisements WHERE id = ?',
      [adId],
    );
    expect(row.reminder_2d_sent_at).not.toBeNull();
    // 2 days out is not also within the 7-day-exactly threshold check
    // (listDueForReminder(7) requires end_date <= CURDATE()+7 — 2 days
    // out DOES satisfy that too) — both may legitimately fire the first
    // time a promotion is swept this close to expiry; what must never
    // happen is a THIRD sweep re-sending either. Covered by the dedup
    // test above for the 7-day column; here only the 2-day fire itself
    // is asserted.

    await pool.query('DELETE FROM advertisements WHERE id = ?', [adId]);
  });

  test('an ACTIVE promotion past its end_date is swept to EXPIRED', async () => {
    const adId = await insertActiveAd({
      endDateExpr: 'DATE_SUB(CURDATE(), INTERVAL 1 DAY)',
    });

    const result = await services.advertisementService.runLifecycleSweep();
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const [[row]] = await pool.query(
      'SELECT status_id FROM advertisements WHERE id = ?',
      [adId],
    );
    expect(row.status_id).toBe(statusIds.EXPIRED);

    await pool.query('DELETE FROM advertisements WHERE id = ?', [adId]);
  });
});

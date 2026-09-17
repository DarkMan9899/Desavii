/**
 * Listing Lifetime / Renewal, Step B4 — cross-surface public-visibility
 * enforcement. Every public-facing listing read that filters on PUBLISHED
 * status must also exclude an expired/frozen listing (`listingVisibilitySql
 * .js`'s canonical predicate). This file proves that contract end-to-end
 * against the real HTTP surface for every distinct query site the B1 audit
 * identified, using ONE shared fixture listing rather than duplicating
 * setup per surface.
 *
 * Deliberately never runs the expiry sweep — `expires_at` is pushed into
 * the past by direct SQL and every assertion below happens with `frozen_at`
 * still NULL. This is the stronger, more important test: public visibility
 * must never depend on the hourly sweep having already run (brief §9/§21).
 * The sweep's own STORED-state transition is covered separately by
 * `listingCrud.test.js`'s "Listing expiration sweep — Step B4" block.
 *
 * Surfaces NOT given their own HTTP test here because they have no
 * separate backend query path (confirmed by the B1 audit):
 * - Related/Recommendations (`RelatedListings.jsx`, the AI recommendation
 *   service) both reuse `SearchService#searchListings` — already proven by
 *   the keyword-search test below.
 * - Sitemap/prerender discovery (`apps/web/scripts/lib/fetchRouteManifest
 *   .mjs`) is an anonymous HTTP call to `GET /search` — same proof.
 * - Home's "Popular"/"newest" strip also reuses `GET /search`.
 * TOP/promotion hydration has its own dedicated test in
 * `advertisementLifecycle.test.js` (needs an active promotion fixture,
 * which belongs to that module).
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
let partnerId;
let partnerSlug;
let listingId;
let uniqueTitle;
let hotelsCategorySlug;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function categoryListingCount(slug) {
  const res = await request(app).get('/api/v1/search/categories?locale=en');
  const row = res.body.data.find((c) => c.slug === slug);
  return row.listing_count;
}

async function companyListingCount(slug) {
  const res = await request(app).get(`/api/v1/partners/${slug}`);
  return res.body.data.listing_count;
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

  const [[partnerRow]] = await pool.query(
    "SELECT id, slug FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  partnerSlug = partnerRow.slug;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  const [[hotelsCategory]] = await pool.query(
    "SELECT id, slug FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategorySlug = hotelsCategory.slug;
  const [[yerevan]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'yerevan'",
  );

  uniqueTitle = `B4VisibilityFixture ${Date.now()}`;
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId: language.id,
          title: uniqueTitle,
          description: `${uniqueTitle} — a lovely place to stay.`,
        },
      ],
      categoryIds: [hotelsCategory.id],
      location: { cityId: yerevan.id },
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
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 30 });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Listing Lifetime / Renewal, Step B4 — public visibility across every surface', () => {
  test('sanity check: the fixture is publicly visible before it expires', async () => {
    const searchRes = await request(app).get(
      `/api/v1/search?keyword=${encodeURIComponent(uniqueTitle)}`,
    );
    expect(searchRes.body.data.some((l) => l.id === listingId)).toBe(true);

    const detailRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(detailRes.status).toBe(200);
  });

  test('an expired fixture (its expires_at passing, sweep NOT run) is removed from every public surface', async () => {
    // The hard, DB-time-not-scheduler-time gate — `frozen_at` is
    // deliberately left NULL throughout this whole test.
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [listingId],
    );

    // SEARCH (also proves Category/Home/Related/Sitemap — see file header).
    const searchRes = await request(app).get(
      `/api/v1/search?keyword=${encodeURIComponent(uniqueTitle)}`,
    );
    expect(searchRes.body.data.some((l) => l.id === listingId)).toBe(false);

    // TYPEAHEAD.
    const suggestRes = await request(app).get(
      `/api/v1/search/suggestions?q=${encodeURIComponent(uniqueTitle.slice(0, 12))}`,
    );
    expect(suggestRes.body.data.some((s) => s.id === listingId)).toBe(false);

    // COMPANY PUBLIC PROFILE — both the listing list and its own count.
    const companyListingsRes = await request(app).get(
      `/api/v1/partners/${partnerSlug}/listings`,
    );
    expect(companyListingsRes.body.data.some((l) => l.id === listingId)).toBe(
      false,
    );

    // PUBLIC LISTING DETAIL — the same 404-never-leaks-existence path a
    // DRAFT listing already uses.
    const detailRes = await request(app).get(`/api/v1/listings/${listingId}`);
    expect(detailRes.status).toBe(404);
  });

  test('the category and company listing counts each drop by exactly 1 once the fixture expires', async () => {
    // A second, independent fixture the FIRST test's shared listing
    // doesn't interfere with — isolates the exact before/after delta
    // rather than depending on the whole seeded catalog's absolute count.
    const [[language]] = await pool.query(
      "SELECT id FROM languages WHERE code = 'en'",
    );
    const [[hotelsCategory]] = await pool.query(
      "SELECT id FROM listing_categories WHERE slug = 'hotels'",
    );
    const [[yerevan]] = await pool.query(
      "SELECT id FROM cities WHERE slug = 'yerevan'",
    );
    const title = `B4CountDelta ${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [{ languageId: language.id, title }],
        categoryIds: [hotelsCategory.id],
        location: { cityId: yerevan.id },
      });
    const countListingId = createRes.body.data.id;
    await request(app)
      .patch(`/api/v1/listings/${countListingId}`)
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
      .post(`/api/v1/listings/${countListingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId: countListingId, bookableUnitType: 'HOTEL_ROOM' });
    await request(app)
      .post(`/api/v1/listings/${countListingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });

    const categoryBefore = await categoryListingCount(hotelsCategorySlug);
    const companyBefore = await companyListingCount(partnerSlug);

    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [countListingId],
    );

    const categoryAfter = await categoryListingCount(hotelsCategorySlug);
    const companyAfter = await companyListingCount(partnerSlug);

    expect(categoryAfter).toBe(categoryBefore - 1);
    expect(companyAfter).toBe(companyBefore - 1);
  });
});

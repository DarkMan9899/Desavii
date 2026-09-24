/**
 * Step M2A — public visibility hardening for two listing child-resource
 * reads that, before this step, had NO visibility check at all: `GET
 * /listings/:id/menu` and `GET /listings/:id/opening-hours` only verified
 * the listing wasn't soft-deleted, so any DRAFT/PENDING_REVIEW/UNPUBLISHED/
 * ARCHIVED/frozen/expired listing's full menu (names/descriptions/prices)
 * or weekly hours were fetchable by anyone who knew/guessed the listing
 * id — independent of any moderation feature, a live gap today.
 *
 * Both endpoints now reuse `ListingService#getListing`'s exact visibility
 * rule (the same one `GET /listings/:id` itself uses), the same
 * established pattern `ListingService#listMedia` already uses for its own
 * child-resource read — see `RestaurantMenuService#getMenusForListing`'s
 * own doc comment.
 *
 * Every non-PUBLISHED-active fixture below carries REAL menu/opening-hours
 * content (created via the real, unrestricted owner-write path — those
 * write methods never checked status and still don't; only the anonymous
 * PUBLIC READ is being hardened here) so a masked 404 here is a genuine
 * proof that real data does not leak, not merely an "empty either way"
 * result.
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
let partnerId;
let languageId;
let restaurantCategoryId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

/** Creates a DRAFT restaurant listing, then authors real menu + opening-hours content on it via the real owner-write path (unrestricted by status today, on purpose — only the public READ is being hardened). */
async function createListingWithRealContent(label) {
  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'RESTAURANT',
      translations: [
        {
          languageId,
          title: `M2A ${label} ${Date.now()}`,
          summary: 'Public child-resource visibility fixture.',
        },
      ],
      categoryIds: [restaurantCategoryId],
    });
  const listingId = createRes.body.data.id;

  const menuRes = await request(app)
    .post(`/api/v1/listings/${listingId}/menu`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ name: 'Dinner Menu' });
  const menuId = menuRes.body.data.id;

  const sectionRes = await request(app)
    .post(`/api/v1/listings/menu/${menuId}/sections`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ title: 'Mains' });
  const sectionId = sectionRes.body.data.id;

  await request(app)
    .post(`/api/v1/listings/menu/sections/${sectionId}/items`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      title: `Secret Dish ${label}`,
      priceAmount: 4200,
      priceCurrencyCode: 'AMD',
    });

  await request(app)
    .put(`/api/v1/listings/${listingId}/opening-hours`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ days: [{ dayOfWeek: 1, opensAt: '11:00', closesAt: '23:00' }] });

  return listingId;
}

async function setListingState(
  listingId,
  { statusCode, frozenAt = null, expiresAt = null, deletedAt = null },
) {
  await pool.query(
    `UPDATE listings
     SET status_id = (SELECT id FROM listing_statuses WHERE code = ?),
         frozen_at = ?,
         expires_at = ?,
         deleted_at = ?
     WHERE id = ?`,
    [statusCode, frozenAt, expiresAt, deletedAt, listingId],
  );
}

function getMenu(listingId) {
  return request(app).get(`/api/v1/listings/${listingId}/menu?locale=en`);
}

function getOpeningHours(listingId) {
  return request(app).get(`/api/v1/listings/${listingId}/opening-hours`);
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
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[restaurantCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'restaurants'",
  );
  restaurantCategoryId = restaurantCategory.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Public child-resource visibility (Step M2A)', () => {
  test('PUBLISHED + active: menu and opening-hours are accessible with real content', async () => {
    const listingId = await createListingWithRealContent('published');
    await setListingState(listingId, { statusCode: 'PUBLISHED' });

    const menuRes = await getMenu(listingId);
    expect(menuRes.status).toBe(200);
    expect(menuRes.body.data[0].sections[0].items[0].title).toBe(
      'Secret Dish published',
    );

    const hoursRes = await getOpeningHours(listingId);
    expect(hoursRes.status).toBe(200);
    expect(hoursRes.body.data).toEqual([
      {
        day_of_week: 1,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: false,
      },
    ]);
  }, 30_000);

  test('DRAFT: menu and opening-hours are masked (404), never leaking content', async () => {
    const listingId = await createListingWithRealContent('draft');
    await setListingState(listingId, { statusCode: 'DRAFT' });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('PENDING_REVIEW: menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('pending-review');
    await setListingState(listingId, { statusCode: 'PENDING_REVIEW' });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('UNPUBLISHED: menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('unpublished');
    await setListingState(listingId, { statusCode: 'UNPUBLISHED' });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('ARCHIVED: menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('archived');
    await setListingState(listingId, { statusCode: 'ARCHIVED' });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('FROZEN (status PUBLISHED, frozen_at set): menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('frozen');
    await setListingState(listingId, {
      statusCode: 'PUBLISHED',
      frozenAt: '2024-01-01 00:00:00.000',
    });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('EXPIRED (status PUBLISHED, expires_at in the past): menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('expired');
    await setListingState(listingId, {
      statusCode: 'PUBLISHED',
      expiresAt: '2020-01-01 00:00:00.000',
    });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('SOFT-DELETED (status PUBLISHED, deleted_at set): menu and opening-hours are masked (404)', async () => {
    const listingId = await createListingWithRealContent('soft-deleted');
    await setListingState(listingId, {
      statusCode: 'PUBLISHED',
      deletedAt: '2024-01-01 00:00:00.000',
    });

    expect((await getMenu(listingId)).status).toBe(404);
    expect((await getOpeningHours(listingId)).status).toBe(404);
  }, 30_000);

  test('consistency: every masked state produces the same 404 the public listing detail endpoint itself produces', async () => {
    const listingId = await createListingWithRealContent('consistency');
    await setListingState(listingId, { statusCode: 'DRAFT' });

    const detailRes = await request(app).get(`/api/v1/listings/${listingId}`);
    const menuRes = await getMenu(listingId);
    const hoursRes = await getOpeningHours(listingId);

    expect(detailRes.status).toBe(404);
    expect(menuRes.status).toBe(404);
    expect(hoursRes.status).toBe(404);
    // Same non-enumerating message on all three — never a distinguishing
    // "listing exists but is unpublished" variant.
    expect(menuRes.body.error.message).toBe(detailRes.body.error.message);
    expect(hoursRes.body.error.message).toBe(detailRes.body.error.message);
  }, 30_000);

  test('the owner can still fetch their own non-public listing menu/opening-hours (authenticated management flow is unaffected)', async () => {
    const listingId = await createListingWithRealContent('owner-management');
    await setListingState(listingId, { statusCode: 'DRAFT' });

    const menuRes = await request(app)
      .get(`/api/v1/listings/${listingId}/menu?locale=en`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(menuRes.status).toBe(200);
    expect(menuRes.body.data[0].sections[0].items[0].title).toBe(
      'Secret Dish owner-management',
    );

    const hoursRes = await request(app)
      .get(`/api/v1/listings/${listingId}/opening-hours`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(hoursRes.status).toBe(200);
    expect(hoursRes.body.data).toHaveLength(1);
  }, 30_000);
});

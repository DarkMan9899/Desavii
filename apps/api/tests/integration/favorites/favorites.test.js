/**
 * Phase 12 (Product Polish): the Favorites module's first real endpoints —
 * `POST /favorites`, `GET /favorites/ids`, `GET /favorites`,
 * `DELETE /favorites/:listingId`. Uses the seeded, already-published
 * demo listing (`seedAll()`'s baseline) rather than publishing a new one,
 * since favoriting has no lifecycle prerequisite the way reviewing does.
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

let vendor;
let customer;
let listingId;

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

  const pool = getMysqlPool();
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );

  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId: partnerRow.id,
      listingType: 'HOTEL',
      translations: [
        { languageId: language.id, title: `Favoritable Listing ${Date.now()}` },
      ],
    });
  listingId = listingRes.body.data.id;
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1 });
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Favorites', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/favorites')
      .send({ listingId });
    expect(res.status).toBe(401);
  });

  test('adds, lists, and removes a favorite', async () => {
    const addRes = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });
    expect(addRes.status).toBe(204);

    const idsRes = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(idsRes.status).toBe(200);
    expect(idsRes.body.data).toContain(listingId);

    const listRes = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ listing_id: listingId }),
      ]),
    );
    // Card-composition-closure fix — `category_slug` and the shared card
    // metadata fields now reach the live response end to end, same shape
    // as `GET /search` (`searchDto.js`'s own `toSearchResultResponse`).
    // This listing carries no explicit category assignment, so the real,
    // non-fabricated value is `null` — the point is the SQL join doesn't
    // error and the DTO always exposes the key.
    const favoritedListing = listRes.body.data.find(
      (item) => item.listing_id === listingId,
    );
    expect(favoritedListing).toEqual(
      expect.objectContaining({
        category_slug: null,
        cuisine: null,
        price_tier: null,
        star_rating: null,
        transmission: null,
        bedrooms: null,
        duration_minutes: null,
      }),
    );

    const removeRes = await request(app)
      .delete(`/api/v1/favorites/${listingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(removeRes.status).toBe(204);

    const idsAfterRes = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(idsAfterRes.body.data).not.toContain(listingId);
  });

  test('adding the same listing twice does not create a duplicate row', async () => {
    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });
    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });

    const idsRes = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    const occurrences = idsRes.body.data.filter((id) => id === listingId);
    expect(occurrences).toHaveLength(1);
  });
});

// Listing Lifetime / Renewal, Step B4 (brief §16/§25): the locked product
// decision is FILTER, never DELETE — a listing that expires/freezes must
// disappear from the customer's public Favorites list, but the underlying
// `favorites` row is preserved so a later renewal (Step B5) makes it
// reappear automatically. Uses its own dedicated listing (never the shared
// `listingId` above, whose favorite-relation state the earlier tests in
// this file already leave in a specific way).
describe('Favorites — Step B4 expiry filtering', () => {
  let expiringListingId;

  beforeAll(async () => {
    const pool = getMysqlPool();
    const [[partnerRow]] = await pool.query(
      "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
    );
    const [[language]] = await pool.query(
      "SELECT id FROM languages WHERE code = 'en'",
    );

    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerRow.id,
        listingType: 'HOTEL',
        translations: [
          {
            languageId: language.id,
            title: `B4 Expiring Favorite ${Date.now()}`,
          },
        ],
      });
    expiringListingId = listingRes.body.data.id;
    await request(app)
      .patch(`/api/v1/listings/${expiringListingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
    await request(app)
      .post(`/api/v1/listings/${expiringListingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);
    await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        listingId: expiringListingId,
        bookableUnitType: 'HOTEL_ROOM',
        capacity: 1,
      });
    await request(app)
      .post(`/api/v1/listings/${expiringListingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
  }, 60_000);

  test('an expired/frozen listing disappears from Favorites, but the favorite relation itself is preserved', async () => {
    const pool = getMysqlPool();

    // 1. Customer favorites the still-published listing.
    const addRes = await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId: expiringListingId });
    expect(addRes.status).toBe(204);

    // 2. It's public → appears in Favorites.
    const beforeRes = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(
      beforeRes.body.data.some((item) => item.listing_id === expiringListingId),
    ).toBe(true);

    // 3. It expires and the real sweep freezes it (PUBLISHED ->
    // UNPUBLISHED + frozen_at/purge_after) — the end-to-end scheduled
    // path, not just a raw column edit.
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [expiringListingId],
    );
    const sweepResult = await services.listingService.runExpirySweep();
    expect(sweepResult.frozen).toBeGreaterThanOrEqual(1);

    // No longer appears in Favorites.
    const afterRes = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(
      afterRes.body.data.some((item) => item.listing_id === expiringListingId),
    ).toBe(false);

    // 4. The favorite DB relation itself still exists — never deleted.
    const [[favoriteRow]] = await pool.query(
      'SELECT id FROM favorites WHERE listing_id = ? AND customer_user_id = (SELECT id FROM users WHERE email = ?)',
      [expiringListingId, DEV_CREDENTIALS.customer.email],
    );
    expect(favoriteRow).toBeDefined();

    // `GET /favorites/ids` (heart-toggle hydration) is deliberately
    // status-unfiltered — it must keep reporting the relationship exists
    // so the UI still shows a filled heart if the customer ever navigates
    // straight to this listing's own (otherwise-404) detail page.
    const idsRes = await request(app)
      .get('/api/v1/favorites/ids')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(idsRes.body.data).toContain(expiringListingId);
  });
});

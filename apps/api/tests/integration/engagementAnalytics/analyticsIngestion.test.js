/**
 * Step A2 — `POST /analytics/events` with collection FORCED ON.
 * `ANALYTICS_COLLECTION_ENABLED` must be set BEFORE `app.js`/`config/
 * index.js` are ever evaluated (`cleanEnv` reads `process.env` once, at
 * import time), so every static top-level import that would transitively
 * import config is avoided in favor of a dynamic `import()` inside
 * `beforeAll` — the same established pattern
 * `tests/integration/payments/paymentLifecycle.test.js` uses for
 * `PAYMENTS_ENABLED`. Jest gives each test file its own module registry,
 * so this never leaks into `analyticsCollectionDisabled.test.js`.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { v4 as uuid } from 'uuid';

let app;
let up;
let seedAll;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

let pool;
let vendor;
let admin;
let partnerId;
let languageId;
let listingId;
let promotionId;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

beforeAll(async () => {
  process.env.ANALYTICS_COLLECTION_ENABLED = 'true';

  ({ default: app } = await import('../../../src/app.js'));
  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ getMysqlPool, closeMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js'));
  ({ closeRedisConnection } =
    await import('../../../src/infrastructure/cache/redisClient.js'));
  ({ resetRateLimits } = await import('../helpers/resetRateLimits.js'));
  ({ DEV_CREDENTIALS } =
    await import('../../../src/infrastructure/database/seeds/005_dev_accounts.js'));

  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
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

  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        { languageId, title: `Analytics Ingestion Test Hotel ${Date.now()}` },
      ],
      categoryIds: [category.id],
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
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  const todayStr = new Date().toISOString().slice(0, 10);
  const promoRes = await request(app)
    .post('/api/v1/advertising/admin')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      listingId,
      placementCode: 'HOMEPAGE_SECTION',
      productId: 5,
      startDate: todayStr,
      markPaidNow: true,
    });
  promotionId = promoRes.body.data.id;
}, 60_000);

afterAll(async () => {
  delete process.env.ANALYTICS_COLLECTION_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

async function fetchEvent(eventId) {
  const [rows] = await pool.query(
    'SELECT * FROM analytics_events WHERE event_id = ?',
    [eventId],
  );
  return rows[0] ?? null;
}

describe('POST /analytics/events — collection enabled', () => {
  test('a genuine listing_impression is written with server-resolved partner_id, DB-authoritative occurred_at, and derived device/traffic classification', async () => {
    const eventId = uuid();
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
      .send({
        events: [
          {
            eventId,
            eventName: 'listing_impression',
            sessionId: uuid(),
            listingId,
            placement: 'search_results',
          },
        ],
      });
    expect(res.status).toBe(204);

    const row = await fetchEvent(eventId);
    expect(row).not.toBeNull();
    expect(row.event_name).toBe('listing_impression');
    expect(row.listing_id).toBe(listingId);
    expect(row.partner_id).toBe(partnerId);
    expect(row.device_class).toBe('desktop');
    expect(row.traffic_source).toBe('direct');
    expect(row.occurred_at).toBeTruthy();
  });

  test('a client cannot submit a server-authoritative event name (favorite_added) — 422, nothing written', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: uuid(),
            eventName: 'favorite_added',
            sessionId: uuid(),
            listingId,
          },
        ],
      });
    expect(res.status).toBe(422);
  });

  test('a spoofed/nonexistent listing_id is rejected generically (422), not distinguishable from a real 404', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: uuid(),
            eventName: 'listing_viewed',
            sessionId: uuid(),
            listingId: 999_999_999,
          },
        ],
      });
    expect(res.status).toBe(422);
    // Anti-enumeration: never a distinguishing message from this endpoint.
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  test('one bad event in a batch rejects the whole batch — all-or-nothing', async () => {
    const goodEventId = uuid();
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: goodEventId,
            eventName: 'listing_viewed',
            sessionId: uuid(),
            listingId,
          },
          {
            eventId: uuid(),
            eventName: 'listing_viewed',
            sessionId: uuid(),
            listingId: 999_999_999,
          },
        ],
      });
    expect(res.status).toBe(422);
    expect(await fetchEvent(goodEventId)).toBeNull();
  });

  test('promotion_impression resolves the promotion server-side and stores promotion_id/partner_id', async () => {
    const eventId = uuid();
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId,
            eventName: 'promotion_impression',
            sessionId: uuid(),
            listingId,
            promotionId,
            placement: 'home_featured',
          },
        ],
      });
    expect(res.status).toBe(204);
    const row = await fetchEvent(eventId);
    expect(row.promotion_id).toBe(promotionId);
    expect(row.partner_id).toBe(partnerId);
  });

  test('a promotion_id that does not belong to the supplied listing_id is rejected', async () => {
    const otherListingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [{ languageId, title: `Mismatch Listing ${Date.now()}` }],
      });
    const otherListingId = otherListingRes.body.data.id;

    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: uuid(),
            eventName: 'promotion_impression',
            sessionId: uuid(),
            listingId: otherListingId,
            promotionId,
            placement: 'home_featured',
          },
        ],
      });
    expect(res.status).toBe(422);
  });

  test('company_profile_view resolves company_slug server-side to a partner_id', async () => {
    const eventId = uuid();
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId,
            eventName: 'company_profile_view',
            sessionId: uuid(),
            companySlug: 'yerevan-boutique-hospitality',
          },
        ],
      });
    expect(res.status).toBe(204);
    const row = await fetchEvent(eventId);
    expect(row.partner_id).toBe(partnerId);
    expect(row.listing_id).toBeNull();
  });

  test('an unknown company_slug is rejected generically', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: uuid(),
            eventName: 'company_profile_view',
            sessionId: uuid(),
            companySlug: 'this-company-does-not-exist',
          },
        ],
      });
    expect(res.status).toBe(422);
  });

  test('ADMIN traffic is silently filtered — 204, but no row written', async () => {
    const eventId = uuid();
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        events: [
          {
            eventId,
            eventName: 'listing_viewed',
            sessionId: uuid(),
            listingId,
          },
        ],
      });
    expect(res.status).toBe(204);
    expect(await fetchEvent(eventId)).toBeNull();
  });

  test('semantic dedup: a second listing_impression for the same session/listing/placement (different event_id) writes no second row', async () => {
    const sessionId = uuid();
    const firstEventId = uuid();
    const secondEventId = uuid();

    const first = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: firstEventId,
            eventName: 'listing_impression',
            sessionId,
            listingId,
            placement: 'category_top',
          },
        ],
      });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: secondEventId,
            eventName: 'listing_impression',
            sessionId,
            listingId,
            placement: 'category_top',
          },
        ],
      });
    expect(second.status).toBe(204);

    expect(await fetchEvent(firstEventId)).not.toBeNull();
    expect(await fetchEvent(secondEventId)).toBeNull();
  });

  test('event_id retry: resubmitting the exact same event_id is an idempotent no-op, not a 500', async () => {
    const eventId = uuid();
    const payload = {
      events: [
        {
          eventId,
          eventName: 'listing_viewed',
          sessionId: uuid(),
          listingId,
        },
      ],
    };
    const first = await request(app)
      .post('/api/v1/analytics/events')
      .send(payload);
    const second = await request(app)
      .post('/api/v1/analytics/events')
      .send(payload);
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const [rows] = await pool.query(
      'SELECT COUNT(*) AS count FROM analytics_events WHERE event_id = ?',
      [eventId],
    );
    expect(rows[0].count).toBe(1);
  });

  test('never persists a raw User-Agent or Referer value', async () => {
    const eventId = uuid();
    await request(app)
      .post('/api/v1/analytics/events')
      .set('User-Agent', 'SomeVeryDistinctiveTestUserAgentString/1.0')
      .set(
        'Referer',
        'https://example.com/some/distinctive/path?utm_source=test',
      )
      .send({
        events: [
          {
            eventId,
            eventName: 'listing_viewed',
            sessionId: uuid(),
            listingId,
          },
        ],
      });
    const row = await fetchEvent(eventId);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain('SomeVeryDistinctiveTestUserAgentString');
    expect(serialized).not.toContain('utm_source');
    expect(serialized).not.toContain('example.com');
  });
});

/**
 * Listing Lifetime / Renewal, Step B7 — the final retention-purge stage's
 * historical-dependency safety net. `listingCrud.test.js`'s own "Listing
 * retention purge — Step B7" block covers the core eligibility matrix,
 * purge mechanics, and Renew-vs-Purge races; this file exists purely to
 * prove the one thing that block can't, on its own, exercise: a single
 * due-for-purge listing carrying real booking/review/favorite/promotion/
 * payment history, and that NONE of it is touched by the purge — only the
 * `listings` row's own `deleted_at` ever changes (brief §8/§9/§14-§18/§31).
 *
 * Builds the booking through to a real captured payment and a COMPLETED
 * status (mirroring `payments/paymentLifecycle.test.js`'s manual-capture
 * flow and `reviews/reviews.test.js`'s own `createCompletedBooking`
 * precedent respectively) so this one fixture can carry every one of the
 * dependency types the brief asks for, rather than four separate partial
 * fixtures across four files.
 *
 * Explicitly opts into `PAYMENTS_ENABLED=true` before any static import
 * evaluates config — the exact same "force the env var this file's own
 * module registry needs before any static import evaluates config"
 * pattern `payments/paymentLifecycle.test.js` already established (there,
 * on; `paymentsDisabledGate.test.js`, off), so every other test file in
 * the same `--runInBand` worker keeps seeing the real launch default.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

let up;
let seedAll;
let app;
let services;
let getMysqlPool;
let closeMysqlPool;
let closeRedisConnection;
let resetRateLimits;
let DEV_CREDENTIALS;

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };

let pool;
let vendor;
let customer;
let partnerId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

beforeAll(async () => {
  process.env.PAYMENTS_ENABLED = 'true';

  ({ up } = await import('../../../src/infrastructure/database/migrate.js'));
  ({ seedAll } =
    await import('../../../src/infrastructure/database/seeds/index.js'));
  ({ default: app, services } = await import('../../../src/app.js'));
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
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 60_000);

afterAll(async () => {
  delete process.env.PAYMENTS_ENABLED;
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Listing retention purge — Step B7 — historical dependency safety', () => {
  test('a due-for-purge listing carrying a booking (with captured payment), a review, a favorite, and an active promotion purges cleanly, and every one of those rows survives untouched', async () => {
    // 1. Build the listing, a bookable unit, and priced availability.
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [
          {
            languageId,
            title: `B7 Retention Fixture ${Date.now()}`,
          },
        ],
      });
    const listingId = listingRes.body.data.id;

    await request(app)
      .patch(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
    await request(app)
      .post(`/api/v1/listings/${listingId}/media`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .set('Content-Type', 'image/png')
      .send(ONE_PX_PNG);

    const unitRes = await request(app)
      .post('/api/v1/availability/units')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity: 1 });
    const unitId = unitRes.body.data.id;

    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

    const dateFrom = '2027-02-10';
    const dateTo = '2027-02-12';
    await request(app)
      .post('/api/v1/availability')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId,
        dateFrom,
        dateTo,
        status: 'AVAILABLE',
        priceOverrideAmount: 9_000,
        priceOverrideCurrency: 'AMD',
      });

    // 2. Favorite it (before any of the rest — matches the real order a
    // customer would actually favorite, book, then review in).
    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });

    // 3. Book it, pay for it (manual-capture: AUTHORIZED before confirm,
    // captured to SUCCEEDED by the vendor's own confirm), complete it.
    const holdRes = await request(app)
      .post('/api/v1/booking-holds')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
      });
    const holdIds = holdRes.body.data.items[0].hold_ids;

    const bookingRes = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        items: [{ holdIds, guests: [] }],
        guestContactSnapshot: GUEST_CONTACT,
      });
    expect(bookingRes.status).toBe(201);
    const bookingId = bookingRes.body.data.id;

    const paymentRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId, simulateScenario: 'SUCCESS' });
    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data.status).toBe('AUTHORIZED');
    const paymentId = paymentRes.body.data.id;

    const confirmRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(confirmRes.status).toBe(200);

    const capturedPaymentRes = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(capturedPaymentRes.body.data.status).toBe('SUCCEEDED');
    expect(capturedPaymentRes.body.data.captured_amount).toBe('18000.00');

    const completeRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(completeRes.status).toBe(200);

    // 4. Review the completed stay.
    const reviewRes = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId, rating: 5, comment: 'Wonderful stay.' });
    expect(reviewRes.status).toBe(201);
    const reviewId = reviewRes.body.data.id;

    // 5. An active promotion (raw insert — mirrors B5's own
    // `advertisementLifecycle.test.js` fixture pattern; the Advertising
    // module has no partner-self-service create path).
    const [[placement]] = await pool.query(
      "SELECT id FROM ad_placement_types WHERE code = 'HOMEPAGE_SECTION'",
    );
    const [[product]] = await pool.query(
      'SELECT id FROM ad_products WHERE ad_placement_type_id = ? AND duration_days = 7',
      [placement.id],
    );
    const [[currency]] = await pool.query(
      "SELECT id FROM currencies WHERE code = 'AMD'",
    );
    const [adResult] = await pool.query(
      `INSERT INTO advertisements
        (listing_id, partner_id, ad_placement_type_id, ad_product_id, status_id,
         price_snapshot_amount, currency_id, start_date, end_date, requested_by, created_by, updated_by)
       SELECT ?, ?, ?, ?, id, 1000, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY), 1, 1, 1
       FROM advertisement_statuses WHERE code = 'ACTIVE'`,
      [listingId, partnerId, placement.id, product.id, currency.id],
    );
    const promotionId = adResult.insertId;

    // Sanity check: the promotion genuinely surfaces publicly before the
    // listing is frozen/purged, ruling out an unrelated setup bug.
    const homeFeaturedBefore = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(homeFeaturedBefore.body.data.some((l) => l.id === listingId)).toBe(
      true,
    );

    // 6. Freeze it (real sweep, via a backdated expires_at) and put it
    // past its retention window — the due-for-purge state B7 targets.
    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );
    const swept = await services.listingService.runExpirySweep();
    expect(swept.frozen).toBeGreaterThanOrEqual(1);
    await pool.query(
      'UPDATE listings SET purge_after = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [listingId],
    );

    // Now frozen: the promotion can no longer resurrect it publicly (B4's
    // own contract), but the promotion row itself is still untouched.
    const homeFeaturedFrozen = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(homeFeaturedFrozen.body.data.some((l) => l.id === listingId)).toBe(
      false,
    );

    // 7. Purge it.
    const purgeResult = await services.listingService.runRetentionPurgeSweep();
    expect(purgeResult.purged).toBeGreaterThanOrEqual(1);

    // 8. Prove the listing row itself survives, soft-deleted, physically
    // present — never a hard DELETE.
    const [[listingRow]] = await pool.query(
      'SELECT id, deleted_at, slug FROM listings WHERE id = ?',
      [listingId],
    );
    expect(listingRow).toBeDefined();
    expect(listingRow.id).toBe(listingId);
    expect(listingRow.deleted_at).not.toBeNull();
    expect(listingRow.slug).toBe(listingRes.body.data.slug);

    // 9. Booking + its items/snapshot: untouched, still retrievable under
    // the existing permission model.
    const bookingAfter = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(bookingAfter.status).toBe(200);
    expect(bookingAfter.body.data.id).toBe(bookingId);
    expect(bookingAfter.body.data.listing_id).toBe(listingId);
    expect(bookingAfter.body.data.status).toBe('COMPLETED');
    const [bookingItemRows] = await pool.query(
      'SELECT id FROM booking_items WHERE booking_id = ?',
      [bookingId],
    );
    expect(bookingItemRows.length).toBeGreaterThan(0);

    // 10. Payment + its captured amount: untouched, still retrievable —
    // the historical accounting record.
    const paymentAfter = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(paymentAfter.status).toBe(200);
    expect(paymentAfter.body.data.status).toBe('SUCCEEDED');
    expect(paymentAfter.body.data.captured_amount).toBe('18000.00');
    expect(paymentAfter.body.data.booking_id).toBe(bookingId);

    // 11. Review: still present, still publicly readable.
    const [[reviewRow]] = await pool.query(
      'SELECT id, listing_id, deleted_at FROM reviews WHERE id = ?',
      [reviewId],
    );
    expect(reviewRow).toBeDefined();
    expect(reviewRow.listing_id).toBe(listingId);
    expect(reviewRow.deleted_at).toBeNull();

    // 12. Favorite relation: still present (never deleted), even though
    // the listing itself can now never reappear (B4/B5's "filter, never
    // delete" rule, extended by B7's own terminal state).
    const [[favoriteRow]] = await pool.query(
      'SELECT id FROM favorites WHERE listing_id = ? AND customer_user_id = (SELECT id FROM users WHERE email = ?)',
      [listingId, DEV_CREDENTIALS.customer.email],
    );
    expect(favoriteRow).toBeDefined();
    const favoritesListAfter = await request(app)
      .get('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(
      favoritesListAfter.body.data.some(
        (item) => item.listing_id === listingId,
      ),
    ).toBe(false);

    // 13. Promotion row: untouched — never cancelled, paused, extended, or
    // recreated by the purge — and, unchanged from step 6, still produces
    // no public TOP card.
    const [[promotionRow]] = await pool.query(
      `SELECT listing_id,
              (SELECT code FROM advertisement_statuses WHERE id = status_id) AS status_code,
              start_date, end_date
       FROM advertisements WHERE id = ?`,
      [promotionId],
    );
    expect(promotionRow).toBeDefined();
    expect(promotionRow.listing_id).toBe(listingId);
    expect(promotionRow.status_code).toBe('ACTIVE');
    const homeFeaturedAfter = await request(app).get(
      '/api/v1/advertising/public/home-featured?locale=en',
    );
    expect(homeFeaturedAfter.body.data.some((l) => l.id === listingId)).toBe(
      false,
    );

    // Cleanup: the promotion row is test-fixture-only (no cascade concern —
    // it deliberately has no FK requiring the listing to still be public).
    await pool.query('DELETE FROM advertisements WHERE id = ?', [promotionId]);
  }, 60_000);

  test('Renew is impossible after purge, and the listing never resurfaces publicly, even for its own owner', async () => {
    const listingRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `B7 Renew-After-Purge Fixture ${Date.now()}` },
        ],
      });
    const listingId = listingRes.body.data.id;
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
      .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });
    await request(app)
      .post(`/api/v1/listings/${listingId}/publish`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 90 });

    await pool.query(
      'UPDATE listings SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?',
      [listingId],
    );
    await services.listingService.runExpirySweep();
    await pool.query(
      'UPDATE listings SET purge_after = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 HOUR) WHERE id = ?',
      [listingId],
    );
    const purgeResult = await services.listingService.runRetentionPurgeSweep();
    expect(purgeResult.purged).toBeGreaterThanOrEqual(1);

    const renewRes = await request(app)
      .post(`/api/v1/listings/${listingId}/renew`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ publicationPeriodDays: 30 });
    expect(renewRes.status).toBe(404);

    // Not visible to its own owner's normal (non-trashed) management
    // views either — Search's owner view already scopes `deleted_at IS
    // NULL` the same as every other business-entity query.
    const ownerSearchRes = await request(app)
      .get(`/api/v1/search?partnerId=${partnerId}&sort=newest&limit=100`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(ownerSearchRes.body.data.some((l) => l.id === listingId)).toBe(
      false,
    );

    const publicDetailRes = await request(app).get(
      `/api/v1/listings/${listingId}`,
    );
    expect(publicDetailRes.status).toBe(404);
  }, 60_000);
});

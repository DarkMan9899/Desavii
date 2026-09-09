/**
 * Sprint 10: booking visibility. A booking is visible to its own
 * customer, the listing's partner owner/staff, or an admin holding
 * `booking.view_all` — never to an unrelated authenticated user, masked
 * as 404 rather than 403 (same pattern `ListingService.getListing`
 * already uses for non-owner access to a draft listing).
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

let vendor;
let customer;
let admin;
let otherCustomer;
let otherVendor;
let partnerId;
let languageId;
let bookingId;
let listingId;
let vendorUserId;
let unitId;
const BOOKING_DATE_FROM = '2027-07-01';
const BOOKING_DATE_TO = '2027-07-02';

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerCustomer() {
  const email = `other-customer-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'StrongPass!2024',
    firstName: 'Other',
    lastName: 'Customer',
  });
  return { accessToken: res.body.data.access_token };
}

/**
 * P2.2C preflight (SHOULD FIX): registers, applies, and gets a genuine
 * SECOND, DISTINCT partner approved end-to-end (same flow
 * `partnerOnboarding.test.js` proves) — the real ownership-boundary case
 * the existing "unrelated customer" tests below don't cover. A plain
 * customer has no `booking.confirm` at all; a rival partner OWNER does
 * hold that permission (implicitly, for their own bookings), so this is
 * the actual test of `#assertOwnerOrPermission`'s ownership predicate,
 * not just of permission absence.
 */
async function registerAndApproveOtherPartner() {
  const email = `other-vendor-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email,
    password: 'OtherVendor!2024',
    firstName: 'Other',
    lastName: 'Vendor',
  });
  const accessToken = registerRes.body.data.access_token;

  const createRes = await request(app)
    .post('/api/v1/partners/applications')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ displayName: 'Cross-Partner RBAC Fixture' });
  const otherPartnerId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/partners/applications/${otherPartnerId}`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      legalName: 'Cross-Partner RBAC Fixture LLC',
      email: 'contact@crosspartnerfixture.example',
      phone: '+37400000099',
      description: 'RBAC fixture partner — never used for real bookings.',
    });
  await request(app)
    .post(`/api/v1/partners/applications/${otherPartnerId}/submit`)
    .set('Authorization', `Bearer ${accessToken}`);
  await request(app)
    .patch(`/api/v1/partners/admin/${otherPartnerId}/verification-status`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ status: 'APPROVED' });

  return { accessToken, partnerId: otherPartnerId };
}

/**
 * `BookingService.createBooking` resolves the listing via `ListingService
 * .getListing(principal, ...)` with the CUSTOMER as principal — a DRAFT
 * listing 404s for any non-owner, so the listing this file books must be
 * published before the customer holds/books it.
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
  const { id } = res.body.data;

  await request(app)
    .patch(`/api/v1/listings/${id}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${id}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  // Must exist BEFORE publish — Phase 5's publish-readiness gate now
  // requires >=1 bookable unit (ListingService#checkPublishReadiness).
  // registerUnit is idempotent per (listingId, bookableUnitTypeCode), so
  // this file's own later `registerUnit(listingId)` call is a harmless
  // no-op re-registration, not a duplicate.
  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: id, bookableUnitType: 'HOTEL_ROOM' });
  await request(app)
    .post(`/api/v1/listings/${id}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`);

  return id;
}

async function registerUnit(id) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId: id, bookableUnitType: 'HOTEL_ROOM' });
  return res.body.data.id;
}

async function setPrice(targetUnitId, dateFrom, dateTo, amount) {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId: targetUnitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: amount,
      priceOverrideCurrency: 'AMD',
    });
}

const GUEST_CONTACT = { fullName: 'Alan Turing', email: 'alan@example.com' };

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
  otherCustomer = await registerCustomer();
  otherVendor = await registerAndApproveOtherPartner();

  const pool = getMysqlPool();
  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[vendorRow]] = await pool.query(
    'SELECT id FROM users WHERE email = ?',
    [DEV_CREDENTIALS.vendor.email],
  );
  vendorUserId = vendorRow.id;

  listingId = await createListing(`Ownership Test ${Date.now()}`);
  unitId = await registerUnit(listingId);
  const dateFrom = BOOKING_DATE_FROM;
  const dateTo = BOOKING_DATE_TO;
  await setPrice(unitId, dateFrom, dateTo, 6_000);

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
  bookingId = bookingRes.body.data.id;
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /bookings/:id — visibility', () => {
  test("the booking's own customer can view it", async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(bookingId);
  });

  test("the listing's partner owner can view it", async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
  });

  // Phase 14.9 ("message the partner about this booking"): the single-
  // booking response resolves the partner's owner user id so a customer
  // can pass it as `participantUserIds` to `POST /messaging/conversations`
  // without the frontend ever needing its own partner->user lookup.
  test('partner_owner_user_id resolves to the vendor account that owns the listing', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.partner_owner_user_id).toBe(vendorUserId);
  });

  test('an admin with booking.view_all can view it', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
  });

  test('an unrelated authenticated customer gets 404, not 403', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherCustomer.accessToken}`);
    expect(res.status).toBe(404);
  });

  // P2.2C preflight (SHOULD FIX): a genuine second partner OWNER, not
  // just an unrelated customer — closes the real coverage gap the
  // preflight identified (structurally safe per code inspection, but
  // never proven by an actual cross-partner-owner test case).
  test('a genuinely distinct partner owner gets 404, not the booking (masked exactly like an unrelated customer)', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${otherVendor.accessToken}`);
    expect(res.status).toBe(404);
  });

  test('requires authentication', async () => {
    const res = await request(app).get(`/api/v1/bookings/${bookingId}`);
    expect(res.status).toBe(401);
  });
});

describe('Cross-partner mutation RBAC (P2.2C preflight SHOULD FIX)', () => {
  test("a distinct partner owner cannot confirm another partner's PENDING_VENDOR booking (403)", async () => {
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${otherVendor.accessToken}`);
    expect(res.status).toBe(403);

    // Proves it's a real denial, not a silent no-op: the booking's own
    // owner can still confirm it afterward.
    const stillPending = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(stillPending.body.data.status).toBe('PENDING_VENDOR');
  });
});

describe('GET /bookings — list visibility', () => {
  test("defaults to the caller's own bookings (My Trips)", async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(true);
  });

  test('Phase 8: summary rows carry the earliest/latest item dates as date_from/date_to', async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(200);
    const summary = res.body.data.find((b) => b.id === bookingId);
    expect(summary.date_from).toBe('2027-07-01');
    expect(summary.date_to).toBe('2027-07-02');
  });

  test("a customer's own list never includes another customer's booking", async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .set('Authorization', `Bearer ${otherCustomer.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(false);
  });

  test('the partner owner can list via ?partnerId=', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(true);
  });

  test('Phase 9: ?partnerId=&status= narrows to bookings in that status', async () => {
    const matching = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&status=PENDING_VENDOR`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(matching.status).toBe(200);
    expect(matching.body.data.some((b) => b.id === bookingId)).toBe(true);

    const nonMatching = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&status=COMPLETED`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(nonMatching.status).toBe(200);
    expect(nonMatching.body.data.some((b) => b.id === bookingId)).toBe(false);
  });

  test('Phase 9: an invalid status value is rejected with 422', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&status=NOT_A_REAL_STATUS`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(422);
  });

  test("an unrelated customer cannot list via ?partnerId= for someone else's partner (403)", async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}`)
      .set('Authorization', `Bearer ${otherCustomer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('?viewAll=true requires booking.view_all', async () => {
    const deniedRes = await request(app)
      .get('/api/v1/bookings?viewAll=true')
      .set('Authorization', `Bearer ${otherCustomer.accessToken}`);
    expect(deniedRes.status).toBe(403);

    const allowedRes = await request(app)
      .get('/api/v1/bookings?viewAll=true')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.data.some((b) => b.id === bookingId)).toBe(true);
  });

  test('requires authentication', async () => {
    const res = await request(app).get('/api/v1/bookings');
    expect(res.status).toBe(401);
  });
});

// Sprint D-2 (Partner Calendar source-aware UX): `?partnerId=&unitId=&from=&to=`
// is what the Partner Calendar's Week/Day views use to find which bookings
// touch one bookable unit within a date span — proves the new filter
// actually narrows via `booking_items`, not just that it's accepted.
describe('GET /bookings — unitId/from/to narrowing (Sprint D-2)', () => {
  test('?partnerId=&unitId= (this unit) includes the booking', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&unitId=${unitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(true);
  });

  test('?partnerId=&unitId= (a different, unrelated unit) excludes the booking', async () => {
    const otherListingId = await createListing(
      `Ownership Test Other ${Date.now()}`,
    );
    const otherUnitId = await registerUnit(otherListingId);
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&unitId=${otherUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(false);
  });

  test('?partnerId=&unitId=&from=&to= overlapping the stay includes the booking', async () => {
    const res = await request(app)
      .get(
        `/api/v1/bookings?partnerId=${partnerId}&unitId=${unitId}&from=${BOOKING_DATE_FROM}&to=${BOOKING_DATE_TO}`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(true);
  });

  test('?partnerId=&unitId=&from=&to= entirely outside the stay excludes the booking', async () => {
    const res = await request(app)
      .get(
        `/api/v1/bookings?partnerId=${partnerId}&unitId=${unitId}&from=2027-08-01&to=2027-08-02`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((b) => b.id === bookingId)).toBe(false);
  });

  test('an unrelated customer cannot use unitId to discover this booking via a partnerId they do not own (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&unitId=${unitId}`)
      .set('Authorization', `Bearer ${otherCustomer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('a genuinely distinct partner owner never sees this booking via unitId, even guessing the real unit id (403 — ownership gate runs first)', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings?partnerId=${partnerId}&unitId=${unitId}`)
      .set('Authorization', `Bearer ${otherVendor.accessToken}`);
    expect(res.status).toBe(403);
  });
});

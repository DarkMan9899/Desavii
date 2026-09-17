/**
 * Phase 13 (Notifications), Stage 13.4: proves the full chain — business
 * action -> domain event published -> `notificationListener.js` reacts
 * -> a real notification row appears for the right recipient — without
 * touching any of the existing business-logic assertions those actions'
 * own test suites already make. Every event type wired this phase is
 * exercised at least once.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import { closeMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let vendor;
let customer;
let admin;
let moderator;
let partnerId;
let languageId;

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
const GUEST_CONTACT = { fullName: 'Ada Lovelace', email: 'ada@example.com' };

async function publishListing(title) {
  const listingRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        { languageId, title: `${title} ${Date.now()}-${Math.random()}` },
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
  await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });

  return { listingId, unitId: unitRes.body.data.id };
}

async function createBooking(unitId, dateFrom, dateTo) {
  await request(app)
    .post('/api/v1/availability')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      unitId,
      dateFrom,
      dateTo,
      status: 'AVAILABLE',
      priceOverrideAmount: 5_000,
      priceOverrideCurrency: 'AMD',
    });
  const holdRes = await request(app)
    .post('/api/v1/booking-holds')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ bookableUnitId: unitId, dateFrom, dateTo, quantity: 1 }],
    });
  const bookingRes = await request(app)
    .post('/api/v1/bookings')
    .set('Authorization', `Bearer ${customer.accessToken}`)
    .send({
      items: [{ holdIds: holdRes.body.data.items[0].hold_ids, guests: [] }],
      guestContactSnapshot: GUEST_CONTACT,
    });
  return bookingRes.body.data.id;
}

async function latestNotificationTypes(accessToken) {
  const res = await request(app)
    .get('/api/v1/notifications?limit=50')
    .set('Authorization', `Bearer ${accessToken}`);
  return res.body.data.map((row) => row.event_type);
}

async function latestNotifications(accessToken) {
  const res = await request(app)
    .get('/api/v1/notifications?limit=50')
    .set('Authorization', `Bearer ${accessToken}`);
  return res.body.data;
}

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

  const registerRes = await request(app).post('/api/v1/auth/register').send({
    email: 'event.wiring.moderator@example.com',
    password: 'EventWiringModerator!2024',
    firstName: 'Event',
    lastName: 'Moderator',
  });

  const { getMysqlPool } =
    await import('../../../src/infrastructure/database/mysqlPool.js');
  const pool = getMysqlPool();
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'MODERATOR'`,
    [registerRes.body.data.user.id],
  );
  moderator = await login(
    'event.wiring.moderator@example.com',
    'EventWiringModerator!2024',
  );

  const [[partnerRow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
}, 90_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Domain event -> notification wiring', () => {
  test('booking.created notifies the partner owner (vendor)', async () => {
    const { unitId } = await publishListing('Booking Created Listing');
    await createBooking(unitId, '2027-03-01', '2027-03-03');

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('booking.created');
  });

  test('booking.confirmed and booking.completed notify the customer', async () => {
    const { unitId } = await publishListing('Booking Lifecycle Listing');
    const bookingId = await createBooking(unitId, '2027-03-10', '2027-03-12');

    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    let customerTypes = await latestNotificationTypes(customer.accessToken);
    expect(customerTypes).toContain('booking.confirmed');

    await request(app)
      .post(`/api/v1/bookings/${bookingId}/complete`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    customerTypes = await latestNotificationTypes(customer.accessToken);
    expect(customerTypes).toContain('booking.completed');

    const submitRes = await request(app)
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ bookingId, rating: 5, title: 'Great stay' });
    expect(submitRes.status).toBe(201);
    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('review.submitted');
  });

  test('booking.rejected notifies the customer', async () => {
    const { unitId } = await publishListing('Booking Rejected Listing');
    const bookingId = await createBooking(unitId, '2027-03-20', '2027-03-22');

    await request(app)
      .post(`/api/v1/bookings/${bookingId}/reject`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ reason: 'Fully booked elsewhere.' });

    const customerTypes = await latestNotificationTypes(customer.accessToken);
    expect(customerTypes).toContain('booking.rejected');
  });

  test('booking.cancelled by the customer notifies the partner owner', async () => {
    const { unitId } = await publishListing('Booking Cancelled Listing');
    const bookingId = await createBooking(unitId, '2027-04-01', '2027-04-03');
    // Only a CONFIRMED booking can be customer-cancelled
    // (bookingStatusTransitions.js — PENDING_VENDOR has no direct path to
    // CANCELLED_BY_CUSTOMER).
    await request(app)
      .post(`/api/v1/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ reason: 'Change of plans.' });

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('booking.cancelled');
  });

  test('favorite.added notifies the partner owner', async () => {
    const { listingId } = await publishListing('Favoritable Wiring Listing');

    await request(app)
      .post('/api/v1/favorites')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ listingId });

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('favorite.added');
  });

  test('partner.approved notifies the partner owner', async () => {
    await request(app)
      .patch(`/api/v1/partners/admin/${partnerId}/verification-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'REJECTED' });
    await request(app)
      .patch(`/api/v1/partners/admin/${partnerId}/verification-status`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ status: 'APPROVED' });

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('partner.approved');
  });

  test('message.sent notifies every other participant, not the sender', async () => {
    const { getMysqlPool } =
      await import('../../../src/infrastructure/database/mysqlPool.js');
    const pool = getMysqlPool();
    const [[vendorRow]] = await pool.query(
      'SELECT id FROM users WHERE email = ?',
      [DEV_CREDENTIALS.vendor.email],
    );

    const conversationRes = await request(app)
      .post('/api/v1/messaging/conversations')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ participantUserIds: [vendorRow.id] });
    const conversationId = conversationRes.body.data.id;

    await request(app)
      .post(`/api/v1/messaging/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ body: 'Is this still available?' });

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('message.sent');

    // `customer` and `vendor` are shared, statically-seeded demo accounts
    // reused across every integration test file in this --runInBand run,
    // so their notification history isn't private to this test — scope
    // the "sender excluded" assertion to THIS conversation's message.sent
    // notifications specifically, not the account's entire recent history
    // (which may legitimately contain an unrelated message.sent from a
    // different conversation exercised by another test file earlier in
    // the run).
    const customerNotifications = await latestNotifications(
      customer.accessToken,
    );
    const customerMessageSentForThisConversation = customerNotifications.filter(
      (row) =>
        row.event_type === 'message.sent' &&
        row.payload?.conversationId === conversationId,
    );
    expect(customerMessageSentForThisConversation).toHaveLength(0);
  });

  test('listing.approved and listing.rejected notify the partner owner', async () => {
    const { listingId } = await publishListing('Moderation Wiring Listing');

    await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'REJECTED', notes: 'Missing photos.' });
    let vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('listing.rejected');

    await request(app)
      .patch(`/api/v1/listings/admin/${listingId}/moderation-status`)
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .send({ status: 'APPROVED' });
    vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('listing.approved');
  });

  // Phase 17 (Inventory & Connectivity): only sync failure/conflict are
  // wired — a routine successful sync deliberately does NOT notify
  // (spec's "no spam on routine success").
  test('a failed iCal sync (no feedUrl/fixtureIcs configured) notifies the partner owner', async () => {
    const { listingId, unitId } = await publishListing(
      'Ical Failed Sync Listing',
    );

    const connectionRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingId,
        connectorType: 'ICAL',
        direction: 'IMPORT',
        name: 'Broken iCal feed',
        config: {},
      });
    expect(connectionRes.status).toBe(201);
    await request(app)
      .post(
        `/api/v1/inventory-connections/${connectionRes.body.data.id}/mapping`,
      )
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ bookableUnitId: unitId });

    await request(app)
      .post(`/api/v1/inventory-connections/${connectionRes.body.data.id}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('inventory.sync_failed');
  });

  test('a sync with an unmapped resource (conflict) notifies the partner owner', async () => {
    const { listingId } = await publishListing('Ical Conflict Sync Listing');
    const fixtureIcs = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:conflict-1@test.com\nDTSTART;VALUE=DATE:20270601\nDTEND;VALUE=DATE:20270603\nSUMMARY:Reserved\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR`;

    const connectionRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingId,
        connectorType: 'ICAL',
        direction: 'IMPORT',
        name: 'Unmapped iCal feed',
        config: { fixtureIcs },
      });
    expect(connectionRes.status).toBe(201);
    // Deliberately no mapping set -> AMBIGUOUS_MAPPING conflict.

    await request(app)
      .post(`/api/v1/inventory-connections/${connectionRes.body.data.id}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);

    const vendorTypes = await latestNotificationTypes(vendor.accessToken);
    expect(vendorTypes).toContain('inventory.sync_conflict');
  });

  // Partner Workspace Final Closeout: a scheduled sweep retries a broken
  // connection every few minutes — before this fix, every single retry
  // created its own `inventory.sync_failed` row even when nothing about
  // the failure had changed. Real ICAL connector, real deterministic
  // failure (no feedUrl/fixtureIcs — see `icalConnector.js`'s own
  // `#readIcsText`), no mocks.
  test('a persistent identical sync failure does not create a new notification on every retry, and recovery/re-failure each notify exactly once', async () => {
    const { listingId, unitId } = await publishListing(
      'Ical Dedup Sync Listing',
    );
    const connectionName = `Dedup iCal feed ${Date.now()}`;

    const connectionRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId,
        listingId,
        connectorType: 'ICAL',
        direction: 'IMPORT',
        name: connectionName,
        config: {},
      });
    const connectionId = connectionRes.body.data.id;
    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ bookableUnitId: unitId });

    async function countNotificationsOfType(eventType) {
      const rows = await latestNotifications(vendor.accessToken);
      return rows.filter(
        (row) =>
          row.event_type === eventType &&
          row.payload?.connectionName === connectionName,
      ).length;
    }

    // Two consecutive failures with the identical "no feedUrl configured"
    // message must produce exactly one notification, not two.
    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(await countNotificationsOfType('inventory.sync_failed')).toBe(1);
    expect(await countNotificationsOfType('inventory.sync_recovered')).toBe(0);

    // Fixing the feed and syncing must notify recovery exactly once —
    // and a second, routine successful sync must not add another.
    const validIcs =
      'BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:dedup-1@test.com\nDTSTART;VALUE=DATE:20270701\nDTEND;VALUE=DATE:20270702\nSUMMARY:Reserved\nSTATUS:CONFIRMED\nEND:VEVENT\nEND:VCALENDAR';
    await request(app)
      .patch(`/api/v1/inventory-connections/${connectionId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ config: { fixtureIcs: validIcs } });
    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(await countNotificationsOfType('inventory.sync_recovered')).toBe(1);

    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(await countNotificationsOfType('inventory.sync_recovered')).toBe(1);

    // Breaking it again after a recovery is genuinely new information —
    // a second, distinct `inventory.sync_failed` row must appear.
    await request(app)
      .patch(`/api/v1/inventory-connections/${connectionId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ config: {} });
    await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/sync`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(await countNotificationsOfType('inventory.sync_failed')).toBe(2);
  });
});

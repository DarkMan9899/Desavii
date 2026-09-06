/**
 * Phase 17 gap-closure — dedicated RBAC / cross-partner isolation
 * verification for the Inventory & Connectivity engine. `inventoryEngine
 * .test.js` only ever exercises the listing owner (vendor) against their
 * own resources plus one "customer cannot touch a draft listing" 404-mask
 * case; it never proves Partner A is isolated from Partner B, nor that
 * `partner_employee_roles` capability scoping (`EDITOR` vs
 * `BOOKING_MANAGER`, `core/domain/partnerCapabilities.js`) is actually
 * enforced server-side. This file closes that gap directly against the
 * real HTTP API — never by inspecting frontend nav/gating.
 *
 * Both Partner A's and Partner B's test listings are published before any
 * assertion runs. `listingService#getListing` 404-masks non-owner reads
 * of DRAFT listings (a separate, already-tested precedent —
 * `inventoryEngine.test.js`'s "customer cannot create a block" case) and
 * every Phase 17 method resolves its listing via `getListing` before its
 * own capability check ever runs (`#loadUnitForCapability`). Leaving
 * either listing a draft would make cross-partner assertions ambiguous
 * between "masked as not-found" and "found but forbidden" — publishing
 * both means every cross-partner assertion below is an honest, unambiguous
 * 403 `AuthorizationError` from `#assertPartnerCapability`, not a 404.
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
let vendor; // Partner A owner (DEV_CREDENTIALS.vendor)
let customer; // plain customer, no partnership
let partnerBOwner;
let editorA; // Partner A employee, EDITOR role (VIEW_AVAILABILITY only)
let bookingManagerA; // Partner A employee, BOOKING_MANAGER role (all but MANAGE_CONNECTIONS)
let supportUser; // global SUPPORT role
let adminUser; // global ADMIN/SUPER_ADMIN

let partnerAId;
let partnerBId;
let listingAId;
let listingBId;
let unitAId;
let unitBId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    accessToken: res.body.data.access_token,
    userId: res.body.data.user.id,
  };
}

async function registerAndLogin(email, password, firstName, lastName) {
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName,
    lastName,
  });
  const userId = res.body.data.user.id;
  return { userId, ...(await login(email, password)) };
}

let cachedLanguageId;
async function getLanguageId() {
  if (cachedLanguageId) return cachedLanguageId;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  cachedLanguageId = language.id;
  return cachedLanguageId;
}

async function createListing(owner, partnerId, title) {
  const res = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [{ languageId: await getLanguageId(), title }],
    });
  return res.body.data.id;
}

async function registerUnit(owner, listingId, capacity = 5) {
  const res = await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM', capacity });
  return res.body.data.id;
}

/** Satisfies `#checkPublishReadiness`: translation (already set), an image, a
 * complete lat/long location, and >=1 bookable unit — `categoryIds` is
 * deliberately never sent at creation, which skips the per-category
 * required-attribute/policy checks entirely (see `listingService.js`'s
 * `#checkPublishReadiness`: that block is gated on `listing.categoryIds[0]`
 * being present). */
async function publishListing(owner, listingId) {
  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ location: { latitude: 40.1772, longitude: 44.5035 } });
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(ONE_PX_PNG);
  const res = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${owner.accessToken}`);
  expect(res.status).toBe(200);
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
  adminUser = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );

  const [[partnerARow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerAId = partnerARow.id;

  // --- Partner B: a fully independent, real, verified partner org ---
  // `resetRateLimits()` is called before each register+login pair below —
  // /auth/register and /auth/login both share `sensitiveRateLimiter`
  // (10/min), and this setup alone issues ~12 requests against it.
  await resetRateLimits();
  const partnerBOwnerReg = await registerAndLogin(
    'rbac.partnerb.owner@example.com',
    'RbacPartnerB!2024',
    'PartnerB',
    'Owner',
  );
  const [[approvedStatus]] = await pool.query(
    "SELECT id FROM moderation_statuses WHERE code = 'APPROVED'",
  );
  const [[ownerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'OWNER'",
  );
  const [partnerBResult] = await pool.query(
    `INSERT INTO partners
      (legal_name, display_name, slug, verification_status_id, moderation_status_id, owner_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      'RBAC Partner B LLC',
      'RBAC Partner B',
      `rbac-partner-b-${Date.now()}`,
      approvedStatus.id,
      approvedStatus.id,
      partnerBOwnerReg.userId,
    ],
  );
  partnerBId = partnerBResult.insertId;
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerBId, partnerBOwnerReg.userId, ownerRole.id],
  );
  partnerBOwner = partnerBOwnerReg;

  // --- Partner A operational staff: EDITOR (view-only) and BOOKING_MANAGER ---
  const [[editorRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'EDITOR'",
  );
  const [[bookingManagerRole]] = await pool.query(
    "SELECT id FROM partner_employee_roles WHERE code = 'BOOKING_MANAGER'",
  );
  await resetRateLimits();
  const editorAReg = await registerAndLogin(
    'rbac.editora@example.com',
    'RbacEditorA!2024',
    'Editor',
    'A',
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, editorAReg.userId, editorRole.id],
  );
  editorA = editorAReg;

  await resetRateLimits();
  const bookingManagerAReg = await registerAndLogin(
    'rbac.bookingmanagera@example.com',
    'RbacBookingMgrA!2024',
    'BookingManager',
    'A',
  );
  await pool.query(
    'INSERT INTO partner_employees (partner_id, user_id, role_id) VALUES (?, ?, ?)',
    [partnerAId, bookingManagerAReg.userId, bookingManagerRole.id],
  );
  bookingManagerA = bookingManagerAReg;

  // --- Global SUPPORT-role user (inventory.view_all only, no manage_all) ---
  await resetRateLimits();
  const supportReg = await registerAndLogin(
    'rbac.support@example.com',
    'RbacSupport!2024',
    'Support',
    'User',
  );
  await pool.query(
    `INSERT IGNORE INTO role_user (role_id, user_id)
     SELECT id, ? FROM roles WHERE code = 'SUPPORT'`,
    [supportReg.userId],
  );
  // JWT roles are baked in at login time — `registerAndLogin`'s internal
  // login happened before the SUPPORT role was granted above, so a fresh
  // login is required for the token to actually carry the SUPPORT role.
  await resetRateLimits();
  supportUser = await login('rbac.support@example.com', 'RbacSupport!2024');

  // --- Listings + units, both partners, both published ---
  await resetRateLimits();
  listingAId = await createListing(
    vendor,
    partnerAId,
    `RBAC Listing A ${Date.now()}`,
  );
  unitAId = await registerUnit(vendor, listingAId);
  await publishListing(vendor, listingAId);

  listingBId = await createListing(
    partnerBOwner,
    partnerBId,
    `RBAC Listing B ${Date.now()}`,
  );
  unitBId = await registerUnit(partnerBOwner, listingBId);
  await publishListing(partnerBOwner, listingBId);
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('Cross-partner isolation — Partner A cannot touch Partner B inventory', () => {
  test('Partner A owner cannot view Partner B unit breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/breakdown`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot view Partner B inventory ledger', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/ledger`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot create a manual block on Partner B unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId: unitBId,
        dateFrom: '2026-09-10',
        dateTo: '2026-09-11',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
      });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot list Partner B manual blocks', async () => {
    const res = await request(app)
      .get('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ listingId: listingBId });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot create an external/phone reservation for Partner B unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        unitId: unitBId,
        dateFrom: '2026-09-12',
        dateTo: '2026-09-13',
        quantity: 1,
        guestName: 'Cross Partner Attempt',
        sourceCode: 'PHONE',
      });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot list Partner B external reservations', async () => {
    const res = await request(app)
      .get('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .query({ listingId: listingBId });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot retire (delete) a Partner B bookable unit — a capacity-affecting mutation', async () => {
    const throwawayUnitId = await registerUnit(partnerBOwner, listingBId);
    const res = await request(app)
      .delete(`/api/v1/availability/units/${throwawayUnitId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot update a Partner B bookable unit (P2.2A: label/capacity/occupancy/price)', async () => {
    const res = await request(app)
      .patch(`/api/v1/availability/units/${unitBId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ maxGuests: 4 });
    expect(res.status).toBe(403);
  });

  test('Partner A owner cannot create an inventory connection for Partner B', async () => {
    const res = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerBId,
        listingId: listingBId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: 'Cross-partner connection attempt',
      });
    expect(res.status).toBe(403);
  });
});

/**
 * Sprint D-1 (P0-2): `InventoryConnectionService#setMapping` authorized the
 * caller against the CONNECTION's own partner but never checked that the
 * target `bookableUnitId` actually belongs to that same partner — a
 * partner authorized to manage their own connection could point it at
 * another partner's bookable unit, and a later sync would drive real
 * `quantity_available` mutations against that other partner's inventory.
 */
describe('Sprint D-1 (P0-2) — inventory connection mapping is partner-scoped', () => {
  test('own connection -> own unit mapping is allowed', async () => {
    const connRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: `P0-2 Own Mapping ${Date.now()}`,
      });
    expect(connRes.status).toBe(201);
    const connectionId = connRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ bookableUnitId: unitAId, externalResourceId: 'own-unit' });
    expect(res.status).toBe(200);
    expect(res.body.data.bookable_unit_id).toBe(unitAId);
  });

  test("Partner A's connection cannot be mapped to Partner B's unit", async () => {
    const connRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: `P0-2 Cross-Partner Mapping ${Date.now()}`,
      });
    expect(connRes.status).toBe(201);
    const connectionId = connRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ bookableUnitId: unitBId, externalResourceId: 'cross-partner' });
    expect(res.status).toBe(403);

    // The mapping must not have been persisted despite the rejection.
    const [rows] = await pool.query(
      'SELECT id FROM inventory_connection_mappings WHERE connection_id = ? AND bookable_unit_id = ?',
      [connectionId, unitBId],
    );
    expect(rows).toHaveLength(0);
  });

  test('mapping to a nonexistent unit is rejected safely (404)', async () => {
    const connRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: `P0-2 Nonexistent Unit Mapping ${Date.now()}`,
      });
    const connectionId = connRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({ bookableUnitId: 9_999_999 });
    expect(res.status).toBe(404);
  });

  test('a partner employee without MANAGE_CONNECTIONS still cannot set a mapping, own unit or not', async () => {
    const connRes = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${vendor.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: `P0-2 Employee Permission Mapping ${Date.now()}`,
      });
    const connectionId = connRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/inventory-connections/${connectionId}/mapping`)
      .set('Authorization', `Bearer ${bookingManagerA.accessToken}`)
      .send({
        bookableUnitId: unitAId,
        externalResourceId: 'employee-attempt',
      });
    expect(res.status).toBe(403);
  });
});

describe('Operational-staff permission scoping (Partner A employees, own partner)', () => {
  test('EDITOR (VIEW_AVAILABILITY only) can view own-partner breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitAId}/breakdown`)
      .set('Authorization', `Bearer ${editorA.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(200);
  });

  test('EDITOR cannot create a manual block on own-partner unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${editorA.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-15',
        dateTo: '2026-09-16',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
      });
    expect(res.status).toBe(403);
  });

  test('EDITOR cannot create an external reservation on own-partner unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${editorA.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-17',
        dateTo: '2026-09-18',
        quantity: 1,
        guestName: 'Editor Attempt',
        sourceCode: 'PHONE',
      });
    expect(res.status).toBe(403);
  });

  test('BOOKING_MANAGER can create a manual block on own-partner unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${bookingManagerA.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-20',
        dateTo: '2026-09-21',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
        notes: 'BOOKING_MANAGER RBAC check',
      });
    expect(res.status).toBe(201);
  });

  test('BOOKING_MANAGER can create an external reservation on own-partner unit', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${bookingManagerA.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-22',
        dateTo: '2026-09-23',
        quantity: 1,
        guestName: 'Booking Manager Attempt',
        sourceCode: 'PHONE',
      });
    expect(res.status).toBe(201);
  });

  test('BOOKING_MANAGER is blocked from MANAGE_CONNECTIONS (creating a connection)', async () => {
    const res = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${bookingManagerA.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: 'BOOKING_MANAGER connections attempt',
      });
    expect(res.status).toBe(403);
  });

  test('operational staff (BOOKING_MANAGER, non-owner) never gains finance/payout access to their own partner balance', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/partners/${partnerAId}/balance`)
      .set('Authorization', `Bearer ${bookingManagerA.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('the real owner CAN still view their own partner balance (sanity check the 403 above is a real RBAC gate, not a broken route)', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/partners/${partnerAId}/balance`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('Customer / non-partner denial against a published listing', () => {
  test('a plain customer cannot view partner-scoped inventory breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitAId}/breakdown`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(403);
  });

  test('a plain customer cannot create a manual block', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-25',
        dateTo: '2026-09-26',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
      });
    expect(res.status).toBe(403);
  });

  test('a plain customer cannot create an external reservation', async () => {
    const res = await request(app)
      .post('/api/v1/availability/external-reservations')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        unitId: unitAId,
        dateFrom: '2026-09-27',
        dateTo: '2026-09-28',
        quantity: 1,
        guestName: 'Customer Attempt',
        sourceCode: 'PHONE',
      });
    expect(res.status).toBe(403);
  });

  test('a plain customer cannot create/manage an inventory connection', async () => {
    const res = await request(app)
      .post('/api/v1/inventory-connections')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingId: listingAId,
        connectorType: 'MANUAL',
        direction: 'IMPORT',
        name: 'Customer connections attempt',
      });
    expect(res.status).toBe(403);
  });
});

describe('Admin Inventory Oversight — view/mutate split', () => {
  test('SUPPORT (inventory.view_all only) can view cross-partner breakdown for Partner B', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/breakdown`)
      .set('Authorization', `Bearer ${supportUser.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(200);
  });

  test('SUPPORT cannot create a manual block cross-partner (no inventory.manage_all)', async () => {
    const res = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${supportUser.accessToken}`)
      .send({
        unitId: unitBId,
        dateFrom: '2026-09-29',
        dateTo: '2026-09-30',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
      });
    expect(res.status).toBe(403);
  });

  test('an ordinary customer cannot view cross-partner breakdown', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/breakdown`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(403);
  });

  test('ADMIN (inventory.manage_all) can both view and mutate cross-partner inventory', async () => {
    const viewRes = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/breakdown`)
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(viewRes.status).toBe(200);

    const blockRes = await request(app)
      .post('/api/v1/availability/blocks')
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .send({
        unitId: unitBId,
        dateFrom: '2026-10-01',
        dateTo: '2026-10-02',
        quantity: 1,
        reasonCode: 'MAINTENANCE',
        notes: 'Admin oversight RBAC check',
      });
    expect(blockRes.status).toBe(201);
  });

  test('a non-admin cannot access Admin Inventory Oversight cross-partner ledger listing', async () => {
    const res = await request(app)
      .get(`/api/v1/availability/units/${unitBId}/ledger`)
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .query({ from: '2026-09-01', to: '2026-09-01' });
    expect(res.status).toBe(403);
  });
});

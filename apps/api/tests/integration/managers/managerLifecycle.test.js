/**
 * Sprint F (Manager Workspace + Analytics). Exercises the Managers module
 * end-to-end against the real seeded `manager_companies` schema
 * (migration 0042) + the global MANAGER role (`004_roles_and_permissions.js`):
 * Admin promote/assign/unassign, Manager self-service (companies/dashboard),
 * and — the most safety-critical surface — that Manager access to
 * Listings/Bookings is genuinely scoped server-side to only the companies
 * actively assigned to that specific Manager, never trusted from any
 * client-supplied id, and never leaking across two different Managers.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import { getMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let pool;
let admin;
let vendor;
let customer;
let managerA;
let managerAUserId;
let managerB;
let managerBUserId;
let partnerAId;
let partnerBId;
let languageId;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

async function registerFreshUser(label) {
  const email = `manager-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.test`;
  const password = 'Sprint-F-Test-Pass1!';
  const res = await request(app).post('/api/v1/auth/register').send({
    email,
    password,
    firstName: 'Sprint F',
    lastName: label,
  });
  return {
    userId: res.body.data.user.id,
    accessToken: res.body.data.access_token,
    email,
    password,
  };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();

  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  vendor = await login(
    DEV_CREDENTIALS.vendor.email,
    DEV_CREDENTIALS.vendor.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );

  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;

  // The base `seedAll()` fixture creates exactly ONE partner
  // ('yerevan-boutique-hospitality') — real cross-COMPANY isolation needs
  // two genuinely distinct partners, so a second is created directly here,
  // same convention `inventoryRbac.test.js` already establishes for this
  // exact need.
  const [[partnerARow]] = await pool.query(
    "SELECT id FROM partners WHERE slug = 'yerevan-boutique-hospitality'",
  );
  partnerAId = partnerARow.id;

  const partnerBOwnerReg = await registerFreshUser('PartnerB-Owner');
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
      'Sprint F Partner B LLC',
      'Sprint F Partner B',
      `sprint-f-partner-b-${Date.now()}`,
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

  // Two freshly-registered users (never touched by other integration test
  // files' fixtures) — real cross-Manager isolation needs two genuinely
  // distinct principals, each promoted and re-logged-in to pick up the
  // MANAGER role in their JWT (roles are baked into the token at login,
  // `authenticate.js`'s own documented contract).
  const managerAReg = await registerFreshUser('A');
  const managerBReg = await registerFreshUser('B');
  managerAUserId = managerAReg.userId;
  managerBUserId = managerBReg.userId;

  await request(app)
    .post('/api/v1/managers/admin/promote')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: managerAUserId });
  await request(app)
    .post('/api/v1/managers/admin/promote')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ userId: managerBUserId });

  await request(app)
    .post(`/api/v1/managers/admin/${managerAUserId}/companies`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ partnerId: partnerAId });
  await request(app)
    .post(`/api/v1/managers/admin/${managerBUserId}/companies`)
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({ partnerId: partnerBId });

  managerA = await login(managerAReg.email, managerAReg.password);
  managerB = await login(managerBReg.email, managerBReg.password);
});

describe('Sprint F Manager module — authorization boundaries', () => {
  test('unauthenticated requests to admin and self-service routes are rejected', async () => {
    const adminRes = await request(app).get('/api/v1/managers/admin');
    expect(adminRes.status).toBe(401);

    const selfRes = await request(app).get('/api/v1/managers/mine/companies');
    expect(selfRes.status).toBe(401);
  });

  test('a non-admin (vendor) cannot reach any /managers/admin/* route', async () => {
    const res = await request(app)
      .get('/api/v1/managers/admin')
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('a user without the MANAGER role cannot reach any /managers/mine/* route', async () => {
    const res = await request(app)
      .get('/api/v1/managers/mine/companies')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('assigning a company to a real user who does not hold the MANAGER role is rejected', async () => {
    // The seeded dev vendor (`005_dev_accounts.js`) — a real, existing
    // user, just not a Manager. Confirms this is a genuine role check,
    // not merely "does this user id exist."
    const [[vendorRow]] = await pool.query(
      'SELECT id FROM users WHERE normalized_email = ?',
      [DEV_CREDENTIALS.vendor.email.toLowerCase()],
    );
    const res = await request(app)
      .post(`/api/v1/managers/admin/${vendorRow.id}/companies`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ partnerId: partnerAId });
    expect(res.status).toBe(422);
  });
});

describe('Sprint F Manager module — Admin assignment lifecycle', () => {
  test('promoting the same user twice is idempotent', async () => {
    const res = await request(app)
      .post('/api/v1/managers/admin/promote')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ userId: managerAUserId });
    expect(res.status).toBe(200);
    expect(res.body.data.user_id).toBe(managerAUserId);
  });

  test('assigning the same company twice is rejected as a conflict', async () => {
    const res = await request(app)
      .post(`/api/v1/managers/admin/${managerAUserId}/companies`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ partnerId: partnerAId });
    expect(res.status).toBe(409);
  });

  test("Admin's manager roster and detail view reflect the real assignment", async () => {
    const listRes = await request(app)
      .get('/api/v1/managers/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(listRes.status).toBe(200);
    const entry = listRes.body.data.find(
      (row) => row.user_id === managerAUserId,
    );
    expect(entry.assigned_company_count).toBe(1);

    const detailRes = await request(app)
      .get(`/api/v1/managers/admin/${managerAUserId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.assignments).toHaveLength(1);
    expect(detailRes.body.data.assignments[0].partner_id).toBe(partnerAId);
  });
});

describe('Sprint F Manager module — self-service visibility, scoped strictly to assigned companies', () => {
  test('Manager A sees only their own assigned company', async () => {
    const res = await request(app)
      .get('/api/v1/managers/mine/companies')
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].partner_id).toBe(partnerAId);
  });

  test("Manager A's dashboard is scoped to their own company only", async () => {
    const res = await request(app)
      .get('/api/v1/managers/mine/dashboard')
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.counts.companies).toBe(1);
  });

  test("Manager A cannot request analytics filtered to Manager B's company (guessed companyId rejected)", async () => {
    const res = await request(app)
      .get('/api/v1/managers/mine/analytics')
      .query({ companyId: partnerBId })
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Sprint F Manager module — Listings authorization is scoped to assigned companies only', () => {
  test('Manager A can create a listing for their assigned company', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${managerA.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Manager A listing ${Date.now()}` },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.partner_id).toBe(partnerAId);
  });

  test('Manager A CANNOT create a listing for a company they are not assigned to (real cross-company IDOR attempt)', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${managerA.accessToken}`)
      .send({
        partnerId: partnerBId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Manager A attempted on B ${Date.now()}` },
        ],
      });
    expect(res.status).toBe(403);
  });

  test('Manager A cannot delete a listing (destructive action stays owner/admin-only, not Manager-allowed)', async () => {
    const createRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${managerA.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Manager A delete-test ${Date.now()}` },
        ],
      });
    const listingId = createRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/listings/${listingId}`)
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(deleteRes.status).toBe(403);
  });
});

describe('Sprint F Manager module — booking visibility is read-only and company-scoped', () => {
  test('Manager A can list bookings for their assigned company', async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .query({ partnerId: partnerAId })
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(res.status).toBe(200);
  });

  test("Manager A cannot list Manager B's company bookings (cross-manager isolation)", async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .query({ partnerId: partnerBId })
      .set('Authorization', `Bearer ${managerA.accessToken}`);
    expect(res.status).toBe(403);
  });

  test("Manager B, symmetrically, cannot see Manager A's company bookings", async () => {
    const res = await request(app)
      .get('/api/v1/bookings')
      .query({ partnerId: partnerAId })
      .set('Authorization', `Bearer ${managerB.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('Sprint F Manager module — Admin unassign revokes access immediately', () => {
  test('after Admin unassigns the company, Manager A loses listing-create access to it', async () => {
    const unassignRes = await request(app)
      .delete(
        `/api/v1/managers/admin/${managerAUserId}/companies/${partnerAId}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(unassignRes.status).toBe(200);
    expect(unassignRes.body.data).toHaveLength(0);

    const createRes = await request(app)
      .post('/api/v1/listings')
      .set('Authorization', `Bearer ${managerA.accessToken}`)
      .send({
        partnerId: partnerAId,
        listingType: 'HOTEL',
        translations: [
          { languageId, title: `Post-unassign attempt ${Date.now()}` },
        ],
      });
    expect(createRes.status).toBe(403);
  });

  test('unassigning an already-unassigned company is a 404, not a silent success', async () => {
    const res = await request(app)
      .delete(
        `/api/v1/managers/admin/${managerAUserId}/companies/${partnerAId}`,
      )
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Sprint F Manager module — Admin analytics review for one Manager', () => {
  test("Admin can view Manager B's performance analytics", async () => {
    const res = await request(app)
      .get(`/api/v1/managers/admin/${managerBUserId}/analytics`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('bookings_by_status');
  });
});

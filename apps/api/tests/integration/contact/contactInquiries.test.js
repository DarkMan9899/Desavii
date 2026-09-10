/**
 * Sprint G (public Contact form). Exercises the Contact module end-to-end
 * against the real seeded `contact_inquiry_types`/`contact_inquiry_statuses`
 * schema (migration 0043): an anonymous public submission, server-side
 * validation, and that the Admin inbox (list/detail/resolve) is genuinely
 * gated by `contact.manage` — not reachable by a plain customer or vendor.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';
import { DEV_CREDENTIALS } from '../../../src/infrastructure/database/seeds/005_dev_accounts.js';

let admin;
let customer;

async function login(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return { accessToken: res.body.data.access_token };
}

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  admin = await login(
    DEV_CREDENTIALS.admin.email,
    DEV_CREDENTIALS.admin.password,
  );
  customer = await login(
    DEV_CREDENTIALS.customer.email,
    DEV_CREDENTIALS.customer.password,
  );
});

describe('POST /api/v1/contact (public submission)', () => {
  test('accepts a valid anonymous inquiry and persists it', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      inquiryType: 'BOOKING_SUPPORT',
      name: 'Ani Sargsyan',
      email: 'ani.sargsyan@example.test',
      subject: 'Question about a hotel booking',
      message: 'Is breakfast included in the Yerevan boutique stay?',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toEqual(expect.any(Number));
  });

  test('rejects an invalid inquiry type', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      inquiryType: 'NOT_A_REAL_TYPE',
      name: 'Ani',
      email: 'ani@example.test',
      subject: 'Subject',
      message: 'Message',
    });
    expect(res.status).toBe(422);
  });

  test('rejects a malformed email', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      inquiryType: 'GENERAL',
      name: 'Ani',
      email: 'not-an-email',
      subject: 'Subject',
      message: 'Message',
    });
    expect(res.status).toBe(422);
  });

  test('rejects a missing message', async () => {
    const res = await request(app).post('/api/v1/contact').send({
      inquiryType: 'GENERAL',
      name: 'Ani',
      email: 'ani@example.test',
      subject: 'Subject',
    });
    expect(res.status).toBe(422);
  });
});

describe('Admin Contact inbox authorization', () => {
  let submittedId;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/contact').send({
      inquiryType: 'PARTNER_BUSINESS',
      name: 'Partner Prospect',
      email: 'prospect@example.test',
      subject: 'Interested in listing our hotel',
      message: 'How do we become a Desavii partner?',
    });
    submittedId = res.body.data.id;
  });

  test('GET /api/v1/contact/admin requires authentication', async () => {
    const res = await request(app).get('/api/v1/contact/admin');
    expect(res.status).toBe(401);
  });

  test('GET /api/v1/contact/admin rejects a customer (no contact.manage)', async () => {
    const res = await request(app)
      .get('/api/v1/contact/admin')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });

  test('GET /api/v1/contact/admin lists inquiries for an Admin', async () => {
    const res = await request(app)
      .get('/api/v1/contact/admin')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.find((row) => row.id === submittedId)).toMatchObject({
      type: 'PARTNER_BUSINESS',
      status: 'NEW',
      subject: 'Interested in listing our hotel',
    });
  });

  test('GET /api/v1/contact/admin/:id returns the full inquiry for an Admin', async () => {
    const res = await request(app)
      .get(`/api/v1/contact/admin/${submittedId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('prospect@example.test');
  });

  test('POST /api/v1/contact/admin/:id/resolve moves the inquiry to RESOLVED', async () => {
    const res = await request(app)
      .post(`/api/v1/contact/admin/${submittedId}/resolve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RESOLVED');
    expect(res.body.data.resolved_at).not.toBeNull();
  });

  test('a customer cannot resolve an inquiry', async () => {
    const res = await request(app)
      .post(`/api/v1/contact/admin/${submittedId}/resolve`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(res.status).toBe(403);
  });
});

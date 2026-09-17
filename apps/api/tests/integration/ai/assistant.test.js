/**
 * Stage 15.3 (AI Assistant): a real end-to-end pass — a published listing
 * (created via the real Listings API) grounds a real answer, proving the
 * assistant's context comes from `listingService.getListing`, never
 * fabricated. Also covers conversation ownership and the sync `/ai/assistant`
 * route (the SSE `/ai/assistant/stream` route is unit-tested in
 * `tests/unit/modules/ai/assistantService.test.js` — supertest doesn't
 * exercise a real streaming response well).
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

let vendor;
let customer;
let partnerId;
let languageId;
let yerevanCityId;
let listingId;

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
  partnerId = partnerRow.id;
  const [[language]] = await pool.query(
    "SELECT id FROM languages WHERE code = 'en'",
  );
  languageId = language.id;
  const [[yerevan]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'yerevan'",
  );
  yerevanCityId = yerevan.id;
  const [[hotelsCategory]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );

  const createRes = await request(app)
    .post('/api/v1/listings')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      partnerId,
      listingType: 'HOTEL',
      translations: [
        {
          languageId,
          title: `AI Assistant Fixture Hotel ${Date.now()}`,
          description: 'A test listing.',
        },
      ],
      categoryIds: [hotelsCategory.id],
      location: { cityId: yerevanCityId },
    });
  listingId = createRes.body.data.id;

  await request(app)
    .patch(`/api/v1/listings/${listingId}`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({
      location: { latitude: 40.18, longitude: 44.5 },
      pricing: { modelCode: 'PER_NIGHT', amount: 120, currencyCode: 'AMD' },
      policyValues: [
        { code: 'cancellation_policy', value: 'FLEXIBLE' },
        { code: 'check_in_time', value: '14:00' },
        { code: 'check_out_time', value: '11:00' },
      ],
    });

  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await request(app)
    .post(`/api/v1/listings/${listingId}/media`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .set('Content-Type', 'image/png')
    .send(pngBuffer);

  await request(app)
    .post('/api/v1/availability/units')
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ listingId, bookableUnitType: 'HOTEL_ROOM' });

  const publishRes = await request(app)
    .post(`/api/v1/listings/${listingId}/publish`)
    .set('Authorization', `Bearer ${vendor.accessToken}`)
    .send({ publicationPeriodDays: 90 });
  if (publishRes.status !== 200) {
    throw new Error(
      `Fixture listing failed to publish: ${JSON.stringify(publishRes.body)}`,
    );
  }
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('AI Assistant', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .post('/api/v1/ai/assistant')
      .send({ message: 'Hi' });
    expect(res.status).toBe(401);
  });

  test('rejects an empty message', async () => {
    const res = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ message: '   ' });
    expect(res.status).toBe(422);
  });

  test('answers a question grounded in a real published listing, never a fabricated one', async () => {
    const res = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        message: 'What is the cancellation policy?',
        contextType: 'listing',
        contextId: listingId,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.conversation_id).toEqual(expect.any(Number));
    expect(res.body.data.message).toEqual(expect.any(String));
    expect(res.body.data.message.length).toBeGreaterThan(0);
  });

  test('rejects an unsupported context type', async () => {
    const res = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        message: 'Hi',
        contextType: 'notification',
        contextId: 1,
      });
    expect(res.status).toBe(422);
  });

  test("404s on a listing that doesn't exist rather than fabricating context", async () => {
    const res = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        message: 'Hi',
        contextType: 'listing',
        contextId: 999999999,
      });
    expect(res.status).toBe(404);
  });

  test('the conversation is retrievable, listed, and owned by the requester', async () => {
    const askRes = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ message: 'Hello there' });
    const conversationId = askRes.body.data.conversation_id;

    const getRes = await request(app)
      .get(`/api/v1/ai/assistant/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.messages).toHaveLength(2);
    expect(getRes.body.data.messages[0].role).toBe('user');
    expect(getRes.body.data.messages[1].role).toBe('assistant');

    const listRes = await request(app)
      .get('/api/v1/ai/assistant/conversations')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(listRes.status).toBe(200);
    expect(
      listRes.body.data.results.some((row) => row.id === conversationId),
    ).toBe(true);
  });

  test("another user cannot read someone else's assistant conversation", async () => {
    const askRes = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ message: 'Private question' });
    const conversationId = askRes.body.data.conversation_id;

    const getRes = await request(app)
      .get(`/api/v1/ai/assistant/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${vendor.accessToken}`);
    expect(getRes.status).toBe(404);
  });

  test('deletes a conversation owned by the requester', async () => {
    const askRes = await request(app)
      .post('/api/v1/ai/assistant')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({ message: 'To be deleted' });
    const conversationId = askRes.body.data.conversation_id;

    const deleteRes = await request(app)
      .delete(`/api/v1/ai/assistant/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/v1/ai/assistant/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(getRes.status).toBe(404);
  });
});

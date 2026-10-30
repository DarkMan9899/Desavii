/**
 * AI search (Stage 15.2 + Home AI discovery) end to end against the real
 * catalog:
 *
 * - `GET /ai/search/availability` is public and says only whether a real
 *   language model answers — false here, where the deterministic `local`
 *   provider is the default — and nothing about which provider;
 * - `POST /ai/search/parse` still requires sign-in;
 * - a parsed query's destination and category are real catalog ids in the
 *   traveller's locale, never values the model wrote.
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

let customerToken;
let yerevanCityId;
let hotelsCategoryId;

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();

  const login = await request(app).post('/api/v1/auth/login').send({
    email: DEV_CREDENTIALS.customer.email,
    password: DEV_CREDENTIALS.customer.password,
  });
  customerToken = login.body.data.access_token;

  const pool = getMysqlPool();
  const [[yerevan]] = await pool.query(
    "SELECT id FROM cities WHERE slug = 'yerevan'",
  );
  yerevanCityId = yerevan.id;
  const [[hotels]] = await pool.query(
    "SELECT id FROM listing_categories WHERE slug = 'hotels'",
  );
  hotelsCategoryId = hotels.id;
});

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /api/v1/ai/search/availability', () => {
  test('is public and reports only whether a real model answers', async () => {
    const res = await request(app).get('/api/v1/ai/search/availability');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ available: false });
  });
});

describe('POST /api/v1/ai/search/parse', () => {
  test('requires sign-in', async () => {
    const res = await request(app)
      .post('/api/v1/ai/search/parse')
      .send({ query: 'hotels in Yerevan' });
    expect(res.status).toBe(401);
  });

  test('resolves the destination and category to real catalog ids', async () => {
    const res = await request(app)
      .post('/api/v1/ai/search/parse')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ query: 'quiet hotels in Yerevan for two', locale: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      city_id: yerevanCityId,
      category_id: hotelsCategoryId,
    });
  });
});

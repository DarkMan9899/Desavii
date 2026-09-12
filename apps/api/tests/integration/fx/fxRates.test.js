/**
 * Pass 8 (Multi-Currency / CBA FX Pricing) — `GET /fx/rates`.
 *
 * `NODE_ENV=test` always resolves `config.fx.provider` to `'fixture'`
 * (`config/index.js`), regardless of `FX_PROVIDER` — so this suite never
 * touches the real CBA endpoint and gets fully deterministic rates
 * (brief §29). `FixtureExchangeRateProvider`'s own defaults are the
 * source of truth for the expected values below — never re-hardcoded
 * independently of that file.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import {
  getMysqlPool,
  closeMysqlPool,
} from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';

beforeAll(async () => {
  await resetRateLimits();
  getMysqlPool();
});

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('GET /fx/rates', () => {
  test('is public (no Authorization header required) and returns the brief §13 shape', async () => {
    const res = await request(app).get('/api/v1/fx/rates');

    expect(res.status).toBe(200);
    expect(res.body.data.baseCurrency).toBe('AMD');
    expect(res.body.data.source).toBe('fixture');
    expect(res.body.data.effectiveAt).toBeTruthy();
    // AMD is always the identity rate, never fetched from the provider.
    expect(res.body.data.rates.AMD).toBe('1.00000000');
    // FixtureExchangeRateProvider's own defaults: USD Amount=1/Rate=400.00,
    // RUB Amount=1/Rate=4.50 — both already Amount=1, so normalization is
    // a pass-through here (the Amount!=1 case is covered by
    // fxConversion.test.js's own dedicated JPY/IRR-style assertions).
    expect(res.body.data.rates.USD).toBe('400.00000000');
    expect(res.body.data.rates.RUB).toBe('4.50000000');
  });

  test('a second request is served from cache and returns identical rates', async () => {
    const first = await request(app).get('/api/v1/fx/rates');
    const second = await request(app).get('/api/v1/fx/rates');

    expect(second.status).toBe(200);
    expect(second.body.data).toEqual(first.body.data);
  });
});

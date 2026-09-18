/**
 * Step A2 — exercises `POST /analytics/events` under the DEFAULT
 * `ANALYTICS_COLLECTION_ENABLED=false` (the safe default in every
 * environment, no `devDefault`, see config/index.js) — no env override
 * needed here, static imports are fine.
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

let pool;

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
  pool = getMysqlPool();
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

describe('POST /analytics/events with collection disabled', () => {
  test('returns 204 and writes nothing, even for a garbage listingId — target resolution is skipped entirely', async () => {
    const [[before]] = await pool.query(
      'SELECT COUNT(*) AS count FROM analytics_events',
    );
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: '4b3f1c9a-2e1d-4a3b-8c2d-1a2b3c4d5e6f',
            eventName: 'listing_impression',
            sessionId: '5c4f2d0b-3f2e-4b4c-9d3e-2b3c4d5e6f70',
            listingId: 999_999_999,
            placement: 'search_results',
          },
        ],
      });
    expect(res.status).toBe(204);
    const [[after]] = await pool.query(
      'SELECT COUNT(*) AS count FROM analytics_events',
    );
    expect(after.count).toBe(before.count);
  });

  test('remains usable anonymously (no Authorization header, no 401)', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({
        events: [
          {
            eventId: '6f5e4d3c-2b1a-4a3b-8c2d-1a2b3c4d5e6f',
            eventName: 'search_impression',
            sessionId: '7f6e5d4c-3b2a-4a3b-8c2d-1a2b3c4d5e6f',
            resultCount: 5,
          },
        ],
      });
    expect(res.status).toBe(204);
  });

  test('still enforces structural validation (422) while disabled', async () => {
    const res = await request(app)
      .post('/api/v1/analytics/events')
      .send({ events: [] });
    expect(res.status).toBe(422);
  });
});

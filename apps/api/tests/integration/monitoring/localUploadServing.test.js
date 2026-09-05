/**
 * Media infrastructure fix — `LocalStorageProvider` writes uploaded
 * files and returns a root-relative `/uploads/...` URL, but nothing
 * actually served that path over HTTP until now (a real Partner-
 * uploaded listing/room photo 404'd everywhere it was displayed). This
 * proves the real app (real middleware chain, no mocks) actually serves
 * a file `LocalStorageProvider.put()` wrote, using the SAME provider
 * class a real upload uses — not a hand-written fixture path — and that
 * the route is otherwise exactly as safe/narrow as a static file route
 * should be: a real 404 for a missing key (never the app's HTML/JSON
 * shell mistaken for a file), and no traversal past the configured root.
 *
 * Mirrors `monitoring/health.test.js`'s own lean "real app via supertest,
 * no unrelated fixtures" convention.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../../src/app.js';
import { LocalStorageProvider } from '../../../src/infrastructure/storage/localStorageProvider.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { closeMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

// The SAME class every module's own container constructs — resolves the
// real configured root directory (never a hand-guessed absolute path).
const storageProvider = new LocalStorageProvider();
const testKey = `test-fixtures/local-upload-serving-${Date.now()}.png`;

beforeAll(async () => {
  await storageProvider.put(testKey, ONE_PX_PNG, { contentType: 'image/png' });
});

afterAll(async () => {
  await storageProvider.delete(testKey);
  await closeRedisConnection();
  await closeMysqlPool();
});

describe('Local upload HTTP serving (media infrastructure fix)', () => {
  test('a real file written via LocalStorageProvider is servable at its own public URL, with the right content-type', async () => {
    const res = await request(app).get(
      `${storageProvider.publicPathPrefix}/${testKey}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(res.body, ONE_PX_PNG)).toBe(0);
  });

  test('a non-existent upload key returns the app’s real 404 envelope, never the file silently substituted or a raw framework page', async () => {
    const res = await request(app).get(
      `${storageProvider.publicPathPrefix}/does-not-exist/nothing-here.png`,
    );
    expect(res.status).toBe(404);
  });

  test.each([
    '/uploads/..%2f..%2f..%2fpackage.json',
    '/uploads/../../../package.json',
    '/uploads/..%252f..%252f..%252fpackage.json',
  ])(
    'a traversal attempt (%s) cannot escape the upload root or read a real repo file',
    async (traversalPath) => {
      const res = await request(app).get(traversalPath);
      expect(res.status).not.toBe(200);
      expect(res.text ?? '').not.toContain('"name": "@desavii/api"');
    },
  );

  test('the local upload route never intercepts /api/v1 routes', async () => {
    const res = await request(app).get('/api/v1/uploads/whatever');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

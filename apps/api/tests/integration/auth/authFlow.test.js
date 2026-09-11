/**
 * Sprint 6: full register -> login -> refresh (rotation + reuse
 * detection) -> logout HTTP flow, end-to-end through the real Express
 * app (same style as tests/integration/monitoring/health.test.js).
 * Implements API_SPECIFICATION.md §6-7, §27.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { up } from '../../../src/infrastructure/database/migrate.js';
import { seedAll } from '../../../src/infrastructure/database/seeds/index.js';
import app from '../../../src/app.js';
import { closeMysqlPool } from '../../../src/infrastructure/database/mysqlPool.js';
import { closeRedisConnection } from '../../../src/infrastructure/cache/redisClient.js';
import { resetRateLimits } from '../helpers/resetRateLimits.js';

beforeAll(async () => {
  await up();
  await seedAll();
  await resetRateLimits();
}, 60_000);

afterAll(async () => {
  await closeMysqlPool();
  await closeRedisConnection();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

describe('Auth flow: register -> login -> me -> refresh -> logout', () => {
  const email = uniqueEmail('auth-flow');
  const password = 'StrongPass!2024';

  test('POST /auth/register creates an account and returns tokens, never the password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Test', lastName: 'User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toEqual(expect.any(String));
    expect(res.body.data.refresh_token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  test('POST /auth/register rejects a duplicate email with 409 EMAIL_ALREADY_EXISTS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Test', lastName: 'User' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  test('POST /auth/register rejects a weak password with 422', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail('weak'),
        password: 'weak',
        firstName: 'Test',
        lastName: 'User',
      });

    expect(res.status).toBe(422);
  });

  let accessToken;
  let refreshToken;
  let userId;

  test('POST /auth/login authenticates with the just-registered credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    ({ access_token: accessToken, refresh_token: refreshToken } =
      res.body.data);
    userId = res.body.data.user.id;
    expect(accessToken).toEqual(expect.any(String));
  });

  test('POST /auth/login rejects the wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'TotallyWrong!1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('GET /auth/me returns identity, global roles, and resolved permissions', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.roles).toContain('CUSTOMER');
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    // Phase 8: toUserDto now additively carries the same preference/avatar
    // fields userController's toUserResponse already returned, so the
    // frontend Profile page can prefill entirely from this response.
    expect(res.body.data.user).toHaveProperty('avatar_url');
    expect(res.body.data.user).toHaveProperty('preferred_language_id');
    expect(res.body.data.user).toHaveProperty('preferred_currency_id');
  });

  test('GET /auth/me without a token is rejected with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  let rotatedRefreshToken;

  test('POST /auth/refresh rotates the refresh token and issues a new access token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toEqual(expect.any(String));
    rotatedRefreshToken = res.body.data.refresh_token;
    expect(rotatedRefreshToken).not.toBe(refreshToken);
  });

  test('reusing the already-rotated (original) refresh token is detected and rejected', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_REUSE_DETECTED');
  });

  test('reuse detection also revoked the rest of the token family (the rotated token too)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: rotatedRefreshToken });
    expect(res.status).toBe(401);
  });

  test('POST /auth/logout revokes a refresh token; refreshing it afterward fails', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    const freshAccessToken = loginRes.body.data.access_token;
    const freshRefreshToken = loginRes.body.data.refresh_token;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${freshAccessToken}`)
      .send({ refresh_token: freshRefreshToken });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.data.revoked).toBe(true);

    const refreshAfterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: freshRefreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
});

// Sprint L fix: a web client also gets a `session_hint` cookie alongside
// the httpOnly `refresh_token` one, so the frontend can tell "definitely
// no session" apart from "might have one" without ever calling
// `/auth/refresh` — see `authController.js`'s own header for the full
// defect this closes (an unconditional refresh call, and its guaranteed
// 401, on every logged-out page load).
describe('Auth flow: web-client session_hint cookie (Sprint L)', () => {
  const email = uniqueEmail('auth-flow-web-client');
  const password = 'StrongPass!2024';

  function cookieNamed(setCookieHeader, name) {
    return setCookieHeader.find((entry) => entry.startsWith(`${name}=`));
  }

  beforeAll(async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Test', lastName: 'User' });
  });

  test('POST /auth/login as a web client sets both refresh_token (httpOnly) and session_hint (not httpOnly)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client', 'web')
      .send({ email, password });

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();

    const refreshCookie = cookieNamed(setCookie, 'refresh_token');
    const hintCookie = cookieNamed(setCookie, 'session_hint');
    expect(refreshCookie).toEqual(expect.any(String));
    expect(hintCookie).toEqual(expect.any(String));
    expect(refreshCookie.toLowerCase()).toContain('httponly');
    expect(hintCookie.toLowerCase()).not.toContain('httponly');
  });

  test('a non-web client login does not set either cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('POST /auth/logout as a web client clears both cookies', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Client', 'web')
      .send({ email, password });
    const { access_token: accessToken, refresh_token: refreshToken } =
      loginRes.body.data;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('X-Client', 'web')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refresh_token: refreshToken });

    expect(logoutRes.status).toBe(200);
    const setCookie = logoutRes.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    // `res.clearCookie` re-sets the cookie with an already-past `Expires`
    // — the presence of both names here (rather than their absence) is
    // what actually clears them client-side.
    expect(cookieNamed(setCookie, 'refresh_token')).toEqual(expect.any(String));
    expect(cookieNamed(setCookie, 'session_hint')).toEqual(expect.any(String));
  });
});

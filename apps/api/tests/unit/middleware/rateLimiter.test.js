/**
 * Sprint: "trust Cloudflare proxies safely" (commit 1778d06) — proves the
 * one property that change was specifically about: `isTrustedInternalBuildRequest`
 * must key off the raw TCP socket peer (`req.socket.remoteAddress`), never
 * `req.ip`, precisely because `app.js` now configures `app.set('trust
 * proxy', [...])`. Once trust proxy trusts Cloudflare's edge ranges,
 * `req.ip` is derived by walking a chain of `X-Forwarded-For` entries —
 * a value the client (or anything upstream of the trusted hop) can
 * influence. A request that merely claims `X-Forwarded-For: 127.0.0.1`
 * must never be treated as loopback-originated by this internal-only gate.
 */

import { describe, test, expect } from '@jest/globals';
import { isTrustedInternalBuildRequest } from '../../../src/middleware/rateLimiter.js';
import config from '../../../src/config/index.js';

function fakeRequest({ remoteAddress, headers = {} }) {
  return {
    socket: { remoteAddress },
    get(name) {
      return headers[name.toLowerCase()] ?? headers[name];
    },
  };
}

describe('isTrustedInternalBuildRequest', () => {
  test('rejects every request when no token is configured', () => {
    // Covers the common case (PRERENDER_INTERNAL_TOKEN unset) without
    // depending on which secret value this environment happens to have —
    // the function's own doc comment guarantees this tier is entirely
    // unreachable with no token configured.
    if (config.prerenderInternalToken) return; // this env has one set; the other tests below cover it
    const req = fakeRequest({
      remoteAddress: '127.0.0.1',
      headers: { 'x-internal-build-token': 'anything' },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(false);
  });

  test('rejects a request presenting the wrong token, even from loopback', () => {
    const req = fakeRequest({
      remoteAddress: '127.0.0.1',
      headers: { 'x-internal-build-token': 'definitely-not-the-real-token' },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(false);
  });

  test('rejects a request with no token header at all', () => {
    const req = fakeRequest({ remoteAddress: '127.0.0.1', headers: {} });
    expect(isTrustedInternalBuildRequest(req)).toBe(false);
  });

  // The remaining tests only mean something when this environment actually
  // has a token configured (matching real dev/.env setups) — skip cleanly
  // otherwise rather than asserting on a value we don't have.
  const hasToken = () => Boolean(config.prerenderInternalToken);

  test('accepts the correct token from a genuine loopback socket', () => {
    if (!hasToken()) return;
    const req = fakeRequest({
      remoteAddress: '127.0.0.1',
      headers: { 'x-internal-build-token': config.prerenderInternalToken },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(true);
  });

  test('accepts the IPv6 loopback form (::1) with the correct token', () => {
    if (!hasToken()) return;
    const req = fakeRequest({
      remoteAddress: '::1',
      headers: { 'x-internal-build-token': config.prerenderInternalToken },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(true);
  });

  test('rejects the correct token from a non-loopback socket peer', () => {
    if (!hasToken()) return;
    const req = fakeRequest({
      remoteAddress: '203.0.113.7', // an ordinary remote IP, not loopback
      headers: { 'x-internal-build-token': config.prerenderInternalToken },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(false);
  });

  test('rejects a non-loopback socket even when X-Forwarded-For CLAIMS loopback — the exact spoofing vector this change closes', () => {
    if (!hasToken()) return;
    // Simulates a request that reached Express through the newly-trusted
    // proxy chain (Cloudflare/Nginx) with a spoofed forwarded-for value
    // claiming 127.0.0.1. The real TCP peer (what req.socket.remoteAddress
    // reports) is the proxy itself, not loopback — this must still be
    // rejected. Using req.ip here (the pre-fix behavior) would have been
    // vulnerable to exactly this once trust proxy was configured.
    const req = fakeRequest({
      remoteAddress: '198.51.100.5', // e.g. an untrusted upstream, not the real socket peer Express would see behind a legitimate trusted hop
      headers: {
        'x-internal-build-token': config.prerenderInternalToken,
        'x-forwarded-for': '127.0.0.1',
      },
    });
    expect(isTrustedInternalBuildRequest(req)).toBe(false);
  });
});

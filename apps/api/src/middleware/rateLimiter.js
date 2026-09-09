/**
 * Rate-limit foundation.
 *
 * Implements BACKEND_ARCHITECTURE.md §48: Redis-backed (the `ratelimit:`
 * keyspace reserved in src/infrastructure/cache/redisClient.js), enforced
 * at middleware level before any Controller code runs, tiers configured
 * centrally through src/config/index.js rather than hardcoded per route.
 *
 * Sprint 5 scope: the tiered limiter factory plus a global baseline
 * (`publicRateLimiter`, applied platform-wide in app.js). Per-route
 * `authenticatedRateLimiter`/`sensitiveRateLimiter` overrides are wired in
 * by each module's `module.routes.js` once Auth (Module 2) exists to
 * resolve a request's principal — there is no principal to key on yet.
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import config from '../config/index.js';
import {
  getRedisClient,
  REDIS_KEY_PREFIXES,
} from '../infrastructure/cache/redisClient.js';
import { RateLimitError } from '../errors/AppError.js';
import { getModuleLogger } from '../logging/logger.js';

const log = getModuleLogger('middleware:rateLimiter');

/**
 * Rate limiting must never become a single point of failure for the
 * whole API: if Redis is unreachable *during* a request (as opposed to
 * at boot, handled by preventPrematureCrash below), `RedisStore.increment`
 * throws, and express-rate-limit's internal `handleAsyncErrors` wrapper
 * turns that into `next(err)` — which, left unhandled, would reach the
 * global error handler as a raw 500 for every single request. A rate
 * limiter's own infrastructure failing is not a reason to fail the
 * request; only a genuine over-limit (`RateLimitError`, thrown
 * deliberately via the `handler` option below) should reach the client.
 * This wrapper intercepts anything else and fails OPEN.
 */
function failOpenOnStoreError(limiter, label) {
  return (req, res, next) => {
    limiter(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof RateLimitError) {
        next(err);
        return;
      }
      const requestLog = req.log ?? log;
      requestLog.warn(
        { err, limiter: label },
        'Rate limiter store unavailable — failing open',
      );
      next();
    });
  };
}

/**
 * `RedisStore`'s constructor fires two unawaited `SCRIPT LOAD` commands
 * (`incrementScriptSha`/`getScriptSha`) and stores the pending promises as
 * instance properties. If Redis is unreachable at that moment and no HTTP
 * request arrives before Node's microtask checkpoint, those promises are
 * flagged as unhandled rejections and crash the whole process — well
 * before `GET /health/ready` would ever report Redis as down. Attaching a
 * no-op `.catch()` here only silences that premature crash; it does not
 * interfere with `RedisStore`'s own internal retry/error-handling (Ch.42),
 * which independently awaits the same promise reference on first real use.
 */
function preventPrematureCrash(store) {
  store.incrementScriptSha?.catch(() => {});
  store.getScriptSha?.catch(() => {});
  return store;
}

function createRateLimiter({ max, prefix }) {
  return rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: preventPrematureCrash(
      new RedisStore({
        prefix: `${REDIS_KEY_PREFIXES.RATE_LIMIT}${prefix}:`,
        sendCommand: (...args) => getRedisClient().call(...args),
      }),
    ),
    handler: (req, res, next) => {
      next(new RateLimitError());
    },
  });
}

/** Unauthenticated/public traffic — the global baseline applied in app.js. */
export const publicRateLimiter = failOpenOnStoreError(
  createRateLimiter({
    max: config.rateLimit.publicPerMinute,
    prefix: 'public',
  }),
  'public',
);

/** Standard authenticated traffic — applied per-route once Auth exists. */
export const authenticatedRateLimiter = failOpenOnStoreError(
  createRateLimiter({
    max: config.rateLimit.authenticatedPerMinute,
    prefix: 'authenticated',
  }),
  'authenticated',
);

/** Login, password reset, coupon-redemption-class sensitive endpoints. */
export const sensitiveRateLimiter = failOpenOnStoreError(
  createRateLimiter({
    max: config.rateLimit.sensitivePerMinute,
    prefix: 'sensitive',
  }),
  'sensitive',
);

/**
 * AI Platform endpoints (Phase 15) — deliberately the tightest tier,
 * since every `/ai/*` request potentially calls a metered third-party
 * provider. A fixed, conservative ceiling rather than a new
 * `config.rateLimit.*` env var: unlike the three tiers above (which
 * exist to tune *general* API traffic), this is a cost-control guardrail
 * specific to AI calls, not something an operator needs to retune
 * platform-wide the same way.
 */
export const aiRateLimiter = failOpenOnStoreError(
  createRateLimiter({ max: 20, prefix: 'ai' }),
  'ai',
);

/**
 * A separate, still-bounded tier for the build-time `prerender.mjs`
 * pipeline (Phase 20 SEO) — never reachable from the public internet.
 * `isTrustedInternalBuildRequest` below is app.js's gate into it.
 */
export const internalBuildRateLimiter = failOpenOnStoreError(
  createRateLimiter({
    max: config.rateLimit.internalBuildPerMinute,
    prefix: 'internal-build',
  }),
  'internal-build',
);

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * True only for a request that BOTH presents the exact
 * `PRERENDER_INTERNAL_TOKEN` secret AND originates from the loopback
 * interface. `req.ip` is safe to trust as a non-spoofable signal here:
 * this app never calls `app.set('trust proxy', ...)`, so Express derives
 * it from the raw TCP socket address, never from a client-controlled
 * header like `X-Forwarded-For`. A request from anywhere off-host — even
 * one that somehow guessed the token — still resolves to the ordinary
 * public/authenticated tiers. The token itself defaults to empty
 * (`PRERENDER_INTERNAL_TOKEN` unset), which makes this tier entirely
 * unreachable unless an operator opts in.
 */
export function isTrustedInternalBuildRequest(req) {
  const token = config.prerenderInternalToken;
  if (!token) return false;
  if (req.get('X-Internal-Build-Token') !== token) return false;
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress);
}

export default publicRateLimiter;

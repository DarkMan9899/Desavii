/**
 * Express application assembly + composition root.
 *
 * Implements BACKEND_ARCHITECTURE.md §11 (Middleware): composed once,
 * in a fixed, documented order —
 *   1. Security headers (helmet) + CORS
 *   2. Body parsing (JSON/urlencoded/cookies)
 *   3. Request context (request_id, logger — src/middleware/requestContext.js)
 *   4. Authentication (src/guards/authenticate.js, §12) — populates
 *      req.principal if a valid token is present; never rejects
 *   5. Rate-limit foundation (src/middleware/rateLimiter.js, §48)
 *   6. Routes (health checks, unversioned; `/api/v1` mount point, §49)
 *   7. 404 handler
 *   8. Global error handler (src/middleware/errorHandler.js) — always last
 *
 * This file is also the DI composition root (§17): every concrete
 * infrastructure adapter (Repository implementations) is constructed
 * exactly once, here, and wired to the core port/service that depends on
 * it — nothing below this point ever constructs its own dependency with
 * `new` on a concrete infrastructure class.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import config from './config/index.js';
import logger from './logging/logger.js';
import requestContext from './middleware/requestContext.js';
import authenticate from './guards/authenticate.js';
import requireAuth from './guards/requireAuth.js';
import { requireRole } from './guards/requireRole.js';
import { createRequirePermissionGuard } from './guards/requirePermission.js';
import { createRequireHostGuard } from './guards/requireHost.js';
import {
  publicRateLimiter,
  authenticatedRateLimiter,
  internalBuildRateLimiter,
  isTrustedInternalBuildRequest,
} from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import healthRoutes from './monitoring/healthRoutes.js';
import createV1Router from './routes/v1.js';
import { NotFoundError } from './errors/AppError.js';
import { AuditLogger } from './core/domain/auditLogger.js';
import { DomainEventBus } from './core/events/domainEventBus.js';
import { MySqlAuditLogRepository } from './infrastructure/database/repositories/auditLogRepository.js';
import { PermissionResolver } from './core/domain/permissionResolver.js';
import { MySqlPermissionRepository } from './infrastructure/database/repositories/permissionRepository.js';
import { CachedPermissionRepository } from './infrastructure/cache/cachedPermissionRepository.js';
import { isPartnerOwner } from './infrastructure/database/repositories/partnerEmployeeRepository.js';
import { createStorageProvider } from './infrastructure/storage/createStorageProvider.js';
import { LocalStorageProvider } from './infrastructure/storage/localStorageProvider.js';

const app = express();

app.set('trust proxy', [
  'loopback',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]);

app.set('logger', logger);
app.disable('x-powered-by');

// --- Composition root (BACKEND_ARCHITECTURE.md §17) ---
const auditLogger = new AuditLogger(new MySqlAuditLogRepository());
// Phase 13 (Notifications): shared singleton every module's business
// service publishes domain events onto and the Notifications module
// subscribes to — the same shared-singleton lifecycle as `auditLogger`.
const eventBus = new DomainEventBus();
const permissionResolver = new PermissionResolver(
  new CachedPermissionRepository(new MySqlPermissionRepository()),
);
const guards = {
  requireAuth,
  requireRole,
  requirePermission: createRequirePermissionGuard(permissionResolver),
  // Sprint 6's "Host" role -> the existing partner-scoped OWNER role
  // (docs/SPRINT_6_AUTH_FOUNDATION.md, Architecture Decisions #1).
  requireHost: createRequireHostGuard(isPartnerOwner),
};

// 1. Security headers + CORS (BACKEND_ARCHITECTURE.md §47)
app.use(helmet());
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    credentials: true,
  }),
);

// 1.5 Local media static serving — dev/local-storage compatibility only.
// `LocalStorageProvider.getUrl()` (and every module's `attachMedia`-style
// service method) returns a root-relative `/uploads/...` URL, but until
// now nothing actually served that path over HTTP: a real Partner-
// uploaded listing/room photo 404'd everywhere it was displayed. Only
// mounted when `local` is the ACTIVE provider (`createStorageProvider()`
// is the same composition function every module already uses to decide
// this) — an S3-backed deployment already serves media from the
// bucket's own public URL (`S3StorageProvider#getUrl` always returns an
// absolute URL, never `/uploads/...`), so this route would never be
// reached there anyway; skipping the mount entirely keeps this
// unambiguously dev/local-only. `express.static`'s own `send`-based path
// resolution is what actually prevents `..` traversal escaping
// `rootDir` — never a hand-rolled file-read endpoint. Public, unauthenticated,
// unrate-limited (mounted ahead of both) — the same category as a public
// listing photo already is, and a page's own image requests should never
// compete with the visitor's own JSON-API rate-limit budget.
const storageProvider = createStorageProvider();
if (storageProvider instanceof LocalStorageProvider) {
  app.use(
    storageProvider.publicPathPrefix,
    express.static(storageProvider.rootDir),
  );
}

// 2. Body parsing — cookieParser reads the httpOnly refresh-token cookie
// web clients rely on (FRONTEND_ARCHITECTURE.md §34.1); setting a cookie
// needs no extra middleware, only reading one back does. `verify` captures
// the exact raw bytes onto `req.rawBody` alongside the normal parsed
// `req.body` — added for Phase 16's payment-provider webhook route, which
// needs the untouched raw body to verify a provider's HMAC signature
// (`PaymentProvider#verifyWebhook`). A one-line, additive capture with no
// behavior change for any other route (`req.body` still parses exactly as
// before).
app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 3. Request context (request_id + scoped logger)
app.use(requestContext);

// 4. Authentication — populate-only, never rejects (BACKEND_ARCHITECTURE.md §11's order).
app.use(authenticate);

// 5. Rate-limit foundation, before any route/Controller code (BACKEND_
// ARCHITECTURE.md §48). Health checks are exempt: orchestration
// liveness/readiness probes must never be throttled. `req.principal` is
// already resolved by step 4 above, so an authenticated request gets the
// higher `authenticatedPerMinute` ceiling instead of being capped at the
// public tier — previously every request, authenticated or not, was
// limited to the public tier's 20/min regardless of `authenticatedRateLimiter`
// being fully implemented, which throttled normal logged-in dashboard usage
// far more aggressively than intended (verified during Phase 11 pre-flight).
// Sensitive endpoints (login/register/refresh) layer their own stricter
// `sensitiveRateLimiter` on top at the route level.
//
// `isTrustedInternalBuildRequest` is checked before the public/authenticated
// split: the `prerender.mjs` build pipeline (Phase 20 SEO) crawls every
// public route as an anonymous visitor on purpose (a real crawler is never
// logged in, so the snapshotted HTML must not accidentally show an
// authenticated header/nav state) — it can never carry `req.principal`, so
// without this check it would always fall into the 20/min public tier and
// could never finish a real site's route count. The check itself requires
// both a shared secret header and a loopback-only `req.ip` (rateLimiter.js),
// so it changes nothing about how any real, off-host client is limited.
app.use((req, res, next) => {
  if (req.path.startsWith('/health/')) return next();
  if (isTrustedInternalBuildRequest(req)) {
    return internalBuildRateLimiter(req, res, next);
  }
  const limiter = req.principal ? authenticatedRateLimiter : publicRateLimiter;
  return limiter(req, res, next);
});

// 6. Routes — health checks (unversioned) + the /api/v1 mount point.
app.use(healthRoutes);
const v1 = createV1Router({
  guards,
  auditLogger,
  permissionResolver,
  eventBus,
});
app.use('/api/v1', v1.router);

// Sprint 10: exposes the Service instances `server.js` needs to register
// the hold-expiry/pending-vendor-SLA scheduled jobs. Not used by app.js
// itself, and never imported by tests (which import `app` only) — no
// BullMQ worker starts as a side effect of importing this module.
export const services = {
  availabilityService: v1.availabilityService,
  // Phase 17: registers the scheduled inventory reconciliation sweep.
  inventoryConnectionService: v1.inventoryConnectionService,
  bookingService: v1.bookingService,
  // Phase 13: registers the notification delivery worker.
  notificationDeliveryService: v1.notificationDeliveryService,
  notificationDeliveryQueue: v1.notificationDeliveryQueue,
  // Phase 16: registers the local-provider settlement worker.
  paymentService: v1.paymentService,
  // Sprint E: registers the advertisement lifecycle sweep.
  advertisementService: v1.advertisementService,
};

// 7. 404 — no matching route
app.use((req, res, next) => {
  next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
});

// 8. Global error handler — always last
app.use(errorHandler);

export default app;

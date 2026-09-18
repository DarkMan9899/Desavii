/**
 * Engagement Analytics module route wiring (BACKEND_ARCHITECTURE.md §2:
 * route wiring only, no logic).
 *
 * `POST /events` (mounted at `/analytics` in `routes/v1.js`, giving the
 * full path `POST /analytics/events`) is public — must remain usable
 * anonymously (`authenticate.js` populate-only middleware already ran
 * globally, so `req.principal` is set when a valid token is present and
 * left `undefined` otherwise; no `requireAuth` here). Gated by the
 * dedicated `analyticsRateLimiter` (120/min/IP), never the general
 * public tier.
 */

import { Router } from 'express';
import { analyticsRateLimiter } from '../../middleware/rateLimiter.js';
import { validate } from '../../validation/validate.js';
import { ingestEventsSchema } from './validators/engagementAnalyticsValidators.js';

export default function createEngagementAnalyticsRoutes({
  engagementAnalyticsController,
}) {
  const router = Router();

  router.post(
    '/events',
    analyticsRateLimiter,
    validate(ingestEventsSchema),
    engagementAnalyticsController.ingest,
  );

  return router;
}

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
 *
 * Step A5: the four `GET /partner/*` routes below are authenticated
 * Partner-facing reads, mounted under the SAME `/analytics` prefix
 * (`GET /analytics/partner/...`) — this codebase has no separate
 * `/partner/*` top-level namespace (every module mounts flat under
 * `/api/v1/<module>`, confirmed across `listings`/`bookings`/
 * `partners`), so nesting under this module's own existing `/analytics`
 * mount, rather than inventing a new top-level prefix, is the closest
 * fit to "follow existing Partner route conventions" (brief §7).
 * `requireAuth` is the fast-fail layer only (BACKEND_ARCHITECTURE.md
 * §13) — the real partner-workspace/capability check happens inside
 * `PartnerAnalyticsService`, the same "guard is not the real
 * authorization boundary" rule every other module's route file
 * documents.
 */

import { Router } from 'express';
import { analyticsRateLimiter } from '../../middleware/rateLimiter.js';
import { validate } from '../../validation/validate.js';
import { ingestEventsSchema } from './validators/engagementAnalyticsValidators.js';
import {
  partnerAnalyticsOverviewQuerySchema,
  partnerAnalyticsListingsQuerySchema,
  partnerAnalyticsListingDetailSchema,
  partnerAnalyticsPromotionDetailSchema,
} from './validators/partnerAnalyticsValidators.js';

export default function createEngagementAnalyticsRoutes({
  engagementAnalyticsController,
  partnerAnalyticsController,
  guards,
}) {
  const router = Router();
  const { requireAuth } = guards;

  router.post(
    '/events',
    analyticsRateLimiter,
    validate(ingestEventsSchema),
    engagementAnalyticsController.ingest,
  );

  router.get(
    '/partner/overview',
    requireAuth,
    validate(partnerAnalyticsOverviewQuerySchema),
    partnerAnalyticsController.getOverview,
  );
  router.get(
    '/partner/listings',
    requireAuth,
    validate(partnerAnalyticsListingsQuerySchema),
    partnerAnalyticsController.listListings,
  );
  router.get(
    '/partner/listings/:listingId',
    requireAuth,
    validate(partnerAnalyticsListingDetailSchema),
    partnerAnalyticsController.getListingDetail,
  );
  router.get(
    '/partner/promotions/:promotionId',
    requireAuth,
    validate(partnerAnalyticsPromotionDetailSchema),
    partnerAnalyticsController.getPromotionDetail,
  );

  return router;
}

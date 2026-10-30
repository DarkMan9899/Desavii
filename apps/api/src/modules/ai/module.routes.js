/**
 * AI module route wiring (Phase 15, BACKEND_ARCHITECTURE.md §2: route
 * wiring only, no logic). Every route is `requireAuth` + `aiRateLimiter`
 * — grows across Stages 15.1-15.6 as each feature's routes are added.
 * The one exception is `GET /search/availability`: public (guests see the
 * Home AI entry), it calls no model and returns only a boolean, under the
 * platform-wide `publicRateLimiter`.
 */

import { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  memoryKeyParamsSchema,
  noopSchema,
  conversationIdParamsSchema,
  planTripSchema,
  parseSearchQuerySchema,
  askAssistantSchema,
  listAssistantConversationsQuerySchema,
  partnerAiNoopBodySchema,
  partnerAiTitleSchema,
  partnerAiTranslateSchema,
  moderationQueueQuerySchema,
  moderationScoreParamsSchema,
  aiUsageQuerySchema,
  partnerAiUsageQuerySchema,
} from './validators/aiValidators.js';
import { aiRateLimiter } from '../../middleware/rateLimiter.js';

export default function createAiRoutes({
  aiMemoryController,
  tripPlannerController,
  aiSearchController,
  assistantController,
  recommendationController,
  partnerAiController,
  moderationController,
  aiUsageController,
  guards,
}) {
  const router = Router();
  const { requireAuth, requirePermission } = guards;
  const requireAdminAiTools = requirePermission('ai.admin_tools');
  const requireAiUsageView = requirePermission('ai.usage_view');

  router.get(
    '/memory',
    requireAuth,
    aiRateLimiter,
    validate(noopSchema),
    aiMemoryController.list,
  );

  router.delete(
    '/memory/:key',
    requireAuth,
    aiRateLimiter,
    validate(memoryKeyParamsSchema),
    aiMemoryController.remove,
  );

  router.post(
    '/trip-planner',
    requireAuth,
    aiRateLimiter,
    validate(planTripSchema),
    tripPlannerController.plan,
  );

  router.get(
    '/trip-planner/:id',
    requireAuth,
    aiRateLimiter,
    validate(conversationIdParamsSchema),
    tripPlannerController.getById,
  );

  router.get(
    '/search/availability',
    validate(noopSchema),
    aiSearchController.availability,
  );

  router.post(
    '/search/parse',
    requireAuth,
    aiRateLimiter,
    validate(parseSearchQuerySchema),
    aiSearchController.parse,
  );

  router.post(
    '/assistant',
    requireAuth,
    aiRateLimiter,
    validate(askAssistantSchema),
    assistantController.ask,
  );

  router.post(
    '/assistant/stream',
    requireAuth,
    aiRateLimiter,
    validate(askAssistantSchema),
    assistantController.stream,
  );

  router.get(
    '/assistant/conversations',
    requireAuth,
    aiRateLimiter,
    validate(listAssistantConversationsQuerySchema),
    assistantController.listConversations,
  );

  router.get(
    '/assistant/conversations/:id',
    requireAuth,
    aiRateLimiter,
    validate(conversationIdParamsSchema),
    assistantController.getConversation,
  );

  router.delete(
    '/assistant/conversations/:id',
    requireAuth,
    aiRateLimiter,
    validate(conversationIdParamsSchema),
    assistantController.deleteConversation,
  );

  router.get(
    '/recommendations',
    requireAuth,
    aiRateLimiter,
    validate(noopSchema),
    recommendationController.list,
  );

  router.post(
    '/partner/listings/:listingId/description',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiNoopBodySchema),
    partnerAiController.generateDescription,
  );

  router.post(
    '/partner/listings/:listingId/seo',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiNoopBodySchema),
    partnerAiController.generateSeo,
  );

  router.post(
    '/partner/listings/:listingId/title',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiTitleSchema),
    partnerAiController.generateTitle,
  );

  router.post(
    '/partner/listings/:listingId/amenities',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiNoopBodySchema),
    partnerAiController.generateAmenities,
  );

  router.post(
    '/partner/listings/:listingId/translate',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiTranslateSchema),
    partnerAiController.translate,
  );

  router.post(
    '/partner/listings/:listingId/faqs',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiNoopBodySchema),
    partnerAiController.generateFaqs,
  );

  router.get(
    '/partner/usage',
    requireAuth,
    aiRateLimiter,
    validate(partnerAiUsageQuerySchema),
    aiUsageController.partnerDashboard,
  );

  router.get(
    '/admin/moderation-queue',
    requireAuth,
    aiRateLimiter,
    requireAdminAiTools,
    validate(moderationQueueQuerySchema),
    moderationController.queue,
  );

  router.post(
    '/admin/moderation/:listingId/score',
    requireAuth,
    aiRateLimiter,
    requireAdminAiTools,
    validate(moderationScoreParamsSchema),
    moderationController.score,
  );

  router.get(
    '/admin/usage',
    requireAuth,
    aiRateLimiter,
    requireAiUsageView,
    validate(aiUsageQuerySchema),
    aiUsageController.dashboard,
  );

  return router;
}

/**
 * AI module Zod validators (Phase 15) — structural/format validation
 * only, mirroring `messagingValidators.js`'s exact conventions.
 */

import { z } from 'zod';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();

export const memoryKeyParamsSchema = z.object({
  params: z.object({ key: z.string().trim().min(1).max(60) }),
  query: passthroughQuery,
  body: z.any(),
});

export const noopSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.any(),
});

export const conversationIdParamsSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.any(),
});

export const planTripSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    destination: z.string().trim().min(1).max(120),
    days: z.coerce.number().int().min(1).max(30),
    budget: z.coerce.number().positive(),
    currency: z.string().trim().length(3).optional(),
    interests: z.array(z.string().trim().min(1).max(60)).max(10).optional(),
  }),
});

export const parseSearchQuerySchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    query: z.string().trim().min(1).max(200),
    locale: z.string().trim().min(2).max(10).optional(),
  }),
});

export const askAssistantSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    message: z.string().trim().min(1).max(2000),
    contextType: z.enum(['listing', 'booking']).optional(),
    contextId: z.coerce.number().int().positive().optional(),
    conversationId: z.coerce.number().int().positive().optional(),
  }),
});

export const listAssistantConversationsQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

const listingIdParamsSchema = z.object({
  listingId: z.coerce.number().int().positive(),
});

export const partnerAiNoopBodySchema = z.object({
  params: listingIdParamsSchema,
  query: passthroughQuery,
  body: z.any(),
});

export const partnerAiTitleSchema = z.object({
  params: listingIdParamsSchema,
  query: passthroughQuery,
  body: z.object({
    keyFeature: z.string().trim().min(1).max(80).optional(),
  }),
});

export const partnerAiTranslateSchema = z.object({
  params: listingIdParamsSchema,
  query: passthroughQuery,
  body: z.object({
    targetLanguageCode: z.string().trim().length(2),
  }),
});

export const moderationQueueQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const moderationScoreParamsSchema = z.object({
  params: listingIdParamsSchema,
  query: passthroughQuery,
  body: z.any(),
});

export const aiUsageQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    since: z.string().datetime().optional(),
  }),
  body: z.any(),
});

export const partnerAiUsageQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    partnerId: z.coerce.number().int().positive(),
    since: z.string().datetime().optional(),
  }),
  body: z.any(),
});

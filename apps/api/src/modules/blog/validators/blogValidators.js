/**
 * Blog module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10).
 * Slug-uniqueness/category-existence/publishability failures are Layer 3
 * (database-dependent) and live in `BlogService`.
 */

import { z } from 'zod';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();
const idParams = z.object({ id: z.coerce.number().int().positive() });
const noBody = z.any();

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Slug must be lowercase, hyphen-separated.',
  );

export const createDraftSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    title: z.string().trim().min(1).max(255),
    languageCode: z.string().trim().min(2).max(5).optional(),
  }),
});

export const postIdParamsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: noBody,
});

export const listPostsAdminQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    limit: z.coerce.number().int().positive().max(200).optional(),
    status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
    categoryId: z.coerce.number().int().positive().optional(),
    authorUserId: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(255).optional(),
  }),
  body: noBody,
});

export const updateSettingsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    slug: slugSchema.optional(),
    categorySlug: slugSchema.nullable().optional(),
    tagNames: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  }),
});

export const upsertTranslationSchema = z.object({
  params: z.object({
    id: z.coerce.number().int().positive(),
    languageCode: z.string().trim().min(2).max(5),
  }),
  query: passthroughQuery,
  body: z.object({
    title: z.string().trim().min(1).max(255),
    excerpt: z.string().trim().max(500),
    body: z.string().max(100_000),
    seoTitle: z.string().trim().max(255).optional(),
    seoDescription: z.string().trim().max(500).optional(),
  }),
});

export const attachCoverImageQuerySchema = z.object({
  params: idParams,
  query: z.object({ altText: z.string().trim().max(255).optional() }),
  body: noBody,
});

export const scheduleSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  }),
});

export const publicListQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    limit: z.coerce.number().int().positive().max(50).optional(),
    cursor: z.coerce.number().int().nonnegative().optional(),
    category: slugSchema.optional(),
    tag: slugSchema.optional(),
    locale: z.string().trim().min(2).max(5).optional(),
  }),
  body: noBody,
});

export const publicSlugParamsSchema = z.object({
  params: z.object({ slug: slugSchema }),
  query: z.object({ locale: z.string().trim().min(2).max(5).optional() }),
  body: noBody,
});

export const publicTaxonomyQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({ locale: z.string().trim().min(2).max(5).optional() }),
  body: noBody,
});

export const marketingRoleSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({ userId: z.coerce.number().int().positive() }),
});

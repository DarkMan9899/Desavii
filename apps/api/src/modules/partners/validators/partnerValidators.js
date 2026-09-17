/**
 * Partners module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10).
 * Phase 10: the module's first request-shape validation, for the two
 * new public Companies endpoints.
 */

import { z } from 'zod';

const passthroughQuery = z.object({}).passthrough();

export const listPublicPartnersQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const partnerSlugParamsSchema = z.object({
  params: z.object({ slug: z.string().trim().min(1).max(180) }),
  query: passthroughQuery,
  body: z.any(),
});

// Company Public Profile (Step A1) — same slug param as
// `partnerSlugParamsSchema`, same cursor/limit query as
// `listPublicPartnersQuerySchema`.
export const listCompanyListingsSchema = z.object({
  params: z.object({ slug: z.string().trim().min(1).max(180) }),
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

// Phase 11 Admin Platform.
export const userIdParamsSchema = z.object({
  params: z.object({ userId: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.any(),
});

// Stage 11.2 (Partner Management) — admin-scoped endpoints.
export const listPartnersAdminQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    keyword: z.string().trim().min(1).max(180).optional(),
    verificationStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
    moderationStatus: z.enum(['APPROVED', 'FLAGGED']).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const partnerIdParamsSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.any(),
});

export const updateVerificationStatusSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_CHANGES']),
    reviewNote: z.string().trim().max(2000).optional(),
  }),
});

// P1.2 (Master Roadmap) — self-service partner onboarding. Every text
// field is optional at DRAFT-save time (a draft may be incomplete) —
// `submitMyApplication`'s own Service-layer check is what actually
// enforces REQUIRED_FIELDS_TO_SUBMIT before an application can move to
// PENDING. No legal/KYC document fields — see partnerService.js's
// REQUIRED_FIELDS_TO_SUBMIT comment for that deliberate extension point.
const applicationFieldsSchema = z.object({
  // No `.min(1)`: unlike `displayName` (never legitimately blank once an
  // application exists — the UI's own `required` rule keeps a blank
  // value from ever reaching a PATCH in practice), `legalName` has no
  // such UI-side enforcement — `ApplicationForm`'s untouched fields send
  // `''`, not `undefined`, on every draft save (`Save draft` submits the
  // whole form, not just changed fields) — so `.min(1)` here would 422 a
  // perfectly normal "not filled in yet" draft save.
  legalName: z.string().trim().max(255).optional().or(z.literal('')),
  displayName: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  website: z.string().trim().url().max(255).optional().or(z.literal('')),
});

export const createApplicationSchema = z.object({
  params: z.object({}).passthrough(),
  query: passthroughQuery,
  body: applicationFieldsSchema.extend({
    displayName: z.string().trim().min(1).max(255),
  }),
});

export const updateApplicationSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: applicationFieldsSchema,
});

export const updateModerationStatusSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.object({
    status: z.enum(['APPROVED', 'FLAGGED']),
  }),
});

// P1.3 (Master Roadmap) — owner/staff company-profile editing. Fixed,
// known social-platform keys rather than an arbitrary-key record: this
// schema's `partners.social_links` column doc comment ("Map of platform
// -> URL") already implies a bounded vocabulary, and an unbounded record
// would let a caller stuff arbitrary keys into a column every reader
// (public profile page, future admin tooling) assumes has a known shape.
const socialLinksSchema = z
  .object({
    facebook: z.string().trim().url().max(255).optional().or(z.literal('')),
    instagram: z.string().trim().url().max(255).optional().or(z.literal('')),
    x: z.string().trim().url().max(255).optional().or(z.literal('')),
    youtube: z.string().trim().url().max(255).optional().or(z.literal('')),
    tiktok: z.string().trim().url().max(255).optional().or(z.literal('')),
    linkedin: z.string().trim().url().max(255).optional().or(z.literal('')),
  })
  .strict();

export const updateProfileSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z
    .object({
      displayName: z.string().trim().min(1).max(255).optional(),
      email: z.string().trim().email().max(255).optional().or(z.literal('')),
      phone: z.string().trim().max(30).optional(),
      website: z.string().trim().url().max(255).optional().or(z.literal('')),
      description: z.string().trim().max(5000).optional(),
      // Which language `description` is written in — the dashboard's own
      // current UI locale, matching `LANGUAGE_ID_BY_LOCALE`'s existing
      // frontend convention (`modules/listings/constants/languageIds.js`).
      // Required only when `description` is present — enforced below via
      // `.refine`, not `.min(1)` on the field itself, since every other
      // field may be updated with no `description` in the same request.
      locale: z.enum(['en', 'hy', 'ru']).optional(),
      socialLinks: socialLinksSchema.optional(),
    })
    .refine(
      (body) => body.description === undefined || body.locale !== undefined,
      {
        message: 'locale is required when description is present.',
        path: ['locale'],
      },
    ),
});

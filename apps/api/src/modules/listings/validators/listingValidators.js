/**
 * Listings module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10) —
 * structural/format validation only, from the request payload alone.
 * Business-rule validation that requires a database read (slug
 * uniqueness, `UNKNOWN_LISTING_TYPE`, partner verification, publish
 * readiness) lives in `ListingService`, never here
 * (BOOKING_ENGINE_ARCHITECTURE.md §11.1).
 *
 * The media-upload endpoint uses a raw binary body (`express.raw()`,
 * scoped in `module.routes.js`), same pattern as
 * `modules/users/validators/userValidators.js`'s avatar route.
 */

import { z } from 'zod';
import { LISTING_STATUSES } from '../../../core/domain/listingStatusTransitions.js';

const idParams = z.object({ id: z.coerce.number().int().positive() });
// Phase 20 (SEO): the public single-listing GET route is the one place a
// visitor-facing URL is allowed to be either the numeric id (legacy /
// still-shared links) or the listing's slug (the canonical, indexable
// form) — every write/admin/media route below keeps the strict numeric
// `idParams`, since those are never reached via a user-typed/crawled URL.
const idOrSlugParams = z.object({
  id: z.string().trim().min(1).max(180),
});
const mediaIdParams = z.object({
  id: z.coerce.number().int().positive(),
  mediaId: z.coerce.number().int().positive(),
});
const passthroughQuery = z.object({}).passthrough();

const translationSchema = z.object({
  languageId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  seoTitle: z.string().trim().max(255).optional(),
  seoDescription: z.string().trim().max(500).optional(),
});

const locationSchema = z.object({
  addressId: z.coerce.number().int().positive().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

const positiveIdArray = z.array(z.coerce.number().int().positive());

// Phase 5 — Partner Listing Wizard: attribute/policy/pricing/booking-rule
// payloads are all keyed by `code` (never an internal id), matching the
// convention `GET /listings/metadata` and the search module's `attr_{code}`
// params already established. `ListingService` resolves codes -> ids and
// validates data-type/range/required-ness against the metadata tables —
// none of that is (or could be) expressed as static Zod here, since the
// set of valid codes is data, not a fixed enum.
const attributeValueSchema = z
  .object({
    code: z.string().trim().min(1).max(60),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    optionCodes: z.array(z.string().trim().min(1).max(60)).optional(),
  })
  .refine(
    (data) => data.value !== undefined || data.optionCodes !== undefined,
    {
      message: 'Either value or optionCodes must be provided.',
    },
  );

const policyValueSchema = z.object({
  code: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(255),
});

const pricingSchema = z.object({
  modelCode: z.string().trim().min(1).max(30),
  amount: z.coerce.number().nonnegative(),
  currencyCode: z.string().trim().length(3),
});

const bookingRulesSchema = z.object({
  minimumStayNights: z.coerce.number().int().positive().optional(),
  maximumStayNights: z.coerce.number().int().positive().optional(),
  advanceBookingMinHours: z.coerce.number().int().min(0).optional(),
  advanceBookingMaxDays: z.coerce.number().int().min(0).optional(),
});

export const listingIdParamsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.any(),
});

// Listing Lifetime / Renewal, Step B3: `publicationPeriodDays` is optional
// here on purpose — whether it's actually REQUIRED depends on server-side
// state (a listing already mid-lifecycle vs. its first lifecycle-managed
// publish) that this Layer-2 schema has no way to know. This layer only
// enforces the structural shape (a real integer, if present); the
// authoritative allowed-value list (`core/domain/listingLifecycle.js`'s
// `PUBLICATION_PERIOD_DAYS_OPTIONS`) and the "was it required" business
// rule are both checked in `ListingService#publishListing`, alongside
// every other publish-readiness requirement, so a rejected value reports
// through the exact same `error.details` shape as every other readiness
// issue.
export const publishListingSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z
    .object({
      publicationPeriodDays: z.coerce.number().int().optional(),
    })
    .default({}),
});

export const listingIdOrSlugParamsSchema = z.object({
  params: idOrSlugParams,
  query: passthroughQuery,
  body: z.any(),
});

export const listingMediaIdParamsSchema = z.object({
  params: mediaIdParams,
  query: passthroughQuery,
  body: z.any(),
});

export const createListingSchema = z.object({
  params: z.object({}).passthrough(),
  query: passthroughQuery,
  body: z.object({
    partnerId: z.coerce.number().int().positive(),
    listingType: z.string().trim().min(1).max(30),
    slug: z.string().trim().min(1).max(180).optional(),
    isContactVisible: z.boolean().optional(),
    translations: z.array(translationSchema).min(1),
    location: locationSchema.optional(),
    categoryIds: positiveIdArray.optional(),
    amenityIds: positiveIdArray.optional(),
    attributeValues: z.array(attributeValueSchema).optional(),
    policyValues: z.array(policyValueSchema).optional(),
    pricing: pricingSchema.optional(),
    bookingRules: bookingRulesSchema.optional(),
  }),
});

export const updateListingSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z
    .object({
      slug: z.string().trim().min(1).max(180).optional(),
      canonicalUrl: z.string().trim().url().max(500).optional(),
      ogImageMediaId: z.coerce.number().int().positive().optional(),
      isIndexable: z.boolean().optional(),
      isSitemapIncluded: z.boolean().optional(),
      isContactVisible: z.boolean().optional(),
      translations: z.array(translationSchema).min(1).optional(),
      location: locationSchema.optional(),
      categoryIds: positiveIdArray.optional(),
      amenityIds: positiveIdArray.optional(),
      attributeValues: z.array(attributeValueSchema).optional(),
      policyValues: z.array(policyValueSchema).optional(),
      pricing: pricingSchema.optional(),
      bookingRules: bookingRulesSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided.',
    }),
});

export const listListingsQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    partnerId: z.coerce.number().int().positive().optional(),
    listingType: z.string().trim().min(1).max(30).optional(),
    status: z.enum(LISTING_STATUSES).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const listingMetadataQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    categoryId: z.coerce.number().int().positive(),
    locale: z.string().trim().min(2).max(10).optional(),
  }),
  body: z.any(),
});

// Stage 11.3 (Admin Platform — Listing Moderation).
const LISTING_MODERATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'FLAGGED',
];

export const listListingsAdminQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    keyword: z.string().trim().min(1).max(180).optional(),
    moderationStatus: z.enum(LISTING_MODERATION_STATUSES).optional(),
    status: z.enum(LISTING_STATUSES).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const updateListingModerationStatusSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    status: z.enum(LISTING_MODERATION_STATUSES),
    notes: z.string().trim().max(2000).optional(),
  }),
});

export const updateListingMediaSchema = z.object({
  params: mediaIdParams,
  query: passthroughQuery,
  body: z
    .object({
      position: z.coerce.number().int().min(0).optional(),
      isCover: z.boolean().optional(),
      altText: z.string().trim().max(255).optional(),
      caption: z.string().trim().max(500).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided.',
    }),
});

// --- Phase 18 (Premium Listing Detail): highlights / itinerary /
// included-items / FAQs — each a full-replace PATCH, matching the
// repository's own full-replace semantics (see mysqlListingRepository.js).

// 2026 Partner Workspace redesign (Sprint 3): `languageCode` is optional
// on all four — an omitted value falls back to the platform default
// locale server-side (`resolveLocaleIds`), matching every caller that
// existed before this field was added.

export const replaceHighlightsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    languageCode: z.enum(['en', 'hy', 'ru']).optional(),
    highlights: z
      .array(
        z.object({
          iconCode: z.string().trim().min(1).max(40),
          text: z.string().trim().min(1).max(150),
        }),
      )
      .max(12),
  }),
});

export const replaceItineraryStepsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    languageCode: z.enum(['en', 'hy', 'ru']).optional(),
    steps: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(150),
          description: z.string().trim().max(2000).optional(),
          durationMinutes: z.coerce.number().int().min(1).max(1440).optional(),
        }),
      )
      .max(30),
  }),
});

export const replaceIncludedItemsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    languageCode: z.enum(['en', 'hy', 'ru']).optional(),
    items: z
      .array(
        z.object({
          itemText: z.string().trim().min(1).max(200),
          isIncluded: z.boolean(),
        }),
      )
      .max(40),
  }),
});

export const replaceFaqsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    languageCode: z.enum(['en', 'hy', 'ru']).optional(),
    faqs: z
      .array(
        z.object({
          question: z.string().trim().min(1).max(255),
          answer: z.string().trim().min(1).max(2000),
        }),
      )
      .max(20),
  }),
});

export const listingCompletenessSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.any(),
});

/**
 * Advertising module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md
 * §10) — structural/format validation only. Placement/product/listing-
 * category consistency, overlap checks, and transition legality are
 * Layer 3 (database-dependent) concerns and live in `AdvertisementService`.
 */

import { z } from 'zod';
import { isoDateSchema } from '../../../validation/isoDate.js';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();
const idParams = z.object({ id: z.coerce.number().int().positive() });

export const listCatalogSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.any(),
});

export const createAdvertisementSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z
    .object({
      listingId: z.coerce.number().int().positive(),
      placementCode: z.enum(['HOMEPAGE_SECTION', 'CATEGORY_TOP']),
      categoryId: z.coerce.number().int().positive().optional(),
      // Always required — every promotion snapshots a real `ad_products`
      // catalog row (spec §10, and `advertisements.ad_product_id` is a
      // NOT NULL FK); use each placement's seeded "Custom Period"
      // product for a non-standard length.
      productId: z.coerce.number().int().positive(),
      customPriceAmount: z.coerce.number().positive().optional(),
      customCurrencyCode: z.string().trim().length(3).optional(),
      startDate: isoDateSchema,
      endDate: isoDateSchema.optional(),
      displayPriority: z.coerce.number().int().min(0).max(1000).optional(),
      markPaidNow: z.boolean().optional(),
      note: z.string().trim().max(500).optional(),
    })
    .refine(
      (body) => body.placementCode !== 'CATEGORY_TOP' || body.categoryId,
      {
        message: 'categoryId is required when placementCode is CATEGORY_TOP.',
        path: ['categoryId'],
      },
    ),
});

export const advertisementIdParamsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.any(),
});

export const extendAdvertisementSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    endDate: isoDateSchema,
  }),
});

export const listAdvertisementsQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    listingId: z.coerce.number().int().positive().optional(),
    placementCode: z.enum(['HOMEPAGE_SECTION', 'CATEGORY_TOP']).optional(),
    statusCode: z
      .enum([
        'REQUEST_SUBMITTED',
        'AWAITING_OFFLINE_PAYMENT',
        'PAID_MANUAL',
        'APPROVED',
        'SCHEDULED',
        'ACTIVE',
        'EXPIRED',
        'REJECTED',
        'CANCELLED',
        'PAUSED',
      ])
      .optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const publicHomeFeaturedQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    locale: z.string().trim().max(10).optional(),
  }),
  body: z.any(),
});

export const publicCategoryTopQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    categoryId: z.coerce.number().int().positive(),
    locale: z.string().trim().max(10).optional(),
  }),
  body: z.any(),
});

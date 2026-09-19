/**
 * Step A5 (Partner Analytics Read API) — Layer 2 (structural) validation.
 * Every schema follows this codebase's established `{params, query, body}`
 * wrapper shape (`validate.js`/`engagementAnalyticsValidators.js`).
 *
 * `range` is a closed 7/30/90 enum (brief §5) — never an arbitrary date
 * range in v1. `partnerId` follows the exact same
 * `z.coerce.number().int().positive()` convention `listingValidators.js`/
 * `bookingValidators.js` already use for their own `partnerId` query
 * filter.
 */

import { z } from 'zod';

export const ALLOWED_RANGE_DAYS = Object.freeze([7, 30, 90]);
export const DEFAULT_RANGE_DAYS = 30;

export const LISTINGS_SORT_VALUES = Object.freeze([
  'views',
  'impressions',
  'booking_requests',
  'promotion_clicks',
]);
export const DEFAULT_LISTINGS_SORT = 'views';

const partnerIdQuery = z.coerce.number().int().positive();

const rangeDaysQuery = z.coerce
  .number()
  .optional()
  .default(DEFAULT_RANGE_DAYS)
  .refine((value) => ALLOWED_RANGE_DAYS.includes(value), {
    message: 'range must be one of 7, 30, or 90.',
  });

export const partnerAnalyticsOverviewQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    partnerId: partnerIdQuery,
    range: rangeDaysQuery,
  }),
  body: z.any(),
});

export const partnerAnalyticsListingsQuerySchema = z.object({
  params: z.object({}).passthrough(),
  query: z.object({
    partnerId: partnerIdQuery,
    range: rangeDaysQuery,
    sort: z
      .enum(LISTINGS_SORT_VALUES)
      .optional()
      .default(DEFAULT_LISTINGS_SORT),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

const listingIdParams = z.object({
  listingId: z.coerce.number().int().positive(),
});

export const partnerAnalyticsListingDetailSchema = z.object({
  params: listingIdParams,
  query: z.object({
    partnerId: partnerIdQuery,
    range: rangeDaysQuery,
  }),
  body: z.any(),
});

const promotionIdParams = z.object({
  promotionId: z.coerce.number().int().positive(),
});

export const partnerAnalyticsPromotionDetailSchema = z.object({
  params: promotionIdParams,
  query: z.object({
    partnerId: partnerIdQuery,
    range: rangeDaysQuery,
  }),
  body: z.any(),
});

export default {
  ALLOWED_RANGE_DAYS,
  DEFAULT_RANGE_DAYS,
  LISTINGS_SORT_VALUES,
  DEFAULT_LISTINGS_SORT,
  partnerAnalyticsOverviewQuerySchema,
  partnerAnalyticsListingsQuerySchema,
  partnerAnalyticsListingDetailSchema,
  partnerAnalyticsPromotionDetailSchema,
};

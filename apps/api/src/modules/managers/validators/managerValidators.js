/**
 * Managers module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10).
 * Ownership/assignment/role-membership checks are Layer 3 (database-
 * dependent) concerns and live in `ManagerService`.
 */

import { z } from 'zod';
import { isoDateSchema } from '../../../validation/isoDate.js';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();
const userIdParams = z.object({ userId: z.coerce.number().int().positive() });

export const promoteToManagerSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    userId: z.coerce.number().int().positive(),
  }),
});

export const managerIdParamsSchema = z.object({
  params: userIdParams,
  query: passthroughQuery,
  body: z.any(),
});

export const listManagersQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const assignCompanySchema = z.object({
  params: userIdParams,
  query: passthroughQuery,
  body: z.object({
    partnerId: z.coerce.number().int().positive(),
  }),
});

export const unassignCompanySchema = z.object({
  params: z.object({
    userId: z.coerce.number().int().positive(),
    partnerId: z.coerce.number().int().positive(),
  }),
  query: passthroughQuery,
  body: z.any(),
});

const analyticsFiltersSchema = z.object({
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  companyId: z.coerce.number().int().positive().optional(),
  listingId: z.coerce.number().int().positive().optional(),
  statusCode: z.string().trim().max(40).optional(),
});

export const managerAnalyticsQuerySchema = z.object({
  params: passthroughParams,
  query: analyticsFiltersSchema,
  body: z.any(),
});

export const adminManagerAnalyticsQuerySchema = z.object({
  params: userIdParams,
  query: analyticsFiltersSchema,
  body: z.any(),
});

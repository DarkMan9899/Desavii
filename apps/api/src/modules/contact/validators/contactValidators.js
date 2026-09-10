/**
 * Contact module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10).
 * Type-code existence (Layer 3) is `ContactService#submitInquiry`'s job.
 */

import { z } from 'zod';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();

export const INQUIRY_TYPE_CODES = [
  'GENERAL',
  'BOOKING_SUPPORT',
  'PARTNER_BUSINESS',
  'TECHNICAL',
];

export const submitInquirySchema = z.object({
  body: z.object({
    inquiryType: z.enum(INQUIRY_TYPE_CODES),
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(255),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(5000),
  }),
  query: passthroughQuery,
  params: passthroughParams,
});

export const inquiryIdParamsSchema = z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: passthroughQuery,
  body: z.any(),
});

export const listInquiriesQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    status: z.enum(['NEW', 'RESOLVED']).optional(),
  }),
  body: z.any(),
});

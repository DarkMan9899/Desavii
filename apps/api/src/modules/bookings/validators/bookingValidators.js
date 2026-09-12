/**
 * Bookings module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10) —
 * structural/format validation only. Hold ownership/expiry, listing/
 * unit-type/currency consistency across items, and pricing completeness
 * are Layer 3 (database-dependent) concerns and live in `BookingService`,
 * never here.
 */

import { z } from 'zod';
import { BOOKING_STATUSES } from '../../../core/domain/bookingStatusTransitions.js';
import { BOOKING_REFUND_STATUSES } from '../../../core/domain/bookingRefundStatuses.js';
import { isoDateSchema } from '../../../validation/isoDate.js';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();
const idParams = z.object({ id: z.coerce.number().int().positive() });

const guestSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  documentNumber: z.string().trim().max(100).optional(),
});

const bookingItemInputSchema = z.object({
  holdIds: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'holdIds must not contain duplicates.',
    }),
  guests: z.array(guestSchema).default([]),
  // P2.2B: optional so existing callers submitting no guest count at all
  // stay compatible (BookingService#resolveItem only enforces the
  // max_guests x quantity cap when this is present). Structural
  // validation only — `guestCount` positive integer; whether it's
  // actually within capacity is a Layer 3 (database-dependent) concern,
  // same split this file's own header comment documents.
  guestCount: z.coerce.number().int().positive().optional(),
});

const guestContactSnapshotSchema = z.object({
  fullName: z.string().trim().min(1).max(255),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1).max(50).optional(),
});

export const createBookingSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    items: z.array(bookingItemInputSchema).min(1),
    guestContactSnapshot: guestContactSnapshotSchema,
    customerNotes: z.string().trim().max(2000).optional(),
    // Pass 8 (Multi-Currency / CBA FX Pricing) — the only FX-related input
    // a client may ever supply (brief §30: no client-supplied rate is
    // trusted). A fixed enum, never an arbitrary ISO code; omitted means
    // "book in AMD," the same as before this pass existed.
    displayCurrencyCode: z.enum(['AMD', 'USD', 'RUB']).optional(),
  }),
});

export const bookingIdParamsSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.any(),
});

export const rejectBookingSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    reason: z.string().trim().max(500).optional(),
  }),
});

export const cancelBookingSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    reason: z.string().trim().max(500).optional(),
  }),
});

export const listBookingsQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    partnerId: z.coerce.number().int().positive().optional(),
    // Phase 11 Admin Platform: an admin looking up one specific
    // customer's booking history (e.g. from the User Management detail
    // page) — requires `booking.view_all`, same as the platform-wide
    // `viewAll` flag (see `BookingService.listBookings`). Query param is
    // `customerId`, matching this file's existing `partnerId` naming
    // convention (short form, not `*UserId`) — mapped to the internal
    // `customerUserId` filter key in the controller.
    customerId: z.coerce.number().int().positive().optional(),
    // `z.coerce.boolean()` would coerce the literal string "false" to
    // `true` (any non-empty string is truthy) — an explicit string
    // comparison is required for a query-string boolean.
    viewAll: z
      .string()
      .optional()
      .transform((value) => value === 'true'),
    // Phase 9 (Partner Dashboard): lets a partner's booking-management
    // workspace narrow server-side (e.g. PENDING_VENDOR to find bookings
    // needing action) — mirrors `GET /listings`'s existing `status` param.
    status: z.enum(BOOKING_STATUSES).optional(),
    // Launch-blocker remediation (P0-B/4D): lets the admin bookings
    // screen filter for REQUIRES_MANUAL_REVIEW — real backend filtering
    // (see mysqlBookingRepository.js#list), not a client-side narrowing
    // of one already-paginated page.
    refundStatus: z.enum(BOOKING_REFUND_STATUSES).optional(),
    // Sprint D-2 (Partner Calendar source-aware UX): lets the Partner
    // Calendar's Week/Day views find which of a partner's bookings touch
    // one `bookable_unit_id` within a date span, reusing this existing
    // list endpoint (`booking_items.bookable_unit_id`/`date_from`/
    // `date_to` already carry this — see
    // `mysqlBookingRepository.js#list`) rather than a second bookings
    // endpoint. Only meaningful alongside `partnerId` (or the plain
    // caller-own-bookings branch) — `BookingService.listBookings` already
    // gates every branch by ownership/permission before this narrows
    // further, so this can never be used to discover another partner's
    // bookings by guessing a unit id.
    unitId: z.coerce.number().int().positive().optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
  body: z.any(),
});

export const resolveRefundReviewSchema = z.object({
  params: idParams,
  query: passthroughQuery,
  body: z.object({
    reason: z.string().trim().min(1).max(1000),
  }),
});

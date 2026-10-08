/**
 * Booking-Holds module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md
 * §10) — structural/format validation only. Capacity, blackout-veto, and
 * ownership checks are Layer 3 and live in `AvailabilityService`/
 * `BookingHoldsService`, never here (same split
 * `availabilityValidators.js` documents).
 */

import { z } from 'zod';
import { isoDateSchema } from '../../../validation/isoDate.js';
import { BOOKING_MODES } from '../../../core/domain/hourlyStay.js';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();

// Sprint B (Car Rental Pickup/Return Interval) — same `HH:MM(:SS)?` shape
// `registerUnitSchema`'s `timeSlotStart`/`timeSlotEnd` already use.
// Structural validation only: whether a time is even meaningful for the
// requested unit (and the pickup-before-return chronology check) is
// Layer 3, business logic — `AvailabilityService#reserveCapacity` (this
// file's own header comment).
const holdTimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time.')
  .optional();

const holdItemSchema = z
  .object({
    bookableUnitId: z.coerce.number().int().positive(),
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema,
    startTime: holdTimeSchema,
    endTime: holdTimeSchema,
    quantity: z.coerce.number().int().positive().default(1),
    // Step L6.3B: HOURLY asks for an hourly stay on an hourly-enabled hotel
    // room (same date, whole-hour startTime/endTime). Omitted = the unit's
    // standard date-based booking, exactly as before.
    bookingMode: z.enum(Object.values(BOOKING_MODES)).optional(),
  })
  .refine((data) => data.dateTo >= data.dateFrom, {
    message: 'dateTo must not be before dateFrom.',
    path: ['dateTo'],
  });

export const createHoldsSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    items: z.array(holdItemSchema).min(1),
  }),
});

export const releaseHoldsSchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.object({
    holdIds: z
      .array(z.coerce.number().int().positive())
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'holdIds must not contain duplicates.',
      }),
  }),
});

export const listHoldsQuerySchema = z.object({
  params: passthroughParams,
  query: passthroughQuery,
  body: z.any(),
});

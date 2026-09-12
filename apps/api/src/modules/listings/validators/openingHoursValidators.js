/**
 * Opening Hours module Zod validators (Pass 6, Restaurant vertical) —
 * structural validation only, same split every other listing sub-resource
 * validator in this module follows (`restaurantMenuValidators.js`,
 * `listingValidators.js`'s `replaceHighlightsSchema`): ownership lives in
 * the Service.
 */

import { z } from 'zod';

const listingIdParams = z.object({ id: z.coerce.number().int().positive() });
const emptyBody = z.object({}).optional();

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayEntrySchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    isClosed: z.boolean().optional().default(false),
    opensAt: z.string().regex(TIME_PATTERN).optional(),
    closesAt: z.string().regex(TIME_PATTERN).optional(),
  })
  .refine(
    (day) => day.isClosed || (day.opensAt && day.closesAt),
    'An open day needs both opensAt and closesAt.',
  );

export const getOpeningHoursSchema = z.object({
  params: listingIdParams,
  query: z.object({}).optional(),
  body: emptyBody,
});

export const replaceOpeningHoursSchema = z.object({
  params: listingIdParams,
  query: z.object({}).optional(),
  body: z.object({
    // 0-7 entries: a partner may leave a day unauthored entirely (no row
    // at all — "hours not published for that day", never a fabricated
    // "closed"), and never more than one entry per day.
    days: z
      .array(dayEntrySchema)
      .max(7)
      .refine(
        (days) =>
          new Set(days.map((day) => day.dayOfWeek)).size === days.length,
        'Each day of the week may appear at most once.',
      ),
  }),
});

export default { getOpeningHoursSchema, replaceOpeningHoursSchema };

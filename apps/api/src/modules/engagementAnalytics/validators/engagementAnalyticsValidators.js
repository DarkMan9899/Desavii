/**
 * Engagement Analytics, Step A2 — Layer 2 (structural) validation for
 * `POST /analytics/events` (BACKEND_ARCHITECTURE.md §10/§25). Target
 * resolution, ownership, and public-exposure validity (Layer 3) all
 * belong to `EngagementAnalyticsService`, never here.
 *
 * Every schema is `.strict()` — an unknown root or event field is a 422,
 * never silently dropped, so a client typo/future-field never gets
 * quietly ignored into a wrong analytics row.
 */

import { z } from 'zod';
import {
  ANALYTICS_EVENTS,
  ENGAGEMENT_PLACEMENT_VALUES,
  ENGAGEMENT_CONTACT_METHOD_VALUES,
  ENGAGEMENT_LOCALES,
} from '../constants/engagementAnalyticsConstants.js';
import { UUID_V4_PATTERN } from '../models/eventContext.js';

const passthroughQuery = z.object({}).passthrough();
const passthroughParams = z.object({}).passthrough();

/**
 * The exact 9-name client-ingestible allowlist (A2 §3 of the brief) —
 * every other name in the canonical 20-event `ANALYTICS_EVENTS` contract
 * (favorite_added/removed, booking_*, vendor_registered, listing_created,
 * search_performed, filter_applied) is server-authoritative or
 * deliberately unwired, and is REJECTED if a client submits it.
 */
export const CLIENT_INGESTIBLE_EVENT_NAMES = Object.freeze([
  ANALYTICS_EVENTS.LISTING_IMPRESSION,
  ANALYTICS_EVENTS.LISTING_VIEWED,
  ANALYTICS_EVENTS.PROMOTION_IMPRESSION,
  ANALYTICS_EVENTS.PROMOTION_CLICKED,
  ANALYTICS_EVENTS.CONTACT_CLICK,
  ANALYTICS_EVENTS.COMPANY_PROFILE_VIEW,
  ANALYTICS_EVENTS.COMPANY_LISTING_CLICK,
  ANALYTICS_EVENTS.SEARCH_IMPRESSION,
  ANALYTICS_EVENTS.SEARCH_RESULT_CLICK,
]);

const uuidV4 = () => z.string().regex(UUID_V4_PATTERN, 'Invalid UUID v4.');
const positiveId = () => z.coerce.number().int().positive();

/**
 * Every field any of the 9 client-ingestible events can carry — kept
 * flat (`.strict()` + `.superRefine()`) rather than a `discriminatedUnion`
 * (no precedent for that combinator anywhere in this codebase; every
 * other conditionally-required-field schema here uses `.refine()`
 * instead, see `listingValidators.js#attributeValueSchema`).
 */
const engagementEventSchema = z
  .object({
    eventId: uuidV4(),
    eventName: z.enum(CLIENT_INGESTIBLE_EVENT_NAMES),
    sessionId: uuidV4(),
    anonymousVisitorId: uuidV4().optional(),
    listingId: positiveId().optional(),
    companySlug: z.string().trim().min(1).max(180).optional(),
    promotionId: positiveId().optional(),
    placement: z.enum(ENGAGEMENT_PLACEMENT_VALUES).optional(),
    position: z.coerce.number().int().nonnegative().optional(),
    categoryCode: z.string().trim().min(1).max(60).optional(),
    queryText: z.string().trim().max(180).optional(),
    resultCount: z.coerce.number().int().nonnegative().optional(),
    contactMethod: z.enum(ENGAGEMENT_CONTACT_METHOD_VALUES).optional(),
    locale: z.enum(ENGAGEMENT_LOCALES).optional(),
  })
  .strict()
  .superRefine((event, ctx) => {
    function requireFields(fields) {
      for (const field of fields) {
        if (event[field] === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `"${field}" is required for event "${event.eventName}".`,
          });
        }
      }
    }

    switch (event.eventName) {
      case ANALYTICS_EVENTS.LISTING_IMPRESSION:
        requireFields(['listingId', 'placement']);
        break;
      case ANALYTICS_EVENTS.LISTING_VIEWED:
        requireFields(['listingId']);
        break;
      case ANALYTICS_EVENTS.PROMOTION_IMPRESSION:
      case ANALYTICS_EVENTS.PROMOTION_CLICKED:
        requireFields(['listingId', 'promotionId', 'placement']);
        break;
      // Step A3.1 (live QA fix): a company-scoped event, matching the
      // real `CompanyProfilePageContent` contact row A3 instruments —
      // there is no listing context on that page at all. See
      // `engagementAnalyticsService.js#resolveTarget`'s own comment.
      case ANALYTICS_EVENTS.CONTACT_CLICK:
        requireFields(['companySlug', 'contactMethod']);
        break;
      case ANALYTICS_EVENTS.COMPANY_PROFILE_VIEW:
        requireFields(['companySlug']);
        break;
      case ANALYTICS_EVENTS.COMPANY_LISTING_CLICK:
        requireFields(['companySlug', 'listingId']);
        break;
      case ANALYTICS_EVENTS.SEARCH_IMPRESSION:
        requireFields(['resultCount']);
        break;
      case ANALYTICS_EVENTS.SEARCH_RESULT_CLICK:
        requireFields(['listingId', 'position']);
        break;
      default:
        break;
    }
  });

export const ingestEventsSchema = z.object({
  body: z
    .object({
      events: z.array(engagementEventSchema).min(1).max(25),
    })
    .strict(),
  query: passthroughQuery,
  params: passthroughParams,
});

export default { ingestEventsSchema, CLIENT_INGESTIBLE_EVENT_NAMES };

/**
 * Availability module route wiring (BACKEND_ARCHITECTURE.md §2: route
 * wiring only, no logic).
 *
 * Three groups: `bookable_units` CRUD under `/units` (the inventory-
 * agnostic capability — see `availabilityService.js`'s header comment:
 * unit creation is always an explicit call, never an automatic side
 * effect of writing a calendar entry), `availability_calendar` CRUD (the
 * primary engine, consumes an existing `unitId`), `blackout_dates` CRUD
 * under `/blackouts` (the complementary veto layer — deliberately its
 * own sub-path, never conflated with the calendar resource), and four
 * public views (`/:listingId/units` — Phase 7's Booking Flow addition —
 * `/:listingId/calendar`, `/:listingId/availability-summary` — Phase 17's
 * Listing Detail bucketed summary — `/:listingId`).
 *
 * **Route-order hazard**: `GET /units`, `GET /blackouts`, and
 * `GET /:listingId` are all single-segment `GET` routes. Express matches
 * by registration order when path shapes collide, so `/units` and
 * `/blackouts` MUST both be registered before `/:listingId` — otherwise
 * e.g. `GET /availability/units` would be captured by `/:listingId`
 * (coercing "units" as a listing id and failing validation) instead of
 * reaching the unit list. `/:listingId/units`, `/:listingId/calendar`, and
 * `/:listingId/availability-summary` have no such hazard (two dynamic+
 * static segments, distinguished by their literal second segment, never
 * confused with each other or with the single-segment `/:listingId`).
 *
 * The public GETs skip `requireAuth` — `authenticate.js` still populates
 * `req.principal` when a token is present, which `AvailabilityService`
 * uses so an owner viewing their own draft listing still works, same
 * pattern as `listingController.get`.
 */

import express, { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from '../media/validators/mediaConstraints.js';
import {
  registerUnitSchema,
  unitIdParamsSchema,
  updateUnitSchema,
  listUnitsQuerySchema,
  updateUnitDescriptionSchema,
  replaceUnitAmenitiesSchema,
  unitMediaIdParamsSchema,
  setAvailabilitySchema,
  updateCalendarEntrySchema,
  calendarEntryIdParamsSchema,
  listCalendarQuerySchema,
  createBlackoutSchema,
  updateBlackoutSchema,
  blackoutIdParamsSchema,
  listBlackoutsQuerySchema,
  listingIdParamsSchema,
  listPublicUnitsQuerySchema,
  calendarQuerySchema,
  publicAvailabilitySummaryQuerySchema,
  createManualBlockSchema,
  blockIdParamsSchema,
  listBlocksQuerySchema,
  createExternalReservationSchema,
  externalReservationIdParamsSchema,
  listExternalReservationsQuerySchema,
  unitLedgerQuerySchema,
  unitBreakdownQuerySchema,
  bulkImportExternalReservationsSchema,
} from './validators/availabilityValidators.js';

export default function createAvailabilityRoutes({
  availabilityController,
  guards,
}) {
  const router = Router();
  const { requireAuth } = guards;

  // --- bookable_units (inventory-agnostic capability) ---
  // Must be registered before the `/:listingId` public route below.
  router.post(
    '/units',
    requireAuth,
    validate(registerUnitSchema),
    availabilityController.registerUnit,
  );
  router.get(
    '/units',
    requireAuth,
    validate(listUnitsQuerySchema),
    availabilityController.listUnits,
  );
  router.patch(
    '/units/:id',
    requireAuth,
    validate(updateUnitSchema),
    availabilityController.updateUnit,
  );
  router.delete(
    '/units/:id',
    requireAuth,
    validate(unitIdParamsSchema),
    availabilityController.retireUnit,
  );

  // --- Sprint C-1: room description, amenities, media ---
  router.patch(
    '/units/:id/description',
    requireAuth,
    validate(updateUnitDescriptionSchema),
    availabilityController.setUnitDescription,
  );
  router.patch(
    '/units/:id/amenities',
    requireAuth,
    validate(replaceUnitAmenitiesSchema),
    availabilityController.replaceUnitAmenities,
  );
  router.get(
    '/units/:id/media',
    requireAuth,
    validate(unitIdParamsSchema),
    availabilityController.listUnitMedia,
  );
  router.post(
    '/units/:id/media',
    requireAuth,
    // Scoped to this one route only, same pattern as the Listings
    // module's own `/media` route — the global body parser skips
    // non-JSON content-types. Step L3.1: was a 20 MiB pre-check buffer
    // against the same 10 MiB real image limit every other image route
    // now enforces — the canonical byte constant closes that gap here
    // too, same as L3 did for listings media.
    express.raw({
      type: ALLOWED_IMAGE_MIME_TYPES,
      limit: MAX_FILE_SIZE_BYTES.image,
    }),
    validate(unitIdParamsSchema),
    availabilityController.attachUnitMedia,
  );
  router.delete(
    '/units/:id/media/:mediaId',
    requireAuth,
    validate(unitMediaIdParamsSchema),
    availabilityController.removeUnitMedia,
  );

  // --- availability_calendar (primary engine) ---
  router.post(
    '/',
    requireAuth,
    validate(setAvailabilitySchema),
    availabilityController.setAvailability,
  );
  router.get(
    '/',
    requireAuth,
    validate(listCalendarQuerySchema),
    availabilityController.listCalendarEntries,
  );
  router.patch(
    '/:id',
    requireAuth,
    validate(updateCalendarEntrySchema),
    availabilityController.updateCalendarEntry,
  );
  router.delete(
    '/:id',
    requireAuth,
    validate(calendarEntryIdParamsSchema),
    availabilityController.removeCalendarEntry,
  );

  // --- blackout_dates (complementary veto layer) ---
  // Must be registered before the `/:listingId` public route below.
  router.post(
    '/blackouts',
    requireAuth,
    validate(createBlackoutSchema),
    availabilityController.createBlackout,
  );
  router.get(
    '/blackouts',
    requireAuth,
    validate(listBlackoutsQuerySchema),
    availabilityController.listBlackouts,
  );
  router.patch(
    '/blackouts/:id',
    requireAuth,
    validate(updateBlackoutSchema),
    availabilityController.updateBlackout,
  );
  router.delete(
    '/blackouts/:id',
    requireAuth,
    validate(blackoutIdParamsSchema),
    availabilityController.removeBlackout,
  );

  // --- Phase 17: manual blocks (spec §11-12) ---
  // Must be registered before the `/:listingId` public route below —
  // same single-segment-GET hazard this file's header already documents
  // for `/units`/`/blackouts`.
  router.post(
    '/blocks',
    requireAuth,
    validate(createManualBlockSchema),
    availabilityController.createManualBlock,
  );
  router.get(
    '/blocks',
    requireAuth,
    validate(listBlocksQuerySchema),
    availabilityController.listManualBlocks,
  );
  router.delete(
    '/blocks/:id',
    requireAuth,
    validate(blockIdParamsSchema),
    availabilityController.releaseManualBlock,
  );

  // --- Phase 17: external reservations (spec §10) ---
  // Must likewise be registered before `/:listingId`.
  router.post(
    '/external-reservations',
    requireAuth,
    validate(createExternalReservationSchema),
    availabilityController.createExternalReservation,
  );
  router.get(
    '/external-reservations',
    requireAuth,
    validate(listExternalReservationsQuerySchema),
    availabilityController.listExternalReservations,
  );
  // No route-order hazard: this is POST (the sibling dynamic route below
  // is DELETE), and the extra `/bulk-import` segment means it can never
  // match the bare `POST /external-reservations` create route either.
  router.post(
    '/external-reservations/bulk-import',
    requireAuth,
    validate(bulkImportExternalReservationsSchema),
    availabilityController.bulkImportExternalReservations,
  );
  router.delete(
    '/external-reservations/:id',
    requireAuth,
    validate(externalReservationIdParamsSchema),
    availabilityController.cancelExternalReservation,
  );

  // --- Phase 17: per-unit ledger + breakdown (spec §13, §29) ---
  // Three-segment paths — no collision with `/:listingId`, but grouped
  // here with the other Phase 17 routes for readability.
  router.get(
    '/units/:id/ledger',
    requireAuth,
    validate(unitLedgerQuerySchema),
    availabilityController.getUnitLedger,
  );
  router.get(
    '/units/:id/breakdown',
    requireAuth,
    validate(unitBreakdownQuerySchema),
    availabilityController.getUnitBreakdown,
  );
  router.get(
    '/units/:id/holds',
    requireAuth,
    validate(unitBreakdownQuerySchema),
    availabilityController.getUnitHolds,
  );

  // --- public views ---
  router.get(
    '/:listingId/units',
    validate(listPublicUnitsQuerySchema),
    availabilityController.listPublicUnits,
  );
  router.get(
    '/:listingId/calendar',
    validate(calendarQuerySchema),
    availabilityController.getCalendar,
  );
  router.get(
    '/:listingId/availability-summary',
    validate(publicAvailabilitySummaryQuerySchema),
    availabilityController.getPublicAvailabilitySummary,
  );
  // Phase 18 — same query shape as `/availability-summary` (from/to/
  // unitId, span-capped); reused directly rather than duplicated, since
  // the only difference is the service method / response shape behind it.
  router.get(
    '/:listingId/day-status',
    validate(publicAvailabilitySummaryQuerySchema),
    availabilityController.getPublicDailyAvailabilityStatus,
  );
  router.get(
    '/:listingId',
    validate(listingIdParamsSchema),
    availabilityController.getPublicRanges,
  );

  return router;
}

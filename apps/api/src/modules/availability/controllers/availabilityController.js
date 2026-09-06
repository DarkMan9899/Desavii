/**
 * Availability module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import { ValidationError } from '../../../errors/AppError.js';
import {
  toBookableUnitResponse,
  toUnitMediaResponse,
  toPublicBookableUnitResponse,
  toCalendarEntryResponse,
  toBlackoutManagementResponse,
  toPublicRangeResponse,
  toCalendarDayResponse,
  toPublicAvailabilitySummaryResponse,
  toPublicDailyAvailabilityResponse,
  toInventoryBlockResponse,
  toExternalReservationResponse,
  toLedgerEntryResponse,
  toAvailabilityBreakdownResponse,
  toReservationHoldResponse,
} from '../dto/availabilityDto.js';

export function createAvailabilityController(availabilityService) {
  return {
    // --- bookable_units (inventory-agnostic capability) ---

    async registerUnit(req, res, next) {
      try {
        const unit = await availabilityService.registerUnit(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toBookableUnitResponse(unit),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateUnit(req, res, next) {
      try {
        const { id } = req.validated.params;
        const unit = await availabilityService.updateUnit(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toBookableUnitResponse(unit),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async retireUnit(req, res, next) {
      try {
        const { id } = req.validated.params;
        await availabilityService.retireUnit(req.principal, id);
        res.status(200).json({
          success: true,
          data: { deleted: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listUnits(req, res, next) {
      try {
        const { listingId } = req.validated.query;
        const units = await availabilityService.listUnits(
          req.principal,
          listingId,
        );
        res.status(200).json({
          success: true,
          data: units.map(toBookableUnitResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Sprint C-1: room description, amenities, media ---

    async setUnitDescription(req, res, next) {
      try {
        const { id } = req.validated.params;
        const unit = await availabilityService.setUnitDescription(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toBookableUnitResponse(unit),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceUnitAmenities(req, res, next) {
      try {
        const { id } = req.validated.params;
        const unit = await availabilityService.replaceUnitAmenities(
          req.principal,
          id,
          req.validated.body.amenityIds,
        );
        res.status(200).json({
          success: true,
          data: toBookableUnitResponse(unit),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listUnitMedia(req, res, next) {
      try {
        const { id } = req.validated.params;
        const media = await availabilityService.listUnitMedia(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: media.map(toUnitMediaResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async attachUnitMedia(req, res, next) {
      try {
        const { id } = req.validated.params;
        const buffer = req.body;
        const mimeType = req.headers['content-type'];

        // Gross size/DoS protection lives in module.routes.js's
        // express.raw({ limit }); this only guards an empty/missing body.
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          throw new ValidationError('Request body must be a non-empty file.');
        }

        const media = await availabilityService.attachUnitMedia(
          req.principal,
          id,
          buffer,
          mimeType,
        );
        res.status(201).json({
          success: true,
          data: toUnitMediaResponse(media),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async removeUnitMedia(req, res, next) {
      try {
        const { id, mediaId } = req.validated.params;
        await availabilityService.removeUnitMedia(req.principal, id, mediaId);
        res.status(200).json({
          success: true,
          data: { deleted: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- availability_calendar (primary engine) ---

    async setAvailability(req, res, next) {
      try {
        const entries = await availabilityService.setAvailability(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: entries.map(toCalendarEntryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateCalendarEntry(req, res, next) {
      try {
        const { id } = req.validated.params;
        const entry = await availabilityService.updateCalendarEntry(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toCalendarEntryResponse(entry),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async removeCalendarEntry(req, res, next) {
      try {
        const { id } = req.validated.params;
        await availabilityService.removeCalendarEntry(req.principal, id);
        res.status(200).json({
          success: true,
          data: { deleted: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listCalendarEntries(req, res, next) {
      try {
        const { listingId, unitId, partnerId, from, to, cursor, limit } =
          req.validated.query;
        const { rows, meta } = await availabilityService.listCalendarEntries(
          req.principal,
          { listingId, unitId, partnerId, from, to },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toCalendarEntryResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- blackout_dates (complementary veto layer) ---

    async createBlackout(req, res, next) {
      try {
        const block = await availabilityService.createBlackout(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toBlackoutManagementResponse(block),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateBlackout(req, res, next) {
      try {
        const { id } = req.validated.params;
        const block = await availabilityService.updateBlackout(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toBlackoutManagementResponse(block),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async removeBlackout(req, res, next) {
      try {
        const { id } = req.validated.params;
        await availabilityService.deleteBlackout(req.principal, id);
        res.status(200).json({
          success: true,
          data: { deleted: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listBlackouts(req, res, next) {
      try {
        const { listingId, partnerId, cursor, limit } = req.validated.query;
        const { rows, meta } = await availabilityService.listBlackouts(
          req.principal,
          { listingId, partnerId },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toBlackoutManagementResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- public views ---

    async listPublicUnits(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const { date, checkIn, checkOut } = req.validated.query;
        const units = await availabilityService.getPublicUnits(
          req.principal,
          listingId,
          { date, checkIn, checkOut },
        );
        res.status(200).json({
          success: true,
          data: units.map(toPublicBookableUnitResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getPublicRanges(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const ranges = await availabilityService.getPublicRanges(
          req.principal,
          listingId,
        );
        res.status(200).json({
          success: true,
          data: ranges.map(toPublicRangeResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getCalendar(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const { from, to, unitId } = req.validated.query;
        const days = await availabilityService.getCalendar(
          req.principal,
          listingId,
          from,
          to,
          unitId,
        );
        res.status(200).json({
          success: true,
          data: days.map(toCalendarDayResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getPublicAvailabilitySummary(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const { from, to, unitId } = req.validated.query;
        const summaries =
          await availabilityService.getPublicAvailabilitySummary(
            req.principal,
            listingId,
            { from, to, unitId },
          );
        res.status(200).json({
          success: true,
          data: summaries.map(toPublicAvailabilitySummaryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getPublicDailyAvailabilityStatus(req, res, next) {
      try {
        const { listingId } = req.validated.params;
        const { from, to, unitId } = req.validated.query;
        const days = await availabilityService.getPublicDailyAvailabilityStatus(
          req.principal,
          listingId,
          { from, to, unitId },
        );
        res.status(200).json({
          success: true,
          data: days.map(toPublicDailyAvailabilityResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Phase 17: manual blocks ---

    async createManualBlock(req, res, next) {
      try {
        const block = await availabilityService.createManualBlock(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toInventoryBlockResponse(block),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async releaseManualBlock(req, res, next) {
      try {
        const { id } = req.validated.params;
        await availabilityService.releaseManualBlock(req.principal, id);
        res.status(200).json({
          success: true,
          data: { released: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listManualBlocks(req, res, next) {
      try {
        const { listingId } = req.validated.query;
        const blocks = await availabilityService.listManualBlocks(
          req.principal,
          listingId,
        );
        res.status(200).json({
          success: true,
          data: blocks.map(toInventoryBlockResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Phase 17: external reservations ---

    async createExternalReservation(req, res, next) {
      try {
        const reservation = await availabilityService.createExternalReservation(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toExternalReservationResponse(reservation),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async bulkImportExternalReservations(req, res, next) {
      try {
        const results =
          await availabilityService.bulkCreateExternalReservations(
            req.principal,
            req.validated.body,
          );
        res
          .status(200)
          .json({ success: true, data: { results }, meta: null, error: null });
      } catch (err) {
        next(err);
      }
    },

    async cancelExternalReservation(req, res, next) {
      try {
        const { id } = req.validated.params;
        await availabilityService.cancelExternalReservation(req.principal, id);
        res.status(200).json({
          success: true,
          data: { cancelled: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listExternalReservations(req, res, next) {
      try {
        const { listingId } = req.validated.query;
        const reservations = await availabilityService.listExternalReservations(
          req.principal,
          listingId,
        );
        res.status(200).json({
          success: true,
          data: reservations.map(toExternalReservationResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- Phase 17: ledger + breakdown ---

    async getUnitLedger(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { from, to } = req.validated.query;
        const entries = await availabilityService.getInventoryLedger(
          req.principal,
          id,
          { from, to },
        );
        res.status(200).json({
          success: true,
          data: entries.map(toLedgerEntryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getUnitBreakdown(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { from, to } = req.validated.query;
        const days = await availabilityService.getAvailabilityBreakdown(
          req.principal,
          id,
          {
            from,
            to,
          },
        );
        res.status(200).json({
          success: true,
          data: days.map(toAvailabilityBreakdownResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getUnitHolds(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { from, to } = req.validated.query;
        const holds = await availabilityService.listActiveHoldsForUnit(
          req.principal,
          id,
          { from, to },
        );
        res.status(200).json({
          success: true,
          data: holds.map(toReservationHoldResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createAvailabilityController;

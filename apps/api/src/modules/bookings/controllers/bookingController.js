/**
 * Bookings module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import {
  toBookingResponse,
  toBookingSummaryResponse,
  toBookingStatusHistoryResponse,
} from '../dto/bookingDto.js';

export function createBookingController(bookingService) {
  return {
    async create(req, res, next) {
      try {
        const booking = await bookingService.createBooking(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async get(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.getBooking(req.principal, id);
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getStatusHistory(req, res, next) {
      try {
        const { id } = req.validated.params;
        const history = await bookingService.getStatusHistory(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: history.map(toBookingStatusHistoryResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const {
          partnerId,
          viewAll,
          status,
          customerId,
          refundStatus,
          unitId,
          from,
          to,
          cursor,
          limit,
        } = req.validated.query;
        const { rows, meta } = await bookingService.listBookings(
          req.principal,
          {
            partnerId,
            viewAll,
            status,
            customerUserId: customerId,
            refundStatus,
            unitId,
            from,
            to,
          },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toBookingSummaryResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async confirm(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.confirmBooking(req.principal, id);
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async reject(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.rejectBooking(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async cancel(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.cancelBooking(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async complete(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.completeBooking(req.principal, id);
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async noShow(req, res, next) {
      try {
        const { id } = req.validated.params;
        const booking = await bookingService.markNoShow(req.principal, id);
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async resolveRefundReview(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { reason } = req.validated.body;
        const booking = await bookingService.resolveRefundReviewWithoutRefund(
          req.principal,
          id,
          { reason },
        );
        res.status(200).json({
          success: true,
          data: toBookingResponse(booking),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createBookingController;

/**
 * Reviews module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import {
  toReviewResponse,
  toPublicReviewResponse,
  toReviewSummaryResponse,
  toReviewAdminResponse,
  toReviewReportResponse,
} from '../dto/reviewDto.js';

export function createReviewController(reviewService) {
  return {
    async submit(req, res, next) {
      try {
        const review = await reviewService.submitReview(
          req.principal,
          req.validated.body.bookingId,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toReviewResponse(review),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getForBooking(req, res, next) {
      try {
        const { bookingId } = req.validated.params;
        const review = await reviewService.getReviewForBooking(
          req.principal,
          bookingId,
        );
        res.status(200).json({
          success: true,
          data: review ? toReviewResponse(review) : null,
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listForListing(req, res, next) {
      try {
        const { listingId, cursor, limit } = req.validated.query;
        const [{ rows, meta }, summary] = await Promise.all([
          reviewService.listReviewsForListing(listingId, {
            cursor,
            limit: limit ?? 20,
          }),
          reviewService.getSummaryForListing(listingId),
        ]);
        res.status(200).json({
          success: true,
          data: rows.map(toPublicReviewResponse),
          meta: {
            ...meta,
            ...toReviewSummaryResponse({ listingId, ...summary }),
          },
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // P1.5 (Master Roadmap) — Review Trust & Safety.
    async listAdmin(req, res, next) {
      try {
        const { moderationStatus, hasReports, cursor, limit } =
          req.validated.query;
        const { rows, meta } = await reviewService.listReviewsAdmin(
          req.principal,
          { moderationStatus, hasReports },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toReviewAdminResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getAdminDetail(req, res, next) {
      try {
        const { id } = req.validated.params;
        const review = await reviewService.getReviewAdminDetail(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: {
            ...toReviewAdminResponse(review),
            reports: review.reports.map(toReviewReportResponse),
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateModerationStatus(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { status, notes } = req.validated.body;
        const review = await reviewService.updateModerationStatus(
          req.principal,
          id,
          status,
          notes,
        );
        res.status(200).json({
          success: true,
          data: toReviewAdminResponse(review),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async report(req, res, next) {
      try {
        const { id } = req.validated.params;
        const report = await reviewService.reportReview(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toReviewReportResponse(report),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async reply(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { response } = req.validated.body;
        const review = await reviewService.replyToReview(
          req.principal,
          id,
          response,
        );
        res.status(200).json({
          success: true,
          data: toReviewResponse(review),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async deleteReply(req, res, next) {
      try {
        const { id } = req.validated.params;
        const review = await reviewService.deleteReviewReply(req.principal, id);
        res.status(200).json({
          success: true,
          data: toReviewResponse(review),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createReviewController;

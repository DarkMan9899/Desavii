/**
 * Listings module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access, no
 * try/catch-to-response — a thrown `AppError` always propagates to
 * `next()`, shaped exactly once by the global error handler.
 */

import { ValidationError } from '../../../errors/AppError.js';
import {
  toListingResponse,
  toListingOwnerResponse,
  toListingSummaryResponse,
  toAdminListingSummaryResponse,
  toListingAdminDetailResponse,
  toMediaResponse,
  toListingMetadataResponse,
  toHighlightResponse,
  toItineraryStepResponse,
  toIncludedItemResponse,
  toFaqResponse,
} from '../dto/listingDto.js';

export function createListingController(
  listingService,
  listingMetadataService,
) {
  return {
    async create(req, res, next) {
      try {
        const listing = await listingService.createListing(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toListingResponse(listing),
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
        const listing = await listingService.getListing(req.principal, id);
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const { partnerId, listingType, status, cursor, limit } =
          req.validated.query;
        const { rows, meta } = await listingService.listListings(
          req.principal,
          { partnerId, listingType, status },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toListingSummaryResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listAdmin(req, res, next) {
      try {
        const {
          keyword,
          moderationStatus,
          status,
          lifecycleFilter,
          cursor,
          limit,
        } = req.validated.query;
        const { rows, meta } = await listingService.listListingsAdmin(
          req.principal,
          { keyword, moderationStatus, status, lifecycleFilter },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toAdminListingSummaryResponse),
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
        const listing = await listingService.getListingAdminDetail(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: toListingAdminDetailResponse(listing),
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
        const listing = await listingService.updateModerationStatus(
          req.principal,
          id,
          status,
          notes,
        );
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async update(req, res, next) {
      try {
        const { id } = req.validated.params;
        const listing = await listingService.updateListing(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async remove(req, res, next) {
      try {
        const { id } = req.validated.params;
        await listingService.deleteListing(req.principal, id);
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

    async submitForReview(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { publicationPeriodDays } = req.validated.body;
        const listing = await listingService.submitForReview(
          req.principal,
          id,
          { publicationPeriodDays },
        );
        res.status(200).json({
          success: true,
          data: toListingOwnerResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async publish(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { publicationPeriodDays } = req.validated.body;
        const listing = await listingService.publishListing(req.principal, id, {
          publicationPeriodDays,
        });
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // Listing Lifetime / Renewal, Step B5.
    async renew(req, res, next) {
      try {
        const { id } = req.validated.params;
        const { publicationPeriodDays } = req.validated.body;
        const listing = await listingService.renewListing(req.principal, id, {
          publicationPeriodDays,
        });
        res.status(200).json({
          success: true,
          data: toListingOwnerResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async unpublish(req, res, next) {
      try {
        const { id } = req.validated.params;
        const listing = await listingService.unpublishListing(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async archive(req, res, next) {
      try {
        const { id } = req.validated.params;
        const listing = await listingService.archiveListing(req.principal, id);
        res.status(200).json({
          success: true,
          data: toListingResponse(listing),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async listMedia(req, res, next) {
      try {
        const { id } = req.validated.params;
        const media = await listingService.listMedia(req.principal, id);
        res.status(200).json({
          success: true,
          data: media.map(toMediaResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async attachMedia(req, res, next) {
      try {
        const { id } = req.validated.params;
        const buffer = req.body;
        const mimeType = req.headers['content-type'];

        // Gross size/DoS protection lives in module.routes.js's
        // express.raw({ limit }); this only guards an empty/missing body.
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          throw new ValidationError('Request body must be a non-empty file.');
        }

        const media = await listingService.attachMedia(
          req.principal,
          id,
          buffer,
          mimeType,
        );
        res.status(201).json({
          success: true,
          data: toMediaResponse(media),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async updateMedia(req, res, next) {
      try {
        const { id, mediaId } = req.validated.params;
        const media = await listingService.updateMedia(
          req.principal,
          id,
          mediaId,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toMediaResponse(media),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async removeMedia(req, res, next) {
      try {
        const { id, mediaId } = req.validated.params;
        await listingService.removeMedia(req.principal, id, mediaId);
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

    async getMetadata(req, res, next) {
      try {
        const { categoryId, locale } = req.validated.query;
        const metadata = await listingMetadataService.getMetadataForCategory(
          categoryId,
          locale,
        );
        res.status(200).json({
          success: true,
          data: toListingMetadataResponse(metadata),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceHighlights(req, res, next) {
      try {
        const { id } = req.validated.params;
        const highlights = await listingService.replaceHighlights(
          req.principal,
          id,
          req.validated.body.highlights,
          req.validated.body.languageCode,
        );
        res.status(200).json({
          success: true,
          data: highlights.map(toHighlightResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceItinerarySteps(req, res, next) {
      try {
        const { id } = req.validated.params;
        const steps = await listingService.replaceItinerarySteps(
          req.principal,
          id,
          req.validated.body.steps,
          req.validated.body.languageCode,
        );
        res.status(200).json({
          success: true,
          data: steps.map(toItineraryStepResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceIncludedItems(req, res, next) {
      try {
        const { id } = req.validated.params;
        const items = await listingService.replaceIncludedItems(
          req.principal,
          id,
          req.validated.body.items,
          req.validated.body.languageCode,
        );
        res.status(200).json({
          success: true,
          data: items.map(toIncludedItemResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async replaceFaqs(req, res, next) {
      try {
        const { id } = req.validated.params;
        const faqs = await listingService.replaceFaqs(
          req.principal,
          id,
          req.validated.body.faqs,
          req.validated.body.languageCode,
        );
        res.status(200).json({
          success: true,
          data: faqs.map(toFaqResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getCompleteness(req, res, next) {
      try {
        const { id } = req.validated.params;
        const completeness = await listingService.getListingCompleteness(
          req.principal,
          id,
        );
        res.status(200).json({
          success: true,
          data: {
            is_publish_ready: completeness.isPublishReady,
            percent_complete: completeness.percentComplete,
            required_missing: completeness.requiredMissing,
            recommended_missing: completeness.recommendedMissing,
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createListingController;

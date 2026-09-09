/**
 * Advertising module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. No business logic, no direct database access.
 */

import {
  toAdvertisementResponse,
  toPlacementCatalogResponse,
} from '../dto/advertisementDto.js';
import { toSearchResultResponse } from '../../search/dto/searchDto.js';

export function createAdvertisementController(advertisementService) {
  return {
    async getPlacementCatalog(req, res, next) {
      try {
        const placements = await advertisementService.getPlacementCatalog(
          req.principal,
        );
        res.status(200).json({
          success: true,
          data: toPlacementCatalogResponse(placements),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const ad = await advertisementService.createPromotion(
          req.principal,
          req.validated.body,
        );
        res.status(201).json({
          success: true,
          data: toAdvertisementResponse(ad),
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
        const ad = await advertisementService.getById(req.principal, id);
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const { listingId, placementCode, statusCode, cursor, limit } =
          req.validated.query;
        const { rows, meta } = await advertisementService.listForAdmin(
          req.principal,
          { listingId, placementCode, statusCode },
          { cursor, limit },
        );
        res.status(200).json({
          success: true,
          data: rows.map(toAdvertisementResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async markPaid(req, res, next) {
      try {
        const { id } = req.validated.params;
        const ad = await advertisementService.markPaid(req.principal, id);
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async approve(req, res, next) {
      try {
        const { id } = req.validated.params;
        const ad = await advertisementService.approve(req.principal, id);
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
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
        const ad = await advertisementService.reject(req.principal, id);
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
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
        const ad = await advertisementService.cancel(req.principal, id);
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async extend(req, res, next) {
      try {
        const { id } = req.validated.params;
        const ad = await advertisementService.extend(
          req.principal,
          id,
          req.validated.body,
        );
        res.status(200).json({
          success: true,
          data: toAdvertisementResponse(ad),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    // --- public ---

    async getPublicHomeFeatured(req, res, next) {
      try {
        const { locale } = req.validated.query;
        const listings =
          await advertisementService.getPublicHomeFeatured(locale);
        res.status(200).json({
          success: true,
          data: listings.map(toSearchResultResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getPublicCategoryTop(req, res, next) {
      try {
        const { categoryId, locale } = req.validated.query;
        const listings = await advertisementService.getPublicCategoryTop(
          categoryId,
          locale,
        );
        res.status(200).json({
          success: true,
          data: listings.map(toSearchResultResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createAdvertisementController;

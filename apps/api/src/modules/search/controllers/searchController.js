/**
 * Search module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> call Service ->
 * shape response. `GET /search` and `GET /search/listings` both route to
 * `searchListings` (see `module.routes.js`) — listings are the only
 * searchable entity that exists yet, so there is exactly one handler, not
 * two near-duplicates.
 */

import {
  toSearchResultResponse,
  toOwnerSearchResultResponse,
  toCategoryResultResponse,
  toDestinationResultResponse,
  toSuggestionResponse,
  toFilterGroupsResponse,
} from '../dto/searchDto.js';

export function createSearchController(searchService) {
  return {
    async searchListings(req, res, next) {
      try {
        const { rows, meta, isOwnerView } = await searchService.searchListings(
          req.principal,
          req.validated.query,
        );
        // Listing Lifetime / Renewal, Step B5: `isOwnerView` is exactly the
        // same elevated population that can already see a non-PUBLISHED
        // card through this endpoint (see `searchService.js`'s own
        // `#resolveVisibility` comment) — only that population gets the
        // lifecycle-inclusive DTO; a public/anonymous caller keeps getting
        // the exact same shape it always has.
        const toResponse = isOwnerView
          ? toOwnerSearchResultResponse
          : toSearchResultResponse;
        res.status(200).json({
          success: true,
          data: rows.map(toResponse),
          meta,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async searchCategories(req, res, next) {
      try {
        const categories = await searchService.searchCategories(
          req.validated.query.locale,
        );
        res.status(200).json({
          success: true,
          data: categories.map(toCategoryResultResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async searchDestinations(req, res, next) {
      try {
        const destinations = await searchService.searchDestinations(
          req.validated.query.locale,
        );
        res.status(200).json({
          success: true,
          data: destinations.map(toDestinationResultResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async suggest(req, res, next) {
      try {
        const suggestions = await searchService.suggest(
          req.validated.query.q,
          req.validated.query.locale,
        );
        res.status(200).json({
          success: true,
          data: suggestions.map(toSuggestionResponse),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async getFilterDefinitions(req, res, next) {
      try {
        const groups = await searchService.getFilterDefinitions(
          req.validated.query.categoryId,
        );
        res.status(200).json({
          success: true,
          data: toFilterGroupsResponse(groups),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createSearchController;

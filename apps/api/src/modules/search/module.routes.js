/**
 * Search module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic). Every route is public — `authenticate.js` (mounted
 * globally in `app.js`) still populates `req.principal` when a valid
 * token is present, which `SearchService` uses for the owner/admin
 * visibility rule, the same pattern as `listingController.get`.
 *
 * `GET /` and `GET /listings` both route to the same handler — see
 * `searchController.js`'s header comment.
 */

import { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  searchListingsQuerySchema,
  searchMapQuerySchema,
  searchCategoriesQuerySchema,
  searchDestinationsQuerySchema,
  searchSuggestionsQuerySchema,
  searchFiltersQuerySchema,
} from './validators/searchValidators.js';

export default function createSearchRoutes({ searchController }) {
  const router = Router();

  router.get(
    '/',
    validate(searchListingsQuerySchema),
    searchController.searchListings,
  );
  router.get(
    '/listings',
    validate(searchListingsQuerySchema),
    searchController.searchListings,
  );
  router.get(
    '/map',
    validate(searchMapQuerySchema),
    searchController.searchMap,
  );
  router.get(
    '/categories',
    validate(searchCategoriesQuerySchema),
    searchController.searchCategories,
  );
  router.get(
    '/destinations',
    validate(searchDestinationsQuerySchema),
    searchController.searchDestinations,
  );
  router.get(
    '/suggestions',
    validate(searchSuggestionsQuerySchema),
    searchController.suggest,
  );
  router.get(
    '/filters',
    validate(searchFiltersQuerySchema),
    searchController.getFilterDefinitions,
  );

  return router;
}

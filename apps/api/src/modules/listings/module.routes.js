/**
 * Listings module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic), mirroring `modules/users/module.routes.js`.
 *
 * `GET /`, `GET /:id`, and `GET /:id/media` do not require authentication
 * — `authenticate.js` (mounted globally in `app.js`) still populates
 * `req.principal` when a valid token is present, which `ListingService`
 * uses for the owner-vs-public visibility rule. Every mutating route
 * requires authentication; ownership vs. `listing.*`-permission fallbacks
 * are enforced inside `ListingService`, not here.
 */

import express, { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  createListingSchema,
  updateListingSchema,
  listingIdParamsSchema,
  listingIdOrSlugParamsSchema,
  listingMediaIdParamsSchema,
  updateListingMediaSchema,
  listListingsQuerySchema,
  listingMetadataQuerySchema,
  listListingsAdminQuerySchema,
  updateListingModerationStatusSchema,
  replaceHighlightsSchema,
  replaceItineraryStepsSchema,
  replaceIncludedItemsSchema,
  replaceFaqsSchema,
  listingCompletenessSchema,
} from './validators/listingValidators.js';
import {
  listMenusSchema,
  createMenuSchema,
  updateMenuSchema,
  menuIdOnlySchema,
  createSectionSchema,
  updateSectionSchema,
  sectionIdOnlySchema,
  createItemSchema,
  updateItemSchema,
  itemIdOnlySchema,
} from './validators/restaurantMenuValidators.js';
import {
  getOpeningHoursSchema,
  replaceOpeningHoursSchema,
} from './validators/openingHoursValidators.js';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
} from '../media/validators/mediaConstraints.js';

const ALLOWED_LISTING_MEDIA_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_VIDEO_MIME_TYPES,
];

export default function createListingRoutes({
  listingController,
  restaurantMenuController,
  openingHoursController,
  guards,
}) {
  const router = Router();
  const { requireAuth, requirePermission } = guards;

  router.post(
    '/',
    requireAuth,
    validate(createListingSchema),
    listingController.create,
  );

  router.get('/', validate(listListingsQuerySchema), listingController.list);

  // Registered before `/:id` — otherwise Express would match `/metadata`
  // as `:id = "metadata"`. Public, category-scoped catalog data (same
  // visibility rule as `GET /search/filters`), no auth required.
  router.get(
    '/metadata',
    validate(listingMetadataQuerySchema),
    listingController.getMetadata,
  );

  // Stage 11.3 (Admin Platform — Listing Moderation) — `/admin*`,
  // registered before `/:id` for the same collision-avoidance reason
  // `/metadata` is (single path segment, would otherwise be matched as
  // `:id = "admin"`). Each route's permission is enforced again inside
  // `ListingService` (defense in depth, matching every other admin route
  // in this codebase) — the guard here is the fast-fail layer.
  router.get(
    '/admin',
    requireAuth,
    requirePermission('listing.moderate'),
    validate(listListingsAdminQuerySchema),
    listingController.listAdmin,
  );
  router.get(
    '/admin/:id',
    requireAuth,
    requirePermission('listing.moderate'),
    validate(listingIdParamsSchema),
    listingController.getAdminDetail,
  );
  router.patch(
    '/admin/:id/moderation-status',
    requireAuth,
    requirePermission('listing.moderate'),
    validate(updateListingModerationStatusSchema),
    listingController.updateModerationStatus,
  );

  // Phase 20 (SEO): accepts either the numeric id (legacy/still-shared
  // links) or the listing's slug (the canonical, indexable URL form) —
  // see `listingIdOrSlugParamsSchema`'s own comment for why this is the
  // one route scoped to accept a slug.
  router.get(
    '/:id',
    validate(listingIdOrSlugParamsSchema),
    listingController.get,
  );

  router.patch(
    '/:id',
    requireAuth,
    validate(updateListingSchema),
    listingController.update,
  );

  router.delete(
    '/:id',
    requireAuth,
    validate(listingIdParamsSchema),
    listingController.remove,
  );

  router.post(
    '/:id/publish',
    requireAuth,
    validate(listingIdParamsSchema),
    listingController.publish,
  );

  router.post(
    '/:id/unpublish',
    requireAuth,
    validate(listingIdParamsSchema),
    listingController.unpublish,
  );

  // Phase 9 (Partner Dashboard): exercises the pre-existing
  // PUBLISHED|UNPUBLISHED -> ARCHIVED transition (listingStatusTransitions.js)
  // that no endpoint reached until now. Deliberately no `/unarchive` —
  // ARCHIVED is terminal in the domain state machine.
  router.post(
    '/:id/archive',
    requireAuth,
    validate(listingIdParamsSchema),
    listingController.archive,
  );

  router.get(
    '/:id/media',
    validate(listingIdParamsSchema),
    listingController.listMedia,
  );

  router.post(
    '/:id/media',
    requireAuth,
    // Scoped to this one route only, same pattern as the users module's
    // avatar upload — the global body parser skips non-JSON content-types.
    express.raw({ type: ALLOWED_LISTING_MEDIA_MIME_TYPES, limit: '200mb' }),
    validate(listingIdParamsSchema),
    listingController.attachMedia,
  );

  router.patch(
    '/:id/media/:mediaId',
    requireAuth,
    validate(updateListingMediaSchema),
    listingController.updateMedia,
  );

  router.delete(
    '/:id/media/:mediaId',
    requireAuth,
    validate(listingMediaIdParamsSchema),
    listingController.removeMedia,
  );

  // --- Phase 18 (Premium Listing Detail): highlights / itinerary /
  // included-items / FAQs — full-replace PATCH, owner-or-`listing.update`
  // gated inside ListingService, same as every other listing write route.
  router.patch(
    '/:id/highlights',
    requireAuth,
    validate(replaceHighlightsSchema),
    listingController.replaceHighlights,
  );

  router.patch(
    '/:id/itinerary',
    requireAuth,
    validate(replaceItineraryStepsSchema),
    listingController.replaceItinerarySteps,
  );

  router.patch(
    '/:id/included-items',
    requireAuth,
    validate(replaceIncludedItemsSchema),
    listingController.replaceIncludedItems,
  );

  router.patch(
    '/:id/faqs',
    requireAuth,
    validate(replaceFaqsSchema),
    listingController.replaceFaqs,
  );

  router.get(
    '/:id/completeness',
    requireAuth,
    validate(listingCompletenessSchema),
    listingController.getCompleteness,
  );

  // --- Pass 3 remediation (Restaurant vertical): a listing's menu tree.
  // Public read (same visibility model as `GET /:id` — this is content on
  // an existing listing, not gated separately), owner-or-`listing.update`
  // writes, same as every rich-content route above.
  router.get(
    '/:id/menu',
    validate(listMenusSchema),
    restaurantMenuController.listForListing,
  );
  router.post(
    '/:id/menu',
    requireAuth,
    validate(createMenuSchema),
    restaurantMenuController.createMenu,
  );
  router.patch(
    '/menu/:menuId',
    requireAuth,
    validate(updateMenuSchema),
    restaurantMenuController.updateMenu,
  );
  router.delete(
    '/menu/:menuId',
    requireAuth,
    validate(menuIdOnlySchema),
    restaurantMenuController.deleteMenu,
  );
  router.post(
    '/menu/:menuId/sections',
    requireAuth,
    validate(createSectionSchema),
    restaurantMenuController.createSection,
  );
  router.patch(
    '/menu/sections/:sectionId',
    requireAuth,
    validate(updateSectionSchema),
    restaurantMenuController.updateSection,
  );
  router.delete(
    '/menu/sections/:sectionId',
    requireAuth,
    validate(sectionIdOnlySchema),
    restaurantMenuController.deleteSection,
  );
  router.post(
    '/menu/sections/:sectionId/items',
    requireAuth,
    validate(createItemSchema),
    restaurantMenuController.createItem,
  );
  router.patch(
    '/menu/items/:itemId',
    requireAuth,
    validate(updateItemSchema),
    restaurantMenuController.updateItem,
  );
  router.delete(
    '/menu/items/:itemId',
    requireAuth,
    validate(itemIdOnlySchema),
    restaurantMenuController.deleteItem,
  );

  // --- Pass 6 (Restaurant vertical): weekly opening hours. Public read
  // (same visibility model as `GET /:id/menu`), owner-or-`listing.update`
  // full-replace write, same as every other rich-content route above.
  router.get(
    '/:id/opening-hours',
    validate(getOpeningHoursSchema),
    openingHoursController.getForListing,
  );
  router.put(
    '/:id/opening-hours',
    requireAuth,
    validate(replaceOpeningHoursSchema),
    openingHoursController.replaceForListing,
  );

  return router;
}

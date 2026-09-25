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
  publishListingSchema,
  submitForReviewSchema,
  renewListingSchema,
  listingIdOrSlugParamsSchema,
  listingMediaIdParamsSchema,
  updateListingMediaSchema,
  listListingsQuerySchema,
  listingMetadataQuerySchema,
  listListingsAdminQuerySchema,
  updateListingModerationStatusSchema,
  listingModerationHistoryQuerySchema,
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
  MAX_FILE_SIZE_BYTES,
} from '../media/validators/mediaConstraints.js';

// Step L3 (brief §12): a declared image request must never be able to
// buffer up to the video ceiling before its own, much smaller, limit is
// even checked — each instance only consumes the request body when its
// own `type` matches the declared Content-Type (body-parser's documented
// per-type skip-if-unmatched behavior), so chaining both below applies
// the correct kind-specific limit instead of one flat ceiling for every
// declared type. Neither consumes the body for an unsupported declared
// type, which falls through to `attachMedia`'s existing empty-body
// check.
const rawListingImageBody = express.raw({
  type: ALLOWED_IMAGE_MIME_TYPES,
  limit: MAX_FILE_SIZE_BYTES.image,
});
const rawListingVideoBody = express.raw({
  type: ALLOWED_VIDEO_MIME_TYPES,
  limit: MAX_FILE_SIZE_BYTES.video,
});

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
  // Step M3.1 — scoped moderation-history read for MODERATOR, who holds
  // `listing.moderate` but deliberately not the global `audit.view`
  // (see `AuditLogger#listForTarget`'s doc comment). Registered here,
  // alongside the other `/admin/:id*` routes, for the same ordering
  // reason as `/admin` vs `/admin/:id` above.
  router.get(
    '/admin/:id/moderation-history',
    requireAuth,
    requirePermission('listing.moderate'),
    validate(listingModerationHistoryQuerySchema),
    listingController.getModerationHistory,
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

  // Step M2B (brief §5): the new mandatory pre-publication step — same
  // route/verb convention as every other lifecycle action below (an
  // explicit `POST /:id/{verb}`, never a PATCH-with-a-status-field for
  // this dimension — that shape is reserved for the moderation-status
  // action above, `/admin/:id/moderation-status`, matching this
  // codebase's established split between "lifecycle action" endpoints
  // and "moderation decision" endpoints).
  router.post(
    '/:id/submit-for-review',
    requireAuth,
    validate(submitForReviewSchema),
    listingController.submitForReview,
  );

  router.post(
    '/:id/publish',
    requireAuth,
    validate(publishListingSchema),
    listingController.publish,
  );

  // Listing Lifetime / Renewal, Step B5: an explicit, separate action —
  // never a side effect of ordinary Publish/PATCH (see `ListingService
  // #renewListing`'s own doc comment for why it needs its own endpoint).
  router.post(
    '/:id/renew',
    requireAuth,
    validate(renewListingSchema),
    listingController.renew,
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
    rawListingImageBody,
    rawListingVideoBody,
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

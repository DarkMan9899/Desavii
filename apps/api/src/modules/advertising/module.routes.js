/**
 * Advertising module route wiring (BACKEND_ARCHITECTURE.md §2: route
 * wiring only, no logic).
 *
 * Every Admin route requires `ADMIN`/`SUPER_ADMIN` outright (spec §12/§23
 * — Sprint E's promotion management is Admin-only, no partner self-
 * service yet) plus the specific granular permission Sprint 5 already
 * seeded for the two payment-sensitive actions (`promotion.approve` also
 * reaches MODERATOR — see `004_roles_and_permissions.js` — but the
 * `requireRole` gate above it still excludes MODERATOR from every OTHER
 * write here, e.g. create/mark-paid/cancel/extend, matching the existing
 * two-permission split's own boundary).
 *
 * The two `/public/*` routes are genuinely public (no auth) — the
 * Home/Category pages' anonymous visitors.
 *
 * Route-order hazard (mirrors `availability/module.routes.js`'s own
 * documented pattern): `/public/home-featured` and `/public/category-top`
 * are two-segment static paths, `/:id` is single-segment dynamic — no
 * collision either way, but `/public/*` is still registered first here
 * for readability, grouped with the other public route.
 */

import { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  listCatalogSchema,
  createAdvertisementSchema,
  advertisementIdParamsSchema,
  extendAdvertisementSchema,
  listAdvertisementsQuerySchema,
  publicHomeFeaturedQuerySchema,
  publicCategoryTopQuerySchema,
} from './validators/advertisementValidators.js';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export default function createAdvertisingRoutes({
  advertisementController,
  guards,
}) {
  const router = Router();
  const { requireAuth, requireRole, requirePermission } = guards;

  router.get(
    '/public/home-featured',
    validate(publicHomeFeaturedQuerySchema),
    advertisementController.getPublicHomeFeatured,
  );
  router.get(
    '/public/category-top',
    validate(publicCategoryTopQuerySchema),
    advertisementController.getPublicCategoryTop,
  );

  const adminRouter = Router();
  adminRouter.use(requireAuth, requireRole(...ADMIN_ROLES));

  adminRouter.get(
    '/catalog',
    validate(listCatalogSchema),
    advertisementController.getPlacementCatalog,
  );
  adminRouter.get(
    '/',
    validate(listAdvertisementsQuerySchema),
    advertisementController.list,
  );
  adminRouter.post(
    '/',
    validate(createAdvertisementSchema),
    advertisementController.create,
  );
  adminRouter.get(
    '/:id',
    validate(advertisementIdParamsSchema),
    advertisementController.get,
  );
  adminRouter.post(
    '/:id/mark-paid',
    requirePermission('promotion.mark_paid'),
    validate(advertisementIdParamsSchema),
    advertisementController.markPaid,
  );
  adminRouter.post(
    '/:id/approve',
    requirePermission('promotion.approve'),
    validate(advertisementIdParamsSchema),
    advertisementController.approve,
  );
  adminRouter.post(
    '/:id/reject',
    validate(advertisementIdParamsSchema),
    advertisementController.reject,
  );
  adminRouter.post(
    '/:id/cancel',
    validate(advertisementIdParamsSchema),
    advertisementController.cancel,
  );
  adminRouter.post(
    '/:id/pause',
    validate(advertisementIdParamsSchema),
    advertisementController.pause,
  );
  adminRouter.post(
    '/:id/resume',
    validate(advertisementIdParamsSchema),
    advertisementController.resume,
  );
  adminRouter.post(
    '/:id/extend',
    validate(extendAdvertisementSchema),
    advertisementController.extend,
  );

  router.use('/admin', adminRouter);

  return router;
}

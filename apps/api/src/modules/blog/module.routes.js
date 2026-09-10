/**
 * Blog module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic).
 *
 * `/admin/*` requires `ADMIN`/`SUPER_ADMIN`/`MARKETING` outright plus
 * `blog.manage` on every route — `BlogService` re-checks the same
 * permission internally (defense in depth, same convention every other
 * admin-facing module in this codebase follows), and additionally
 * requires `blog.publish` internally for the publish/unpublish/
 * schedule/unschedule actions (spec §37's two-tier authoring-vs-
 * publishing split — enforced in the Service, not duplicated here as a
 * second route-level guard, since every one of these routes is already
 * gated by `blog.manage` first). This single admin route tree serves
 * BOTH the Admin (`/admin/blog`) and Marketing (`/marketing`) frontend
 * workspaces — they call the same API, just from two different UI
 * shells (spec §38: "do not duplicate identical CMS screens").
 */

import express, { Router } from 'express';
import { validate } from '../../validation/validate.js';
import {
  createDraftSchema,
  postIdParamsSchema,
  listPostsAdminQuerySchema,
  updateSettingsSchema,
  upsertTranslationSchema,
  attachCoverImageQuerySchema,
  scheduleSchema,
  publicListQuerySchema,
  publicSlugParamsSchema,
  publicTaxonomyQuerySchema,
  marketingRoleSchema,
} from './validators/blogValidators.js';
import { ALLOWED_IMAGE_MIME_TYPES } from '../media/validators/mediaConstraints.js';

const ADMIN_AREA_ROLES = ['ADMIN', 'SUPER_ADMIN', 'MARKETING'];

export default function createBlogRoutes({ blogController, guards }) {
  const router = Router();
  const { requireAuth, requireRole, requirePermission } = guards;

  // --- Public (no auth) ---

  router.get(
    '/posts',
    validate(publicListQuerySchema),
    blogController.listPublic,
  );
  router.get(
    '/categories',
    validate(publicTaxonomyQuerySchema),
    blogController.listPublicCategories,
  );
  router.get(
    '/tags',
    validate(publicTaxonomyQuerySchema),
    blogController.listPublicTags,
  );
  // Registered after the two fixed-segment routes above (`/categories`,
  // `/tags`) — same collision-avoidance ordering `listings/module.routes.js`
  // uses for `/metadata` vs. `/:id`.
  router.get(
    '/posts/:slug',
    validate(publicSlugParamsSchema),
    blogController.getPublicDetail,
  );

  // --- Admin/Marketing ---

  const adminRouter = Router();
  adminRouter.use(
    requireAuth,
    requireRole(...ADMIN_AREA_ROLES),
    requirePermission('blog.manage'),
  );

  adminRouter.post(
    '/posts',
    validate(createDraftSchema),
    blogController.createDraft,
  );
  adminRouter.get(
    '/posts',
    validate(listPostsAdminQuerySchema),
    blogController.list,
  );
  adminRouter.get(
    '/posts/:id',
    validate(postIdParamsSchema),
    blogController.getDetail,
  );
  adminRouter.patch(
    '/posts/:id',
    validate(updateSettingsSchema),
    blogController.updateSettings,
  );
  adminRouter.put(
    '/posts/:id/translations/:languageCode',
    validate(upsertTranslationSchema),
    blogController.upsertTranslation,
  );
  adminRouter.post(
    '/posts/:id/cover',
    express.raw({ type: ALLOWED_IMAGE_MIME_TYPES, limit: '20mb' }),
    validate(attachCoverImageQuerySchema),
    blogController.attachCover,
  );
  adminRouter.delete(
    '/posts/:id/cover',
    validate(postIdParamsSchema),
    blogController.removeCover,
  );
  adminRouter.post(
    '/posts/:id/publish',
    validate(postIdParamsSchema),
    blogController.publish,
  );
  adminRouter.post(
    '/posts/:id/unpublish',
    validate(postIdParamsSchema),
    blogController.unpublish,
  );
  adminRouter.post(
    '/posts/:id/schedule',
    validate(scheduleSchema),
    blogController.schedule,
  );
  adminRouter.post(
    '/posts/:id/unschedule',
    validate(postIdParamsSchema),
    blogController.unschedule,
  );

  router.use('/admin', adminRouter);

  // Marketing role assignment — deliberately its OWN, stricter-gated
  // sub-router (ADMIN/SUPER_ADMIN only, never MARKETING itself — a
  // Marketing user must never be able to grant/revoke its own role,
  // spec §16's "must NOT automatically access... security settings").
  const marketingRoleRouter = Router();
  marketingRoleRouter.use(
    requireAuth,
    requireRole('ADMIN', 'SUPER_ADMIN'),
    requirePermission('marketing.assign'),
  );
  marketingRoleRouter.post(
    '/promote',
    validate(marketingRoleSchema),
    blogController.promoteToMarketing,
  );
  marketingRoleRouter.post(
    '/demote',
    validate(marketingRoleSchema),
    blogController.demoteFromMarketing,
  );
  router.use('/admin/marketing-role', marketingRoleRouter);

  return router;
}

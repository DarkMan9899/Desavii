/**
 * Partners module route wiring (BACKEND_ARCHITECTURE.md §2: route wiring
 * only, no logic). `GET /mine` requires authentication — there is no
 * meaningful anonymous answer to "which partner orgs do I belong to."
 *
 * Phase 10: `GET /` and `GET /:slug` are the module's first public
 * routes (Companies directory + profile) — no auth required, same
 * unauthenticated-read pattern as `GET /listings`. `/mine` is registered
 * before `/:slug` so Express doesn't match the literal path `/mine` as
 * `:slug = "mine"`.
 */

import express, { Router } from 'express';
import { validate } from '../../validation/validate.js';
import { ALLOWED_IMAGE_MIME_TYPES } from '../media/validators/mediaConstraints.js';
import {
  listPublicPartnersQuerySchema,
  partnerSlugParamsSchema,
  listCompanyListingsSchema,
  userIdParamsSchema,
  listPartnersAdminQuerySchema,
  partnerIdParamsSchema,
  updateVerificationStatusSchema,
  updateModerationStatusSchema,
  createApplicationSchema,
  updateApplicationSchema,
  updateProfileSchema,
} from './validators/partnerValidators.js';
import {
  partnerStaffParamsSchema,
  inviteStaffSchema,
  updateStaffRoleSchema,
  invitationIdParamsSchema,
  invitationTokenParamsSchema,
} from './validators/partnerStaffValidators.js';

export default function createPartnerRoutes({
  partnerController,
  partnerStaffController,
  guards,
}) {
  const router = Router();
  const { requireAuth, requirePermission } = guards;

  router.get('/mine', requireAuth, partnerController.getMine);

  // P1.2 (Master Roadmap) — self-service application. Registered before
  // `/:slug` for the same collision-avoidance reason as `/mine`/`/admin`
  // below (`/applications` is more than one path segment, but kept
  // alongside them for readability). No special permission required —
  // any authenticated user may start an application; only the ADMIN
  // review side (`/admin/*`) is permission-gated.
  // Registered before `/applications/:id` — a collection route ("list
  // everything") and an item route on the same base path, same ordering
  // rule as everywhere else in this file.
  router.get(
    '/applications',
    requireAuth,
    partnerController.listMyApplications,
  );
  router.post(
    '/applications',
    requireAuth,
    validate(createApplicationSchema),
    partnerController.apply,
  );
  router.get(
    '/applications/:id',
    requireAuth,
    validate(partnerIdParamsSchema),
    partnerController.getMyApplication,
  );
  router.patch(
    '/applications/:id',
    requireAuth,
    validate(updateApplicationSchema),
    partnerController.updateMyApplication,
  );
  router.post(
    '/applications/:id/submit',
    requireAuth,
    validate(partnerIdParamsSchema),
    partnerController.submitMyApplication,
  );

  // P1.4 (Master Roadmap) — acted on by the INVITEE, not an existing
  // partner staff member, so these are never nested under `/:id/staff*`
  // below. Registered before `/:slug` for the usual collision-avoidance
  // reason. `GET` requires no auth (possession of the raw token is
  // itself the proof — see `partnerStaffService.js#previewInvitation`);
  // `POST .../accept` does, since it creates a real `partner_employees`
  // row under the CURRENT signed-in user.
  router.get(
    '/invitations/:token',
    validate(invitationTokenParamsSchema),
    partnerStaffController.previewInvitation,
  );
  router.post(
    '/invitations/:token/accept',
    requireAuth,
    validate(invitationTokenParamsSchema),
    partnerStaffController.acceptInvitation,
  );

  // P1.3 (Master Roadmap) — owner/staff company-profile management, for
  // an already-APPROVED partner (unlike `/applications/*` above, which
  // is scoped to an in-progress application). `PartnerService#assertCan
  // ManageProfile` (owner bypass + `MANAGE_COMPANY_PROFILE` capability)
  // does the real authorization; `requireAuth` here is just the
  // fast-fail layer, same defense-in-depth convention as `/admin/*`.
  router.get(
    '/:id/profile',
    requireAuth,
    validate(partnerIdParamsSchema),
    partnerController.getMyCompanyProfile,
  );
  router.patch(
    '/:id/profile',
    requireAuth,
    validate(updateProfileSchema),
    partnerController.updateMyCompanyProfile,
  );
  router.post(
    '/:id/logo',
    requireAuth,
    // Scoped to this one route only, same pattern as the listings
    // module's media upload — the global body parser skips non-JSON
    // content-types.
    express.raw({ type: ALLOWED_IMAGE_MIME_TYPES, limit: '10mb' }),
    validate(partnerIdParamsSchema),
    partnerController.uploadCompanyLogo,
  );
  router.post(
    '/:id/cover',
    requireAuth,
    express.raw({ type: ALLOWED_IMAGE_MIME_TYPES, limit: '10mb' }),
    validate(partnerIdParamsSchema),
    partnerController.uploadCompanyCover,
  );

  // P1.4 (Master Roadmap) — staff roster and invitations for an existing
  // partner org. `PartnerStaffService`'s own `assertIsPartnerMember`
  // (list) / `assertPartnerCapability(MANAGE_STAFF)` (everything else)
  // does the real authorization; `requireAuth` here is just the
  // fast-fail layer, same defense-in-depth convention as `/:id/profile`
  // above. Registered before `/:slug` for the usual reason.
  router.get(
    '/:id/staff',
    requireAuth,
    validate(partnerIdParamsSchema),
    partnerStaffController.listStaff,
  );
  router.patch(
    '/:id/staff/:employeeId',
    requireAuth,
    validate(updateStaffRoleSchema),
    partnerStaffController.updateStaffRole,
  );
  router.delete(
    '/:id/staff/:employeeId',
    requireAuth,
    validate(partnerStaffParamsSchema),
    partnerStaffController.removeStaff,
  );
  router.get(
    '/:id/staff/invitations',
    requireAuth,
    validate(partnerIdParamsSchema),
    partnerStaffController.listInvitations,
  );
  router.post(
    '/:id/staff/invitations',
    requireAuth,
    validate(inviteStaffSchema),
    partnerStaffController.inviteStaff,
  );
  router.delete(
    '/:id/staff/invitations/:invitationId',
    requireAuth,
    validate(invitationIdParamsSchema),
    partnerStaffController.revokeInvitation,
  );

  // Phase 11 Admin Platform — registered before `/:slug` (same reason
  // `/mine` is): `/by-user/:userId` is two path segments so it never
  // actually collides with `/:slug`'s one-segment match, but kept
  // alongside `/mine` for readability.
  router.get(
    '/by-user/:userId',
    requireAuth,
    requirePermission('user.view'),
    validate(userIdParamsSchema),
    partnerController.getMembershipsForUser,
  );

  // Stage 11.2 (Partner Management) — `/admin*`, registered before
  // `/:slug` for the same collision-avoidance reason as `/mine` and
  // `/by-user/:userId`. Each route's own permission requirement is
  // enforced again inside `PartnerService` (defense in depth, matching
  // every other admin route in this codebase) — the guard here is the
  // fast-fail layer.
  router.get(
    '/admin',
    requireAuth,
    requirePermission('partner.verify', 'partner.moderate'),
    validate(listPartnersAdminQuerySchema),
    partnerController.listAdmin,
  );
  router.get(
    '/admin/:id',
    requireAuth,
    requirePermission('partner.verify', 'partner.moderate'),
    validate(partnerIdParamsSchema),
    partnerController.getAdminDetail,
  );
  router.patch(
    '/admin/:id/verification-status',
    requireAuth,
    requirePermission('partner.verify'),
    validate(updateVerificationStatusSchema),
    partnerController.updateVerificationStatus,
  );
  router.patch(
    '/admin/:id/moderation-status',
    requireAuth,
    requirePermission('partner.moderate'),
    validate(updateModerationStatusSchema),
    partnerController.updateModerationStatus,
  );

  router.get(
    '/',
    validate(listPublicPartnersQuerySchema),
    partnerController.list,
  );

  router.get(
    '/:slug',
    validate(partnerSlugParamsSchema),
    partnerController.getBySlug,
  );

  // Company Public Profile (Step A1) — two path segments, so this can
  // never collide with the one-segment `/:slug` above regardless of
  // registration order; kept directly after it for readability as its
  // sub-resource.
  router.get(
    '/:slug/listings',
    validate(listCompanyListingsSchema),
    partnerController.listCompanyListings,
  );

  return router;
}

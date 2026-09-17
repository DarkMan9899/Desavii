/**
 * Partners module — raw endpoint calls (FRONTEND_ARCHITECTURE.md §3.1's
 * `api/` contract). Mirrors `apps/api/src/modules/partners/
 * module.routes.js`. Phase 5 shipped `GET /mine` (authenticated, "which
 * partner orgs am I an employee of"). Phase 10 (redesign) adds the
 * module's first public reads — `GET /` (Companies directory) and
 * `GET /:slug` (Company profile) — no org creation/editing exists on
 * either phase's backend.
 */

import apiClient from './client.js';

/**
 * `GET /partners/mine` — the authenticated user's partner memberships,
 * `[{ partner_id, slug, display_name, role }]` (`partnerDto.js`'s
 * `toPartnershipResponse`). Requires authentication; there is no
 * meaningful anonymous answer.
 */
export function getMyPartnerships() {
  return apiClient.get('/partners/mine').then((response) => response.data);
}

/**
 * `GET /partners` — public Companies directory, cursor-paginated
 * (`{ id, slug, display_name, description, logo_url, cover_url,
 * listing_count, is_verified }[]` — `partnerDto.js`'s
 * `toPartnerSummaryResponse`). No auth required.
 * @param {{ cursor?: string, limit?: number }} params
 */
export function getPartners(params) {
  return apiClient
    .get('/partners', { params })
    .then((response) => response.data);
}

/**
 * `GET /partners/:slug` — public Company profile (extends the summary
 * shape above with `email, phone, website, social_links` —
 * `partnerDto.js`'s `toPartnerDetailResponse`). No auth required;
 * resolves to a 404 for an unknown/unapproved slug.
 * @param {string} slug
 */
export function getPartnerBySlug(slug) {
  return apiClient
    .get(`/partners/${encodeURIComponent(slug)}`)
    .then((response) => response.data);
}

/**
 * `GET /partners/:slug/listings` — Company Public Profile (Step A1/A2):
 * a company's currently-public listings across all categories,
 * cursor-paginated, same flat card-field shape `GET /search` returns
 * (`category_slug`, `cuisine`, `price_tier`, `star_rating`,
 * `transmission`, `bedrooms`, `duration_minutes`, etc. —
 * `partnerDto.js`'s `toPartnerListingResponse`). No auth required;
 * resolves to a 404 for an unknown/unapproved company slug (same as
 * `getPartnerBySlug`), never for a valid company with zero listings.
 * @param {string} slug
 * @param {{ cursor?: string, limit?: number }} params
 */
export function getPartnerListings(slug, params) {
  return apiClient
    .get(`/partners/${encodeURIComponent(slug)}/listings`, { params })
    .then((response) => response.data);
}

/**
 * `GET /partners/by-user/:userId` — Phase 11 Admin Platform: another
 * user's partner memberships, for the User Management detail page.
 * Requires `user.view`.
 */
export function getPartnerMembershipsForUser(userId) {
  return apiClient
    .get(`/partners/by-user/${userId}`)
    .then((response) => response.data);
}

/**
 * P1.2 (Master Roadmap) — self-service partner onboarding, all under
 * `/partners/applications*`. Any authenticated user; no special
 * permission (the admin review side, `/partners/admin/*` above, is
 * permission-gated — this is the applicant's own side).
 */

/**
 * `GET /partners/applications` — every partner org this user owns/
 * belongs to REGARDLESS of status (unlike `getMyPartnerships`, which is
 * deliberately approved-only). How the frontend discovers "do I already
 * have an application in progress" without knowing its id upfront.
 */
export function getMyApplications() {
  return apiClient
    .get('/partners/applications')
    .then((response) => response.data);
}

/** `POST /partners/applications` — starts a new DRAFT application. `displayName` is the only required field at this stage. */
export function createPartnerApplication(data) {
  return apiClient
    .post('/partners/applications', data)
    .then((response) => response.data);
}

/** `GET /partners/applications/:id` — owner-only full detail, including the admin's reviewNote if any. 404s for anyone but the owner. */
export function getPartnerApplication(id) {
  return apiClient
    .get(`/partners/applications/${id}`)
    .then((response) => response.data);
}

/** `PATCH /partners/applications/:id` — owner-only edit; only while DRAFT/NEEDS_CHANGES (409 otherwise). */
export function updatePartnerApplication(id, data) {
  return apiClient
    .patch(`/partners/applications/${id}`, data)
    .then((response) => response.data);
}

/** `POST /partners/applications/:id/submit` — DRAFT/NEEDS_CHANGES -> PENDING. 422 if required fields are incomplete. */
export function submitPartnerApplication(id) {
  return apiClient
    .post(`/partners/applications/${id}/submit`)
    .then((response) => response.data);
}

/**
 * P1.3 (Master Roadmap) — owner/staff company-profile management for an
 * already-APPROVED partner, all under `/partners/:id/*`. Any active
 * partner_employees member may read; only OWNER or a role granted
 * `MANAGE_COMPANY_PROFILE` may write (enforced server-side in
 * `partnerService.js#assertCanManageProfile` — never just by hiding a
 * button here).
 */

/** `GET /partners/:id/profile` — the caller's own company profile (any status). */
export function getMyCompanyProfile(id) {
  return apiClient
    .get(`/partners/${id}/profile`)
    .then((response) => response.data);
}

/**
 * `PATCH /partners/:id/profile` — `displayName`/`email`/`phone`/
 * `website`/`socialLinks` update anytime; `description` requires
 * `locale` alongside it (which `partner_translations` row to write —
 * see `partnerValidators.js`'s `updateProfileSchema`).
 */
export function updateMyCompanyProfile(id, data) {
  return apiClient
    .patch(`/partners/${id}/profile`, data)
    .then((response) => response.data);
}

/**
 * `POST /partners/:id/logo` / `/cover` — raw binary body, same
 * one-request-per-file convention as `attachListingMedia`.
 * @param {number} id
 * @param {File} file
 */
export function uploadCompanyLogo(id, file) {
  return apiClient
    .post(`/partners/${id}/logo`, file, {
      headers: { 'Content-Type': file.type },
    })
    .then((response) => response.data);
}

/** @param {number} id @param {File} file */
export function uploadCompanyCover(id, file) {
  return apiClient
    .post(`/partners/${id}/cover`, file, {
      headers: { 'Content-Type': file.type },
    })
    .then((response) => response.data);
}

/**
 * P1.4 (Master Roadmap) — staff roster and invitations for an
 * already-APPROVED partner, all under `/partners/:id/staff*`. Any active
 * `partner_employees` member may list staff; everything else requires
 * OWNER or a role granted `MANAGE_STAFF` (enforced server-side in
 * `partnerStaffService.js` — never just by hiding a button here).
 */

/** `GET /partners/:id/staff` — the active roster. */
export function getPartnerStaff(id) {
  return apiClient
    .get(`/partners/${id}/staff`)
    .then((response) => response.data);
}

/** `PATCH /partners/:id/staff/:employeeId` — change a staff member's role. Never the owner (409/403 server-side). */
export function updatePartnerStaffRole(id, employeeId, roleCode) {
  return apiClient
    .patch(`/partners/${id}/staff/${employeeId}`, { roleCode })
    .then((response) => response.data);
}

/** `DELETE /partners/:id/staff/:employeeId` — revoke a staff member's access. Never the owner. */
export function removePartnerStaff(id, employeeId) {
  return apiClient
    .delete(`/partners/${id}/staff/${employeeId}`)
    .then((response) => response.data);
}

/** `GET /partners/:id/staff/invitations` — every still-pending invitation. */
export function getPartnerStaffInvitations(id) {
  return apiClient
    .get(`/partners/${id}/staff/invitations`)
    .then((response) => response.data);
}

/**
 * `POST /partners/:id/staff/invitations` — invites someone by email.
 * `locale` is the dashboard's own current UI locale (same explicit-locale
 * convention `updateMyCompanyProfile` already uses) — there is no
 * recipient preferred-language to resolve for an invitee who may not
 * have an account yet. The response's `invite_url` is shown once, as a
 * "copy link" fallback (see `partnerStaffDto.js`'s own comment).
 */
export function invitePartnerStaff(id, { email, roleCode, locale }) {
  return apiClient
    .post(`/partners/${id}/staff/invitations`, { email, roleCode, locale })
    .then((response) => response.data);
}

/** `DELETE /partners/:id/staff/invitations/:invitationId` — revoke a pending invitation before it's accepted. */
export function revokePartnerStaffInvitation(id, invitationId) {
  return apiClient
    .delete(`/partners/${id}/staff/invitations/${invitationId}`)
    .then((response) => response.data);
}

/**
 * `GET /partners/invitations/:token` — unauthenticated preview (company
 * name, role, invited email), so the accept page can show "You've been
 * invited to join X" before the visitor has signed in.
 */
export function previewPartnerStaffInvitation(token) {
  return apiClient
    .get(`/partners/invitations/${token}`)
    .then((response) => response.data);
}

/**
 * `POST /partners/invitations/:token/accept` — requires authentication;
 * 403 if the signed-in user's email doesn't match the invited address.
 */
export function acceptPartnerStaffInvitation(token) {
  return apiClient
    .post(`/partners/invitations/${token}/accept`)
    .then((response) => response.data);
}

/**
 * Stage 11.2 (Partner Management) — admin-scoped endpoints, all under
 * `/partners/admin/*`. Requires `partner.verify` or `partner.moderate`
 * for reads, the specific one for each write (see
 * `module.routes.js`/`partnerService.js`).
 */

/**
 * `GET /partners/admin` — every partner regardless of status,
 * cursor-paginated.
 * @param {{ keyword?: string, verificationStatus?: string, moderationStatus?: string, cursor?: string, limit?: number }} params
 */
export function getAdminPartners(params) {
  return apiClient
    .get('/partners/admin', { params })
    .then((response) => response.data);
}

/** `GET /partners/admin/:id` — admin-only detail, with owner + listing stats. */
export function getAdminPartnerDetail(id) {
  return apiClient
    .get(`/partners/admin/${id}`)
    .then((response) => response.data);
}

/**
 * `PATCH /partners/admin/:id/verification-status` — approve/reject/
 * request-changes on a partner's onboarding decision. Requires
 * `partner.verify`. `reviewNote` is required by the backend for
 * NEEDS_CHANGES, optional for REJECTED, ignored for APPROVED.
 */
export function updatePartnerVerificationStatus(id, status, reviewNote) {
  return apiClient
    .patch(`/partners/admin/${id}/verification-status`, {
      status,
      ...(reviewNote ? { reviewNote } : {}),
    })
    .then((response) => response.data);
}

/**
 * `PATCH /partners/admin/:id/moderation-status` — suspend (FLAGGED) or
 * restore (APPROVED) an already-verified partner's public visibility.
 * Requires `partner.moderate`.
 */
export function updatePartnerModerationStatus(id, status) {
  return apiClient
    .patch(`/partners/admin/${id}/moderation-status`, { status })
    .then((response) => response.data);
}

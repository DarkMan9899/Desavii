import {
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ConflictError,
} from '../../../errors/AppError.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { PARTNER_CAPABILITIES } from '../../../core/domain/partnerCapabilities.js';
import {
  assertIsPartnerMember,
  assertPartnerCapability,
} from '../authorization/partnerAuthorization.js';
import { resolveLocaleIds } from '../../../infrastructure/database/repositories/languageRepository.js';
import {
  classifyMimeType,
  isWithinSizeLimit,
} from '../../media/validators/mediaConstraints.js';
import { slugify } from '../../../core/domain/slugify.js';

// P1.2 (Master Roadmap) — DRAFT/NEEDS_CHANGES are the two codes added to
// the shared moderation_statuses lookup for self-service onboarding (see
// seeds/001_lookups.js's own comment); PENDING/APPROVED/REJECTED already
// existed. `updateVerificationStatus` (admin-only) only accepts the
// three admin-facing outcomes below — DRAFT is owner-only (set at
// creation) and reached again only implicitly, never admin-settable.
const VERIFICATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'NEEDS_CHANGES',
];
// Pre-existing, tested admin behavior (adminPartnerManagement.test.js):
// PENDING/APPROVED/REJECTED are freely inter-transitionable at any
// time — an admin can re-approve a previously-rejected partner, or
// reject an already-approved one after a later-discovered issue. That
// permissiveness predates NEEDS_CHANGES and must not regress just
// because a stricter state machine would read more cleanly. What IS
// new and real: an application still in DRAFT (never submitted) or
// NEEDS_CHANGES (currently in the applicant's own court, not the
// admin's) is never something an admin "reviews" — and NEEDS_CHANGES
// itself is only ever reachable from PENDING, since it didn't exist
// before and has no legacy behavior to preserve.
const UNREVIEWABLE_STATUSES = ['DRAFT', 'NEEDS_CHANGES'];
// An owner may only edit/submit their OWN application while it's
// actually theirs to change — never once it's under review or already
// resolved.
const OWNER_EDITABLE_STATUSES = ['DRAFT', 'NEEDS_CHANGES'];
// A user may not start a second application while one is already
// in-flight (DRAFT/PENDING/NEEDS_CHANGES) — a real, conservative default
// to prevent confusing duplicate applications, not a permanent ban:
// nothing stops a new application once a prior one is fully resolved
// (APPROVED/REJECTED).
const IN_PROGRESS_STATUSES = ['DRAFT', 'PENDING', 'NEEDS_CHANGES'];
// P1.2: no legal/KYC document requirement is defined for Desavii yet —
// deliberately NOT invented here (see the Master Roadmap's explicit
// instruction). This is the one real extension point: a future
// `requiredDocuments`/KYC step would run right after this list is
// satisfied, before submitMyApplication moves the application to
// PENDING, without changing anything else in this state machine.
const REQUIRED_FIELDS_TO_SUBMIT = [
  'legalName',
  'displayName',
  'email',
  'phone',
];

// This schema's shared `moderation_statuses` lookup has no literal
// SUSPENDED/RESTORED value — a partner's "moderation" lifecycle (as
// opposed to its "verification" lifecycle) only ever moves between
// APPROVED (visible, in good standing) and FLAGGED (hidden from the
// public Companies directory/profile — see `mysqlPartnerRepository.js`'s
// `listPublic`/`findPublicBySlug`, both scoped to `ms.code = 'APPROVED'`).
// "Suspend" sets FLAGGED; "restore" sets APPROVED back.
const MODERATION_STATUSES = ['APPROVED', 'FLAGGED'];

/**
 * PartnerService — public Service for the Partners module.
 *
 * Phase 5, minimal scope by design (see docs/plan "Phase 5 — Partner
 * Listing Creation"): this module does NOT do partner onboarding/creation
 * — every partner org today is seeded (`005_dev_accounts.js`). Its one job
 * was letting an authenticated user discover which partner org(s) they
 * belong to, so the frontend can gate/populate the listing wizard.
 *
 * Phase 10 (redesign) adds the module's first public reads: a Companies
 * directory listing and a single company's public profile.
 *
 * Phase 11 (Admin Platform) adds the module's first admin-scoped read
 * (another user's memberships, for the User Management detail page) and,
 * in a later stage, its first mutations (approve/reject/suspend/restore
 * a partner's verification status) — both gated by the injected
 * `permissionResolver`/`auditLogger`, mirroring every other module's
 * pattern rather than inventing a new one.
 */

export class PartnerService {
  #partnerRepository;

  #permissionResolver;

  #auditLogger;

  #eventBus;

  #storageProvider;

  constructor({
    partnerRepository,
    permissionResolver,
    auditLogger,
    eventBus = createNoOpEventBus(),
    storageProvider,
  }) {
    this.#eventBus = eventBus;
    this.#partnerRepository = partnerRepository;
    this.#permissionResolver = permissionResolver;
    this.#auditLogger = auditLogger;
    this.#storageProvider = storageProvider;
  }

  /** No owner fallback — every caller of these Stage 11.2 admin methods is inherently acting on someone else's org. */
  async #assertAnyPermission(principal, permissionKeys) {
    const granted = await Promise.all(
      permissionKeys.map((key) =>
        this.#permissionResolver.hasPermission(principal.roles, key),
      ),
    );
    if (!granted.some(Boolean)) throw new AuthorizationError();
  }

  async #assertPermission(principal, permissionKey) {
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
    if (!granted) throw new AuthorizationError();
  }

  async getMyPartnerships(principal) {
    // P1.2 (Master Roadmap): approvedOnly — see
    // mysqlPartnerRepository.js#listMembershipsForUser's own doc comment
    // for why this specific caller (feeding AuthContext's
    // RequirePartner-gating `partnerships` array) must never include an
    // in-progress application.
    return this.#partnerRepository.listMembershipsForUser(principal.userId, {
      approvedOnly: true,
    });
  }

  /**
   * P1.2 (Master Roadmap) — `GET /partners/applications` — every
   * partner org this user owns/belongs to, REGARDLESS of status
   * (unlike `getMyPartnerships`/`GET /partners/mine`, which is
   * deliberately approved-only — see that method's own comment). This
   * is how the frontend discovers "do I already have an application"
   * (DRAFT/PENDING/NEEDS_CHANGES/REJECTED all included) without needing
   * to already know its id.
   */
  async getMyApplications(principal) {
    if (!principal) throw new AuthenticationError();
    return this.#partnerRepository.listMembershipsForUser(principal.userId);
  }

  /** Owner-only gate shared by every self-service application method below — 404-masked, matching this codebase's "don't reveal existence to a non-owner" convention elsewhere (payments, bookings). */
  async #assertOwnsApplication(principal, partnerId) {
    if (!principal) throw new AuthenticationError();
    const owns = await isPartnerOwner(principal.userId, partnerId);
    if (!owns) throw new NotFoundError('Application not found.');
  }

  /**
   * P1.3 (Master Roadmap) — any ACTIVE `partner_employees` row, any
   * role — the read gate for `getMyCompanyProfile`. Deliberately weaker
   * than `#assertCanManageProfile` below: a receptionist-tier EDITOR
   * should be able to see the company profile they work for, even
   * though only OWNER/MANAGER may change it.
   */
  async #assertIsMember(principal, partnerId) {
    return assertIsPartnerMember(principal, partnerId);
  }

  /**
   * P1.3 (Master Roadmap) — owner bypass + `MANAGE_COMPANY_PROFILE`
   * capability, mirroring `inventoryConnectionService.js#assertCapability`'s
   * exact established pattern for this same `partner_employees` RBAC
   * system. 403 (AuthorizationError), not 404: unlike an in-progress
   * application (never publicly discoverable, so 404-masked), an
   * APPROVED partner's existence is already public via `/partners/:slug`
   * — only the ability to edit it is restricted here.
   */
  async #assertCanManageProfile(principal, partnerId) {
    return assertPartnerCapability(
      principal,
      partnerId,
      PARTNER_CAPABILITIES.MANAGE_COMPANY_PROFILE,
    );
  }

  /**
   * P1.2 (Master Roadmap) — starts a new self-service partner
   * application as a DRAFT. Any authenticated user may apply; no
   * special permission is required (becoming a partner applicant is
   * open by design — `partner.verify` only gates the admin REVIEW side).
   * Refuses a second in-flight application while one already exists
   * (see IN_PROGRESS_STATUSES) — a real, conservative default against
   * confusing duplicates, not a permanent restriction.
   */
  async applyToBecomePartner(principal, data) {
    if (!principal) throw new AuthenticationError();

    const existing = await this.#partnerRepository.listMembershipsForUser(
      principal.userId,
    );
    if (existing.length > 0) {
      const details = await Promise.all(
        existing.map((m) => this.#partnerRepository.findByIdAdmin(m.partnerId)),
      );
      const inProgress = details.find((d) =>
        IN_PROGRESS_STATUSES.includes(d.verificationStatusCode),
      );
      if (inProgress) {
        throw new ConflictError(
          'You already have an in-progress partner application.',
          'APPLICATION_ALREADY_IN_PROGRESS',
        );
      }
    }

    const { legalName, displayName, description, email, phone, website } = data;
    if (!displayName || !displayName.trim()) {
      throw new ValidationError('A business/display name is required.', [
        { field: 'displayName', issue: 'REQUIRED' },
      ]);
    }

    return withTransaction(async (connection) => {
      let slug = slugify(displayName);
      if (!slug) slug = `partner-${Date.now()}`;
      // Auto-suffixed on collision rather than surfaced as a validation
      // error — the onboarding form never shows a "slug" field at all
      // (unlike the Listing Wizard's explicit, user-editable slug field),
      // so there is nothing for an applicant to "fix" themselves.
      let attempt = 0;
      let candidateSlug = slug;
      // eslint-disable-next-line no-await-in-loop -- small, bounded collision-retry loop, not a hot path
      let exists = await this.#partnerRepository.slugExists(
        candidateSlug,
        connection,
      );
      while (exists) {
        attempt += 1;
        candidateSlug = `${slug}-${attempt + 1}`;
        // eslint-disable-next-line no-await-in-loop -- small, bounded collision-retry loop, not a hot path
        exists = await this.#partnerRepository.slugExists(
          candidateSlug,
          connection,
        );
      }

      // P1.3 (Master Roadmap): the onboarding form has no locale-tab
      // UI (a single "About your business" textarea), so this always
      // writes to the server's default language — same precedent as
      // `listingService.js#updateMedia`'s alt-text/caption write via
      // `resolveLocaleIds()` with no argument.
      const { defaultLocaleId } = await resolveLocaleIds(undefined, connection);
      const created = await this.#partnerRepository.createApplication(
        {
          legalName: legalName?.trim() || displayName.trim(),
          displayName: displayName.trim(),
          slug: candidateSlug,
          description: description?.trim() || null,
          languageId: defaultLocaleId,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          website: website?.trim() || null,
          ownerUserId: principal.userId,
        },
        connection,
      );

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'partner.application_created',
          targetType: 'partner',
          targetId: created.id,
          afterSnapshot: { displayName: created.displayName },
        },
        connection,
      );

      return created;
    });
  }

  /** Owner-only read of an in-progress or resolved application — full detail, including the admin's reviewNote if any. */
  async getMyApplication(principal, partnerId) {
    await this.#assertOwnsApplication(principal, partnerId);
    const application = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!application) throw new NotFoundError('Application not found.');
    return application;
  }

  /** Owner-only edit — only while the application is still theirs to change (see OWNER_EDITABLE_STATUSES). */
  async updateMyApplication(principal, partnerId, data) {
    await this.#assertOwnsApplication(principal, partnerId);
    const before = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!before) throw new NotFoundError('Application not found.');
    if (!OWNER_EDITABLE_STATUSES.includes(before.verificationStatusCode)) {
      throw new ConflictError(
        'This application can no longer be edited in its current state.',
        'APPLICATION_NOT_EDITABLE',
      );
    }

    const { legalName, displayName, description, email, phone, website } = data;
    let languageId;
    if (description !== undefined) {
      ({ defaultLocaleId: languageId } = await resolveLocaleIds());
    }
    return this.#partnerRepository.updateApplication(partnerId, {
      legalName: legalName?.trim(),
      displayName: displayName?.trim(),
      description: description?.trim(),
      languageId,
      email: email?.trim(),
      phone: phone?.trim(),
      website: website?.trim(),
    });
  }

  /**
   * Owner-only — moves a DRAFT/NEEDS_CHANGES application to PENDING
   * (awaiting admin review), clearing any prior reviewNote (a stale
   * "please fix X" from a previous round must never linger against a
   * freshly resubmitted application — see migration 0030's own comment).
   * Validates the same minimal, non-KYC contact-reachability fields
   * REQUIRED_FIELDS_TO_SUBMIT names; see that constant's comment for the
   * real, deliberate KYC extension point this does NOT implement.
   */
  async submitMyApplication(principal, partnerId) {
    await this.#assertOwnsApplication(principal, partnerId);
    const before = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!before) throw new NotFoundError('Application not found.');
    if (!OWNER_EDITABLE_STATUSES.includes(before.verificationStatusCode)) {
      throw new ConflictError(
        'This application has already been submitted.',
        'APPLICATION_NOT_EDITABLE',
      );
    }

    const missing = REQUIRED_FIELDS_TO_SUBMIT.filter((field) => !before[field]);
    if (missing.length > 0) {
      throw new ValidationError(
        'Please complete all required fields before submitting.',
        missing.map((field) => ({ field, issue: 'REQUIRED' })),
      );
    }

    const updated = await this.#partnerRepository.updateVerificationStatus(
      partnerId,
      'PENDING',
      { reviewNote: null },
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'partner.application_submitted',
      targetType: 'partner',
      targetId: partnerId,
      beforeSnapshot: { verificationStatusCode: before.verificationStatusCode },
      afterSnapshot: { verificationStatusCode: 'PENDING' },
    });

    return updated;
  }

  /**
   * P1.3 (Master Roadmap) — owner/staff read of their own company
   * profile (any status, not just APPROVED — a partner can preview
   * their own profile mid-edit regardless of moderation state).
   */
  async getMyCompanyProfile(principal, partnerId) {
    await this.#assertIsMember(principal, partnerId);
    const partner = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!partner) throw new NotFoundError('Partner not found.');
    return partner;
  }

  /**
   * P1.3 (Master Roadmap) — owner/staff edit of the public company
   * identity: name, contact info, social links, and one language's
   * description. `locale` selects which `partner_translations` row
   * `description` writes to — required by the validator whenever
   * `description` is present (`updateProfileSchema`'s own `.refine`).
   */
  async updateMyCompanyProfile(principal, partnerId, data) {
    await this.#assertCanManageProfile(principal, partnerId);
    const before = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!before) throw new NotFoundError('Partner not found.');

    const {
      displayName,
      email,
      phone,
      website,
      description,
      locale,
      socialLinks,
    } = data;

    let languageId;
    if (description !== undefined) {
      ({ localeId: languageId } = await resolveLocaleIds(locale));
    }

    const updated = await this.#partnerRepository.updateProfile(partnerId, {
      displayName: displayName?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      website: website?.trim(),
      socialLinks,
    });

    if (description !== undefined) {
      await this.#partnerRepository.upsertTranslation({
        partnerId,
        languageId,
        description: description.trim(),
      });
    }

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'partner.profile_updated',
      targetType: 'partner',
      targetId: partnerId,
      beforeSnapshot: { displayName: before.displayName },
      afterSnapshot: { displayName: updated.displayName },
    });

    return description !== undefined
      ? this.#partnerRepository.findByIdAdmin(partnerId)
      : updated;
  }

  /**
   * P1.3 (Master Roadmap) — logo/cover upload. Images only (unlike
   * listings' media, which also accepts video/documents) — a company's
   * visual identity assets, not its catalog content.
   * @param {'logo'|'cover'} kind
   * @param {Buffer} buffer
   * @param {string} mimeType
   */
  async uploadCompanyMedia(principal, partnerId, kind, buffer, mimeType) {
    await this.#assertCanManageProfile(principal, partnerId);
    const partner = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!partner) throw new NotFoundError('Partner not found.');

    if (classifyMimeType(mimeType) !== 'image') {
      throw new ValidationError(
        'Logo/cover images must be JPEG, PNG, or WebP.',
      );
    }
    if (!isWithinSizeLimit(mimeType, buffer.length)) {
      throw new ValidationError('Image exceeds the maximum allowed size.');
    }

    const extension = mimeType.split('/')[1];
    const key = `partners/${partnerId}/${kind}-${Date.now()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, buffer, {
      contentType: mimeType,
    });

    const media = await this.#partnerRepository.insertMedia({
      partnerId,
      mimeType,
      url,
      fileSizeBytes: buffer.length,
      ownerUserId: principal.userId,
    });

    const updated = await this.#partnerRepository.updateMedia(partnerId, {
      [kind === 'logo' ? 'logoMediaId' : 'coverMediaId']: media.id,
    });

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'partner.media_updated',
      targetType: 'partner',
      targetId: partnerId,
      afterSnapshot: { kind, mediaId: media.id },
    });

    return updated;
  }

  /**
   * Phase 13 (Notifications): recipient resolution for partner-level
   * notifications (approval status, a new review/favorite on one of
   * their listings) — called only from `notifications/events/
   * notificationListener.js`, never from an HTTP route, so no
   * permission check here (matches `UserService.listUserIdsByRole`'s
   * same reasoning).
   */
  async getOwnerUserId(partnerId) {
    return this.#partnerRepository.findOwnerUserId(partnerId);
  }

  async listPublicPartners({ cursor, limit } = {}) {
    return this.#partnerRepository.listPublic({ cursor, limit });
  }

  async getPublicPartnerBySlug(slug) {
    const partner = await this.#partnerRepository.findPublicBySlug(slug);
    if (!partner) {
      throw new NotFoundError('Company not found.');
    }
    return partner;
  }

  /**
   * Company Public Profile (Step A1) — all of a company's currently
   * PUBLISHED listings, across all categories. Resolves the partner via
   * the SAME public-visibility gate `getPublicPartnerBySlug` already
   * uses (`findPublicBySlug` — APPROVED, non-deleted) rather than a
   * second copy of that check, so an unknown/unapproved/deleted slug
   * 404s identically whether the caller asked for the profile or its
   * listings. A valid, public company with zero PUBLISHED listings is
   * NOT a 404 — it returns normally with an empty `rows` array, same as
   * `listFavoritedListingIds` does for a customer with none.
   * Step A4 (closure): `locale` resolves the SAME way
   * `SearchService`/`mysqlSearchRepository.resolveLocaleIds` already do
   * (via the shared `languageRepository.js#resolveLocaleIds` this file
   * already imports for an unrelated write path above) — a requested
   * locale's title when authored, the server's default language's title
   * otherwise, never the "any available" scalar-subquery fallback this
   * endpoint used before Step A4 (which ignored the visitor's locale
   * entirely).
   * @param {string} slug
   * @param {{cursor?: string|null, limit?: number, locale?: string}} [paginationOpts]
   */
  async getPublicPartnerListings(slug, { cursor, limit, locale } = {}) {
    const partner = await this.#partnerRepository.findPublicBySlug(slug);
    if (!partner) {
      throw new NotFoundError('Company not found.');
    }
    const { localeId, defaultLocaleId } = await resolveLocaleIds(locale);
    return this.#partnerRepository.listPublicListingsForPartner(partner.id, {
      cursor,
      limit,
      localeId,
      defaultLocaleId,
    });
  }

  /**
   * Phase 11 Admin Platform: `GET /partners/by-user/:userId` — no owner
   * fallback (`user.view`, checked by the route guard) since this is
   * inherently "look up someone else's memberships."
   */
  async listMembershipsForUserAdmin(userId) {
    return this.#partnerRepository.listMembershipsForUser(userId);
  }

  /**
   * Stage 11.2: `GET /partners/admin` — every partner regardless of
   * status. Either verification or moderation permission grants read
   * access to this list (a MODERATOR who can only suspend still needs
   * to see the full roster to find who to suspend).
   */
  async listPartnersAdmin(principal, filters = {}, paginationOpts = {}) {
    await this.#assertAnyPermission(principal, [
      'partner.verify',
      'partner.moderate',
    ]);
    return this.#partnerRepository.listAdmin({ ...filters, ...paginationOpts });
  }

  /** Stage 11.2: `GET /partners/admin/:id` — same either-permission read gate as the list. */
  async getPartnerAdminDetail(principal, partnerId) {
    await this.#assertAnyPermission(principal, [
      'partner.verify',
      'partner.moderate',
    ]);
    const partner = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!partner) throw new NotFoundError('Partner not found.');
    return partner;
  }

  /**
   * Stage 11.2: `PATCH /partners/admin/:id/verification-status` —
   * approve/reject a partner's onboarding, or reset to PENDING. Requires
   * `partner.verify` outright (MODERATOR, which only has
   * `partner.moderate`, cannot make verification decisions — see
   * `004_roles_and_permissions.js`'s `ROLE_PERMISSIONS`).
   *
   * @param {string} statusCode APPROVED|REJECTED|NEEDS_CHANGES
   * @param {{reviewNote?: string}} [opts] required, non-empty for
   *   NEEDS_CHANGES (the applicant needs to know what to fix); optional
   *   for REJECTED (a reason, if the admin wants to give one); ignored
   *   for APPROVED.
   */
  async updateVerificationStatus(principal, partnerId, statusCode, opts = {}) {
    if (!VERIFICATION_STATUSES.includes(statusCode)) {
      throw new ValidationError('Invalid verification status.');
    }
    await this.#assertPermission(principal, 'partner.verify');

    const before = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!before) throw new NotFoundError('Partner not found.');

    // See UNREVIEWABLE_STATUSES's own comment — this preserves the
    // pre-existing, tested free transition among PENDING/APPROVED/
    // REJECTED while protecting the two new states.
    if (UNREVIEWABLE_STATUSES.includes(before.verificationStatusCode)) {
      throw new ConflictError(
        `Cannot review an application in ${before.verificationStatusCode} state.`,
        'INVALID_APPLICATION_TRANSITION',
      );
    }
    if (
      statusCode === 'NEEDS_CHANGES' &&
      before.verificationStatusCode !== 'PENDING'
    ) {
      throw new ConflictError(
        'NEEDS_CHANGES can only be set on a submitted (PENDING) application.',
        'INVALID_APPLICATION_TRANSITION',
      );
    }

    const { reviewNote } = opts;
    if (statusCode === 'NEEDS_CHANGES' && !reviewNote?.trim()) {
      throw new ValidationError(
        'A note explaining what needs to change is required.',
        [{ field: 'reviewNote', issue: 'REQUIRED' }],
      );
    }

    const updated = await this.#partnerRepository.updateVerificationStatus(
      partnerId,
      statusCode,
      {
        // Cleared on APPROVED (nothing left to fix); set on
        // NEEDS_CHANGES/REJECTED when the admin supplied one; left
        // untouched (undefined) only never happens here — every branch
        // has an explicit value, so a stale note can never silently
        // survive a new decision.
        reviewNote:
          statusCode === 'APPROVED' ? null : (reviewNote?.trim() ?? null),
        alsoApproveModerationStatus: statusCode === 'APPROVED',
      },
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'partner.verification_status_changed',
      targetType: 'partner',
      targetId: partnerId,
      beforeSnapshot: { verificationStatusCode: before.verificationStatusCode },
      afterSnapshot: {
        verificationStatusCode: statusCode,
        reviewNote: reviewNote ?? null,
      },
    });

    const eventTypeByStatus = {
      APPROVED: EVENT_TYPES.PARTNER_APPROVED,
      REJECTED: EVENT_TYPES.PARTNER_REJECTED,
      NEEDS_CHANGES: EVENT_TYPES.PARTNER_NEEDS_CHANGES,
    };
    await this.#eventBus.publish(
      createDomainEvent({
        eventType: eventTypeByStatus[statusCode],
        actorId: principal.userId,
        resourceType: 'partner',
        resourceId: partnerId,
        payload: {
          partnerId,
          partnerName: updated.displayName,
          reviewNote: updated.reviewNote,
        },
      }),
    );

    return updated;
  }

  /**
   * Stage 11.2: `PATCH /partners/admin/:id/moderation-status` —
   * suspend (FLAGGED) or restore (APPROVED) an already-verified
   * partner's public visibility. Requires `partner.moderate`.
   */
  async updateModerationStatus(principal, partnerId, statusCode) {
    if (!MODERATION_STATUSES.includes(statusCode)) {
      throw new ValidationError('Invalid moderation status.');
    }
    await this.#assertPermission(principal, 'partner.moderate');

    const before = await this.#partnerRepository.findByIdAdmin(partnerId);
    if (!before) throw new NotFoundError('Partner not found.');

    const updated = await this.#partnerRepository.updateModerationStatus(
      partnerId,
      statusCode,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'partner.moderation_status_changed',
      targetType: 'partner',
      targetId: partnerId,
      beforeSnapshot: { moderationStatusCode: before.moderationStatusCode },
      afterSnapshot: { moderationStatusCode: statusCode },
    });

    return updated;
  }
}

export default PartnerService;

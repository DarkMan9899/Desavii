/**
 * ListingService — public Service for the Listings module.
 *
 * Implements BACKEND_ARCHITECTURE.md §6/§13 and the Listings Module
 * Catalog entry (#7): owns all `listings`-table business logic, including
 * the "Owner or `{permission}`" authorization pattern (API_SPECIFICATION.md
 * §5/§38) and publish-readiness gating.
 *
 * Ownership ("Host") is Sprint 6's `isPartnerOwner` check against the
 * listing's `partner_id`, reused unmodified from
 * `infrastructure/database/repositories/partnerEmployeeRepository.js` — the
 * same file `requireHost` is built on. This mirrors `UserService`'s
 * `#assertOwnerOrPermission` pattern exactly, except ownership is
 * partner-based rather than a direct user-id match.
 *
 * Known, documented scope limits for this sprint (see the Sprint 7 plan):
 * - No `capacity`/`base_price` fields — deferred to future per-type modules.
 * - Publish-readiness does not check `bookable_unit` existence — the
 *   Availability module doesn't exist yet.
 * - `partner_id` is supplied explicitly by the caller and authorized via
 *   `isPartnerOwner`, since no Partners module exists yet to resolve "the
 *   caller's partner" from the token alone.
 */

import { randomUUID } from 'node:crypto';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ValidationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { isManagerAssignedToPartner } from '../../../infrastructure/database/repositories/managerAssignmentRepository.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { resolveLocaleIds } from '../../../infrastructure/database/repositories/languageRepository.js';
import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { slugify } from '../../../core/domain/slugify.js';
import { isValidListingStatusTransition } from '../../../core/domain/listingStatusTransitions.js';
import { resolveModerationDecision } from '../../../core/domain/listingModerationDecisions.js';
import { deriveListingTypeCodeFromCategorySlug } from '../../../core/domain/categoryListingTypeMapping.js';
import {
  isValidPublicationPeriodDays,
  isFrozen,
  isPubliclyVisible,
  hasLifecycleExpired,
} from '../../../core/domain/listingLifecycle.js';
import { createNoOpEventBus } from '../../../core/events/domainEventBus.js';
import { createDomainEvent } from '../../../core/events/createDomainEvent.js';
import { EVENT_TYPES } from '../../../core/events/eventTypes.js';
import {
  isAllowedMimeType,
  isWithinSizeLimit,
  classifyMimeType,
} from '../../media/validators/mediaConstraints.js';
import { validateAndProcessImage } from '../../media/validators/imageContentValidator.js';

// Phase 20 (SEO): `GET /listings/:id` dispatches a purely-numeric path
// segment to the id lookup, everything else to the slug lookup — a slug
// that happened to come out all-digits (a short title like "42", or an
// unlucky `randomUUID().slice(0, 8)` hex fallback landing on digits only)
// would be unreachable by its own slug URL. Never let a generated slug be
// purely numeric; a real one always has at least one letter.
function ensureNonNumericSlug(slug) {
  return /^\d+$/.test(slug) ? `listing-${slug}` : slug;
}

// Sprint F (Manager Workspace): the permission keys a company-assigned
// Manager may act on without holding the matching GLOBAL permission —
// deliberately excludes `listing.delete` (destructive, stays owner/admin-
// only) and `listing.moderate` (Stage 11.3's own `#assertPermission`
// already has no owner fallback at all, so Manager is naturally excluded
// there too). Covers create/update/publish/unpublish/archive plus every
// media/highlights/itinerary/FAQ/completeness method below, since they
// all gate on 'listing.update'.
const MANAGER_ALLOWED_PERMISSION_KEYS = new Set([
  'listing.create',
  'listing.update',
  'listing.publish',
]);

const ENUM_ATTRIBUTE_DATA_TYPES = ['ENUM', 'MULTI_ENUM'];
// Step L4 (brief §9) — `validationMin`/`validationMax`/integer-ness only
// ever apply to a genuinely numeric attribute; BOOLEAN/STRING/DATE never
// carried a meaningful range in the first place (see the fix below for
// why this used to matter).
const NUMERIC_ATTRIBUTE_DATA_TYPES = ['INTEGER', 'DECIMAL'];
// Stage 11.3 (Admin Platform — Listing Moderation): this schema's shared
// `moderation_statuses` lookup — same 4 values `partnerService.js` uses
// for verification, applied here to the previously-dormant
// `listings.moderation_status_id`/`listing.moderate` permission.
const LISTING_MODERATION_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'FLAGGED',
];

export class ListingService {
  #listingRepository;

  #listingMetadataRepository;

  #storageProvider;

  #auditLogger;

  #permissionResolver;

  /**
   * No-op until wired — `routes/v1.js` calls `setBookableUnitChecker` once
   * both this container and Availability's exist, since `AvailabilityService`
   * already depends on `ListingService` and the reverse import would be
   * circular (BACKEND_ARCHITECTURE.md §4). Defaulting to "true" means a
   * test/environment that never wires it simply skips this one publish
   * check rather than failing every publish.
   */
  #hasBookableUnit = async () => true;

  #eventBus;

  constructor({
    listingRepository,
    listingMetadataRepository,
    storageProvider,
    auditLogger,
    permissionResolver,
    eventBus = createNoOpEventBus(),
  }) {
    this.#listingRepository = listingRepository;
    this.#listingMetadataRepository = listingMetadataRepository;
    this.#storageProvider = storageProvider;
    this.#auditLogger = auditLogger;
    this.#permissionResolver = permissionResolver;
    this.#eventBus = eventBus;
  }

  setBookableUnitChecker(hasBookableUnit) {
    this.#hasBookableUnit = hasBookableUnit;
  }

  async #isOwnerOrHasPermission(principal, partnerId, permissionKey) {
    if (!principal) return false;
    const isOwner = await isPartnerOwner(principal.userId, partnerId);
    if (isOwner) return true;
    // Sprint F: a Manager assigned to this specific company may act on it
    // exactly as its owner could, but only for the allow-listed keys above
    // — never a blanket bypass, and never for a company they aren't
    // assigned to (checked fresh, per request, against `manager_companies`,
    // never trusted from the JWT).
    if (
      MANAGER_ALLOWED_PERMISSION_KEYS.has(permissionKey) &&
      principal.roles.includes('MANAGER')
    ) {
      const isAssignedManager = await isManagerAssignedToPartner(
        principal.userId,
        partnerId,
      );
      if (isAssignedManager) return true;
    }
    return this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
  }

  /** "Owner or `{permissionKey}`" (API_SPECIFICATION.md §5/§38). */
  async #assertOwnerOrPermission(principal, partnerId, permissionKey) {
    if (!principal) throw new AuthenticationError();
    const allowed = await this.#isOwnerOrHasPermission(
      principal,
      partnerId,
      permissionKey,
    );
    if (!allowed) throw new AuthorizationError();
  }

  /** No owner fallback — Stage 11.3's admin moderation methods are inherently "act on someone else's listing." */
  async #assertPermission(principal, permissionKey) {
    if (!principal) throw new AuthenticationError();
    const granted = await this.#permissionResolver.hasPermission(
      principal.roles,
      permissionKey,
    );
    if (!granted) throw new AuthorizationError();
  }

  async #assertUniqueSlug(slug, excludeId = null) {
    const exists = await this.#listingRepository.slugExists(slug, {
      excludeId,
    });
    if (exists) {
      throw new ConflictError(
        'This slug is already in use.',
        'SLUG_ALREADY_EXISTS',
      );
    }
  }

  /**
   * Resolves + validates the wizard's `attributeValues` (keyed by `code`)
   * against the category's Generic Attribute Engine metadata: unknown
   * codes, unknown option codes, and out-of-range numeric values are all
   * rejected here — data-type/range validation can't be static Zod since
   * the set of valid attribute codes is data, not a fixed enum (same
   * reasoning `SearchService.#resolveAttributeFilters` already documents
   * for the read side). Returns the shape `MySqlListingRepository.
   * replaceAttributeValues` expects, or `undefined` if nothing was
   * submitted.
   */
  async #resolveAttributeValues(categoryId, attributeValues) {
    if (!attributeValues || attributeValues.length === 0) return undefined;
    if (!categoryId) {
      throw new ValidationError(
        'Attribute values require a category to validate against.',
        [{ field: 'attributeValues', issue: 'CATEGORY_REQUIRED' }],
      );
    }

    const definitionsByCode =
      await this.#listingMetadataRepository.getAttributeDefinitionsByCode(
        attributeValues.map((entry) => entry.code),
      );

    const resolved = [];
    // eslint-disable-next-line no-restricted-syntax -- sequential by design, each ENUM entry needs its own option-code lookup
    for (const entry of attributeValues) {
      const definition = definitionsByCode.get(entry.code);
      if (!definition) {
        throw new ValidationError(`Unknown attribute code "${entry.code}".`, [
          { field: 'attributeValues', issue: 'UNKNOWN_ATTRIBUTE_CODE' },
        ]);
      }

      if (ENUM_ATTRIBUTE_DATA_TYPES.includes(definition.dataTypeCode)) {
        const optionCodes = entry.optionCodes ?? [];
        const optionIdsByCodePromise =
          this.#listingMetadataRepository.getAttributeOptionIdsByCode(
            definition.id,
            optionCodes,
          );
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const optionIdsByCode = await optionIdsByCodePromise;
        const optionIds = optionCodes.map((code) => {
          const optionId = optionIdsByCode.get(code);
          if (!optionId) {
            throw new ValidationError(
              `Unknown option "${code}" for attribute "${entry.code}".`,
              [{ field: 'attributeValues', issue: 'UNKNOWN_OPTION_CODE' }],
            );
          }
          return optionId;
        });
        resolved.push({
          attributeDefinitionId: definition.id,
          dataTypeCode: definition.dataTypeCode,
          optionIds,
        });
      } else if (
        NUMERIC_ATTRIBUTE_DATA_TYPES.includes(definition.dataTypeCode)
      ) {
        // Step L4 (brief §9, §12) — three real bugs fixed here:
        // 1. `Number.isFinite` (catches NaN AND +/-Infinity) now gates
        //    the range checks — previously a non-numeric `entry.value`
        //    (e.g. a malformed string) coerced to `NaN`, and `NaN <
        //    min`/`NaN > max` are BOTH `false` in JS, so an invalid
        //    value silently passed the "validation" that was supposed
        //    to reject it.
        // 2. An INTEGER-typed attribute (`seats`, `total_rooms`,
        //    `doors`, ...) now explicitly rejects a fractional value
        //    instead of silently letting MySQL round it on insert into
        //    the `INT` column.
        // 3. The *coerced* `numericValue` is what gets stored below, not
        //    the original `entry.value` — previously the raw,
        //    unvalidated client value was pushed even after the numeric
        //    checks above had run.
        const numericValue = Number(entry.value);
        if (!Number.isFinite(numericValue)) {
          throw new ValidationError(
            `"${entry.code}" must be a valid, finite number.`,
            [{ field: 'attributeValues', issue: 'INVALID_NUMBER' }],
          );
        }
        if (
          definition.dataTypeCode === 'INTEGER' &&
          !Number.isInteger(numericValue)
        ) {
          throw new ValidationError(`"${entry.code}" must be a whole number.`, [
            { field: 'attributeValues', issue: 'MUST_BE_INTEGER' },
          ]);
        }
        if (
          definition.validationMin !== null &&
          numericValue < definition.validationMin
        ) {
          throw new ValidationError(
            `"${entry.code}" must be at least ${definition.validationMin}.`,
            [{ field: 'attributeValues', issue: 'BELOW_MINIMUM' }],
          );
        }
        if (
          definition.validationMax !== null &&
          numericValue > definition.validationMax
        ) {
          throw new ValidationError(
            `"${entry.code}" must be at most ${definition.validationMax}.`,
            [{ field: 'attributeValues', issue: 'ABOVE_MAXIMUM' }],
          );
        }
        resolved.push({
          attributeDefinitionId: definition.id,
          dataTypeCode: definition.dataTypeCode,
          value: numericValue,
        });
      } else {
        const isBoolean = definition.dataTypeCode === 'BOOLEAN';
        resolved.push({
          attributeDefinitionId: definition.id,
          dataTypeCode: definition.dataTypeCode,
          value: isBoolean ? Number(Boolean(entry.value)) : entry.value,
        });
      }
    }
    return resolved;
  }

  /**
   * Same rationale as `#resolveAttributeValues`, for `category_policies`/
   * `policy_definitions`/`policy_options` (migration 0015). ENUM policy
   * values are stored as the option's own code string (not an id) in
   * `listing_policy_values` — validated here against real option codes,
   * then written as-is.
   */
  async #resolvePolicyValues(categoryId, policyValues) {
    if (!policyValues || policyValues.length === 0) return undefined;
    if (!categoryId) {
      throw new ValidationError(
        'Policy values require a category to validate against.',
        [{ field: 'policyValues', issue: 'CATEGORY_REQUIRED' }],
      );
    }

    const definitionsByCode =
      await this.#listingMetadataRepository.getPolicyDefinitionsByCode(
        policyValues.map((entry) => entry.code),
      );

    const resolved = [];
    // eslint-disable-next-line no-restricted-syntax -- sequential by design, ENUM entries need their own option-code lookup
    for (const entry of policyValues) {
      const definition = definitionsByCode.get(entry.code);
      if (!definition) {
        throw new ValidationError(`Unknown policy code "${entry.code}".`, [
          { field: 'policyValues', issue: 'UNKNOWN_POLICY_CODE' },
        ]);
      }

      if (ENUM_ATTRIBUTE_DATA_TYPES.includes(definition.dataTypeCode)) {
        const optionIdsByCodePromise =
          this.#listingMetadataRepository.getPolicyOptionIdsByCode(
            definition.id,
            [entry.value],
          );
        // eslint-disable-next-line no-await-in-loop -- sequential by design
        const optionIdsByCode = await optionIdsByCodePromise;
        if (!optionIdsByCode.has(entry.value)) {
          throw new ValidationError(
            `Unknown option "${entry.value}" for policy "${entry.code}".`,
            [{ field: 'policyValues', issue: 'UNKNOWN_OPTION_CODE' }],
          );
        }
      }

      resolved.push({ policyDefinitionId: definition.id, value: entry.value });
    }
    return resolved;
  }

  async #resolvePricing(categoryId, pricing) {
    if (!pricing) return undefined;
    if (!categoryId) {
      throw new ValidationError(
        'Pricing requires a category to validate against.',
        [{ field: 'pricing', issue: 'CATEGORY_REQUIRED' }],
      );
    }

    const pricingModelId =
      await this.#listingMetadataRepository.getPricingModelIdByCode(
        pricing.modelCode,
      );
    if (!pricingModelId) {
      throw new ValidationError(
        `Unknown pricing model "${pricing.modelCode}".`,
        [{ field: 'pricing', issue: 'UNKNOWN_PRICING_MODEL' }],
      );
    }

    const currency = await findCurrencyByCode(pricing.currencyCode);
    if (!currency) {
      throw new ValidationError(`Unknown currency "${pricing.currencyCode}".`, [
        { field: 'pricing', issue: 'UNKNOWN_CURRENCY' },
      ]);
    }

    return { pricingModelId, amount: pricing.amount, currencyId: currency.id };
  }

  async createListing(principal, input) {
    if (!principal) throw new AuthenticationError();

    const { exists, verificationStatusCode } =
      await this.#listingRepository.getPartnerVerification(input.partnerId);
    if (!exists) {
      throw new ValidationError(
        'This request references a record that does not exist.',
        [{ field: 'partnerId', issue: 'NOT_FOUND' }],
      );
    }
    if (verificationStatusCode !== 'APPROVED') {
      throw new AuthorizationError(
        'This partner is not verified and cannot create listings yet.',
        'PARTNER_NOT_VERIFIED',
      );
    }

    await this.#assertOwnerOrPermission(
      principal,
      input.partnerId,
      'listing.create',
    );

    // Step L1: the category the Partner already picked is the sole
    // authority on listing type whenever it resolves to one of the
    // closed mappings (`core/domain/categoryListingTypeMapping.js`) — a
    // client-supplied `listingType` is never trusted merely because it
    // was sent; it's used only as a fallback for callers (internal
    // tooling, fixtures, tests) that don't supply a mapped category at
    // all. This is what makes `categoryIds: [restaurantsId],
    // listingType: 'HOTEL'` impossible to persist as a contradiction:
    // the derived RESTAURANT code always wins over the client's HOTEL
    // claim once a category is present.
    const primaryCategoryId = input.categoryIds?.[0];
    const primaryCategorySlug = primaryCategoryId
      ? await this.#listingRepository.findCategorySlugById(primaryCategoryId)
      : null;
    const derivedListingTypeCode =
      deriveListingTypeCodeFromCategorySlug(primaryCategorySlug);
    const canonicalListingTypeCode =
      derivedListingTypeCode ?? input.listingType;
    if (!canonicalListingTypeCode) {
      throw new ValidationError(
        'A category or an explicit listing type is required.',
        [{ field: 'listingType', issue: 'UNKNOWN_LISTING_TYPE' }],
      );
    }
    const listingTypeId = await this.#listingRepository.findListingTypeIdByCode(
      canonicalListingTypeCode,
    );
    if (!listingTypeId) {
      throw new ValidationError('Unknown listing type.', [
        { field: 'listingType', issue: 'UNKNOWN_LISTING_TYPE' },
      ]);
    }

    const primaryTitle = input.translations[0].title;
    // A title written entirely in a non-Latin script (Armenian, Russian,
    // etc.) has no ASCII characters for slugify() to keep, so the derived
    // slug comes back empty — that must not block listing creation for
    // those locales. An explicitly provided `input.slug` is a deliberate
    // partner choice, though, so an invalid one is still a real input error.
    let slug = slugify(input.slug ?? primaryTitle);
    if (!slug && input.slug !== undefined) {
      throw new ValidationError(
        'A valid slug could not be derived from the provided title.',
        [{ field: 'slug', issue: 'INVALID' }],
      );
    }
    if (!slug) {
      slug = randomUUID().slice(0, 8);
    }
    slug = ensureNonNumericSlug(slug);
    await this.#assertUniqueSlug(slug);

    // Resolved/validated BEFORE the transaction starts — a bad attribute/
    // policy/pricing code should never leave a half-inserted listing.
    const [
      draftStatusId,
      pendingModerationId,
      resolvedAttributeValues,
      resolvedPolicyValues,
      resolvedPricing,
    ] = await Promise.all([
      this.#listingRepository.findStatusIdByCode('DRAFT'),
      this.#listingRepository.findModerationStatusIdByCode('PENDING'),
      this.#resolveAttributeValues(primaryCategoryId, input.attributeValues),
      this.#resolvePolicyValues(primaryCategoryId, input.policyValues),
      this.#resolvePricing(primaryCategoryId, input.pricing),
    ]);

    const listingId = await withTransaction(async (connection) => {
      const newListingId = await this.#listingRepository.insertListing(
        {
          partnerId: input.partnerId,
          listingTypeId,
          slug,
          statusId: draftStatusId,
          moderationStatusId: pendingModerationId,
          isContactVisible: input.isContactVisible,
          createdBy: principal.userId,
        },
        connection,
      );

      // eslint-disable-next-line no-restricted-syntax -- translations must be inserted in order, sequentially
      for (const translation of input.translations) {
        // eslint-disable-next-line no-await-in-loop -- sequential by design, same connection/transaction
        await this.#listingRepository.insertTranslation(
          { listingId: newListingId, ...translation },
          connection,
        );
      }

      if (input.location) {
        await this.#listingRepository.upsertLocation(
          { listingId: newListingId, ...input.location },
          connection,
        );
      }
      if (input.categoryIds) {
        await this.#listingRepository.replaceCategoryLinks(
          newListingId,
          input.categoryIds,
          connection,
        );
      }
      if (input.amenityIds) {
        await this.#listingRepository.replaceAmenityLinks(
          newListingId,
          input.amenityIds,
          connection,
        );
      }
      if (resolvedAttributeValues) {
        await this.#listingRepository.replaceAttributeValues(
          newListingId,
          resolvedAttributeValues,
          connection,
        );
      }
      if (resolvedPolicyValues) {
        await this.#listingRepository.replacePolicyValues(
          newListingId,
          resolvedPolicyValues,
          connection,
        );
      }
      if (resolvedPricing) {
        await this.#listingRepository.upsertPricing(
          newListingId,
          resolvedPricing,
          connection,
        );
      }
      if (input.bookingRules) {
        await this.#listingRepository.upsertBookingRules(
          newListingId,
          input.bookingRules,
          connection,
        );
      }

      return newListingId;
    });

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.created',
      targetType: 'listing',
      targetId: listingId,
      afterSnapshot: { partnerId: input.partnerId, slug },
    });

    return this.#listingRepository.findById(listingId);
  }

  async getListing(principal, idOrSlug) {
    // Phase 20 (SEO): the public route accepts either the numeric id or
    // the listing's slug (see `listingIdOrSlugParamsSchema`) — a purely
    // numeric string is still looked up by id (never guessed as a slug,
    // since slugs are never purely digits — `slugify()` always retains
    // at least one letter or falls back to a non-numeric default).
    const isNumericId = /^\d+$/.test(String(idOrSlug));
    const listing = isNumericId
      ? await this.#listingRepository.findById(Number(idOrSlug))
      : await this.#listingRepository.findBySlug(String(idOrSlug));
    if (!listing) throw new NotFoundError('Listing not found.');
    // Step B4: an expired/frozen listing is masked from the public exactly
    // like a DRAFT/UNPUBLISHED one — same 404-never-leaks-existence rule,
    // just a second reason a row can fail the public-visibility check.
    // Never relies on the hourly sweep having already flipped `status_id`
    // (`isPubliclyVisible` re-derives "already expired" straight from
    // `expires_at`), so this never has the up-to-an-hour stale-visibility
    // gap a `statusCode === 'PUBLISHED'`-only check would have.
    // Step B6.5: `now` is sourced from the DB, not a JS clock read — see
    // `isPubliclyVisible`'s own doc comment.
    const now = await this.#listingRepository.findDbNow();
    if (isPubliclyVisible(listing, now)) return listing;

    const allowed = await this.#isOwnerOrHasPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
    if (!allowed) throw new NotFoundError('Listing not found.');
    return listing;
  }

  /**
   * Step M4.1 — whether `principal` may access `listing` through the
   * private management path: the exact same "Owner or `listing.update`"
   * rule `getListing`'s own non-public branch already applies (same
   * `#isOwnerOrHasPermission` call, same permission key), just exposed as
   * its own read so a caller that already has a resolved `listing` can
   * ask "is it safe to also show this principal the private moderation
   * reason" without duplicating that authorization rule or re-deriving
   * public-visibility from scratch. Never used to gate an action — only
   * to decide response shape (`listingController.get`) — so it takes an
   * already-resolved `listing`, not an id/slug, and never throws.
   */
  async canManageListing(principal, listing) {
    return this.#isOwnerOrHasPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
  }

  /**
   * Booking-eligibility guard (Listing Lifetime / Renewal, Step B4) —
   * deliberately narrower than `getListing`'s visibility masking: this
   * only rejects a listing whose publication period has already expired
   * (frozen by the sweep, or past `expires_at` even if the sweep hasn't
   * run yet — same DB-time, not-scheduler-time rule `isPubliclyVisible`
   * uses). It never re-checks DRAFT/UNPUBLISHED/moderation status — those
   * are `getListing`'s existing, unrelated concern, and every caller of
   * this method already reached the listing through an authorized path
   * (a hold/booking can only be created against a resolvable
   * `bookableUnitId`/`listingId`). Never takes a `principal` — booking
   * eligibility applies uniformly, with no owner/admin exception: nobody
   * can create a NEW booking against an expired listing, including its
   * own partner.
   */
  async assertBookable(listingId) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    // Step B6.5: `now` is sourced from the DB, not a JS clock read — see
    // `hasLifecycleExpired`'s own doc comment.
    const now = await this.#listingRepository.findDbNow();
    if (hasLifecycleExpired(listing, now)) {
      throw new ConflictError(
        'This listing is no longer accepting new bookings.',
        'LISTING_NOT_BOOKABLE',
      );
    }
    return listing;
  }

  /**
   * Step A5 (Partner Analytics Read API) — an internal, principal-free
   * ownership lookup. Deliberately NOT `getListing`: that method's own
   * non-public fallback (`#isOwnerOrHasPermission` against the global
   * `listing.update` permission) only recognizes the TRUE partner owner
   * or a global-RBAC grant, never a `partner_employees` non-owner role
   * (MANAGER/EDITOR/BOOKING_MANAGER/ANALYTICS_VIEWER) — so it would
   * incorrectly 404 an ANALYTICS_VIEWER who the analytics module has
   * already authorized via its own capability check. The caller here
   * (`PartnerAnalyticsService`) always calls
   * `assertIsPartnerMember`/`assertPartnerCapability` against `partnerId`
   * BEFORE this — this method only answers "does this listing genuinely
   * belong to that already-authorized partner, and is it not
   * soft-deleted" (`findById`'s own default `includeTrashed: false`
   * scope) — frozen/unpublished listings ARE included, since a partner's
   * own analytics must remain available for those (brief §22).
   */
  async getListingForAnalytics(partnerId, listingId) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing || listing.partnerId !== partnerId) return null;
    return listing;
  }

  /**
   * The scheduled listing-expiration sweep's entry point (Listing Lifetime
   * / Renewal, Step B4, extended by Step B6 with a reminder phase) —
   * called only by `modules/listings/jobs/listingExpirySweep.js`, never by
   * an HTTP route. Convenience/STORED-state sync only: the public-
   * visibility queries elsewhere (Search, Category, Company profile,
   * Favorites, TOP hydration — see `listingVisibilitySql.js`) never rely
   * on this having already run, they independently re-derive "already
   * expired" straight from `expires_at`. An hourly cadence here only
   * needs to keep the STORED `status_id`/Admin-visible state, and outbound
   * reminders, reasonably fresh between runs — exactly mirroring
   * `AdvertisementService#runLifecycleSweep`'s own "convenience sync,
   * never the sole authority on public visibility" precedent, including
   * that method's own choice to combine multiple sweep phases into one
   * scheduled entry point rather than registering a second BullMQ worker
   * that would otherwise scan this exact same `listings` table on the
   * exact same hourly cadence for no real benefit (Step B6 brief §10).
   *
   * The repository's own guarded UPDATE (`freezeExpiredListings`) does the
   * freeze work and is what makes that half naturally idempotent/race-safe
   * — see its own doc comment. The reminder phase is a two-step read-then-
   * claim (`listDueForReminder` finds candidates, `claimExpiryReminder`
   * atomically claims one at a time) — see `claimExpiryReminder`'s own doc
   * comment for exactly why this is safer than `AdvertisementRepository
   * .markReminderSent`'s un-guarded precedent, and why claiming always
   * happens BEFORE this method publishes that row's event, never after.
   * @returns {Promise<{frozen: number, remindersSent: number}>}
   */
  async runExpirySweep() {
    const [publishedStatusId, unpublishedStatusId] = await Promise.all([
      this.#listingRepository.findStatusIdByCode('PUBLISHED'),
      this.#listingRepository.findStatusIdByCode('UNPUBLISHED'),
    ]);
    const frozen = await this.#listingRepository.freezeExpiredListings({
      publishedStatusId,
      unpublishedStatusId,
    });

    const { defaultLocaleId } = await resolveLocaleIds(undefined);
    const dueForReminder = await this.#listingRepository.listDueForReminder({
      publishedStatusId,
      defaultLanguageId: defaultLocaleId,
    });
    const claimedResults = await Promise.all(
      dueForReminder.map(async (listing) => {
        const claimed = await this.#listingRepository.claimExpiryReminder({
          id: listing.id,
          publishedStatusId,
        });
        if (claimed === 0) return false;
        await this.#eventBus.publish(
          createDomainEvent({
            eventType: EVENT_TYPES.LISTING_EXPIRING_SOON,
            resourceType: 'listing',
            resourceId: listing.id,
            payload: {
              listingId: listing.id,
              partnerId: listing.partnerId,
              listingTitle: listing.title,
              slug: listing.slug,
              expiresAt: listing.expiresAt,
            },
          }),
        );
        return true;
      }),
    );
    const remindersSent = claimedResults.filter(Boolean).length;

    return { frozen, remindersSent };
  }

  /**
   * Listing Lifetime / Renewal, Step B7 — the retention-purge sweep's
   * entry point (`modules/listings/jobs/listingRetentionPurgeSweep.js`),
   * a deliberately SEPARATE job/queue from `runExpirySweep` above: unlike
   * B6's reminder phase (folded into the hourly sweep because it shared
   * that exact cadence and scan), purge runs on its own daily cadence, a
   * genuinely different frequency for a genuinely different concern
   * (freezing a listing is an hourly-relevant convenience sync; purging
   * it happens, at most, once every six months per listing, so daily is
   * already generous).
   *
   * Final marketplace retirement only, via the repository's guarded
   * `purgeRetiredListings` — the exact same canonical soft-delete
   * (`deleted_at`, via `softDeleteAssignment()`) `ListingService
   * #deleteListing` uses for a partner-initiated delete, reused rather
   * than a second incompatible deletion model. Never calls
   * `#deleteListing` itself: that method requires a `principal` and
   * performs an owner/permission check neither applies nor makes sense
   * for a system-initiated sweep with no human actor (brief §4).
   *
   * No dependent row (bookings, payments, reviews, favorites,
   * promotions, translations, media, pricing, policy/attribute values)
   * is ever touched — the purge is scoped to the `listings` row alone,
   * per brief §8/§9; every one of those stays exactly as it was, and the
   * listing row itself remains physically present for historical/
   * referential integrity (never `DELETE FROM listings`).
   * @returns {Promise<{purged: number}>}
   */
  async runRetentionPurgeSweep() {
    const unpublishedStatusId =
      await this.#listingRepository.findStatusIdByCode('UNPUBLISHED');
    const purged = await this.#listingRepository.purgeRetiredListings({
      unpublishedStatusId,
    });
    return { purged };
  }

  /**
   * Listing Lifetime / Renewal, Step B5 — the explicit, auditable Renew
   * action (`POST /listings/:id/renew`). Deliberately its own domain
   * method, never a side effect of ordinary Publish/PATCH (brief §10):
   * exactly one of two guarded UPDATEs applies, chosen from the listing's
   * OWN current state, never from client input:
   *
   * - ACTIVE (still PUBLISHED, not frozen, `expires_at` still in the
   *   future): `extendActivePublication` — new expiry = OLD expiry +
   *   period. Content is already live and already passed readiness at
   *   some point; renewal changes no content, so no readiness re-check
   *   applies here (brief §7's own "does not need to republish").
   * - FROZEN, OR PUBLISHED-but-already-past-`expires_at`-and-not-yet-swept
   *   (`hasLifecycleExpired` — the same predicate `isPubliclyVisible`/
   *   `assertBookable` already use, so this method's own idea of "expired"
   *   can never quietly drift from every other B4 lifecycle check):
   *   `reactivateExpiredPublication` — new expiry = NOW() + period. A
   *   frozen listing may have gone stale while dormant, so this path DOES
   *   re-run `#checkPublishReadiness` (reused verbatim, never a second
   *   implementation — brief §7) before the guarded UPDATE runs; a
   *   readiness failure throws before anything is written, so the listing
   *   stays exactly as frozen as it was (no partial reactivation).
   * - Anything else (DRAFT, PENDING_REVIEW, ARCHIVED, a manually-
   *   UNPUBLISHED-but-not-frozen listing, or a legacy listing with no
   *   `expires_at` ever assigned) is not renewable at all — Renew is
   *   never a shortcut around ordinary Publish semantics for those states.
   *
   * Both guarded UPDATEs independently re-validate their own precondition
   * at write time (never trusting this method's own earlier read), so a
   * listing that the expiry sweep concurrently freezes, or a genuinely
   * duplicate/double-clicked request, safely resolves to
   * `RENEWAL_STATE_CHANGED` rather than any partial or double-extended
   * state — see either repository method's own doc comment for the exact
   * idempotency mechanism (a `renewed_at` debounce guard, since no new
   * migration/idempotency-key column exists for this).
   *
   * `moderation_status_id` is never touched by either path (brief §8) —
   * neither guarded UPDATE's SET clause mentions it.
   */
  async renewListing(principal, id, { publicationPeriodDays }) {
    if (!isValidPublicationPeriodDays(publicationPeriodDays)) {
      throw new ValidationError('This publication period is not valid.', [
        {
          field: 'publicationPeriodDays',
          issue:
            publicationPeriodDays == null
              ? 'PUBLICATION_PERIOD_REQUIRED'
              : 'INVALID_PUBLICATION_PERIOD',
        },
      ]);
    }

    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    // B1's recommendation, reused unmodified — the same permission
    // `publishListing`/`unpublishListing`/`archiveListing` already gate
    // on, so Renew's authorized audience (owner, assigned Manager,
    // `listing.publish` holders) is identical to Publish's, with no
    // separate `listing.renew` permission invented.
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.publish',
    );

    const publishedStatusId =
      await this.#listingRepository.findStatusIdByCode('PUBLISHED');
    // Step B6.5: `now` is sourced from the DB, not a JS clock read — see
    // `hasLifecycleExpired`'s own doc comment. This is what makes the
    // branch chosen here always agree with `extendActivePublication`/
    // `reactivateExpiredPublication`'s own SQL-side `UTC_TIMESTAMP(3)`
    // guards, and with `isPubliclyVisible`'s public-detail gate.
    const now = await this.#listingRepository.findDbNow();

    const isStillActive =
      listing.statusCode === 'PUBLISHED' &&
      listing.frozenAt == null &&
      listing.expiresAt != null &&
      !hasLifecycleExpired(listing, now);
    const isExpiredEligible =
      isFrozen(listing) ||
      (listing.statusCode === 'PUBLISHED' &&
        listing.frozenAt == null &&
        listing.expiresAt != null &&
        hasLifecycleExpired(listing, now));

    let affectedRows;
    if (isStillActive) {
      affectedRows = await this.#listingRepository.extendActivePublication({
        id,
        publishedStatusId,
        publicationPeriodDays,
        updatedBy: principal.userId,
      });
    } else if (isExpiredEligible) {
      await this.#checkPublishReadiness(listing);
      affectedRows = await this.#listingRepository.reactivateExpiredPublication(
        {
          id,
          publishedStatusId,
          publicationPeriodDays,
          updatedBy: principal.userId,
        },
      );
    } else {
      throw new ConflictError(
        `A listing in status "${listing.statusCode}" cannot be renewed.`,
        'LISTING_NOT_RENEWABLE',
      );
    }

    if (affectedRows === 0) {
      throw new ConflictError(
        "This listing's lifecycle state changed before the renewal could be applied — please try again.",
        'RENEWAL_STATE_CHANGED',
      );
    }

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.renewed',
      targetType: 'listing',
      targetId: id,
      afterSnapshot: { publicationPeriodDays },
    });

    return this.#listingRepository.findById(id);
  }

  async listListings(principal, filters = {}, paginationOpts = {}) {
    const { partnerId, listingType, status } = filters;
    const effectiveFilters = { partnerId, listingTypeCode: listingType };

    const wantsOwnerView =
      partnerId !== undefined &&
      (await this.#isOwnerOrHasPermission(
        principal,
        partnerId,
        'listing.update',
      ));

    if (wantsOwnerView) {
      if (status) effectiveFilters.statusCode = status;
    } else {
      effectiveFilters.onlyPublished = true;
    }

    return this.#listingRepository.list(effectiveFilters, paginationOpts);
  }

  /**
   * Stage 11.3 (Admin Platform — Listing Moderation): `GET /listings/admin`
   * — every listing regardless of owner or publish status. Requires
   * `listing.moderate` outright (no owner fallback — a moderator queuing
   * every partner's pending listings is never "the owner").
   */
  async listListingsAdmin(principal, filters = {}, paginationOpts = {}) {
    await this.#assertPermission(principal, 'listing.moderate');
    return this.#listingRepository.listAdmin({ ...filters, ...paginationOpts });
  }

  /** Stage 11.3: `GET /listings/admin/:id` — same permission gate as the queue, full listing shape (reuses `findById` with `includeTrashed`, bypassing the publish-visibility rule `getListing` enforces). */
  async getListingAdminDetail(principal, id) {
    await this.#assertPermission(principal, 'listing.moderate');
    const listing = await this.#listingRepository.findById(id, {
      includeTrashed: true,
    });
    if (!listing) throw new NotFoundError('Listing not found.');
    return listing;
  }

  /**
   * Step M3.1 (brief §5-8) — `GET /listings/admin/:id/moderation-history`.
   * A MODERATOR holds `listing.moderate` but deliberately not the global
   * `audit.view` `modules/admin/services/auditLogService.js` requires
   * (that service's own doc comment explains why), so it could review
   * and act on a listing but never see why it reached that state. This
   * gives exactly that one target's own history back, never a
   * client-influenced `targetType`/`targetId` — `#auditLogger
   * .listForTarget` is always called with the literal `'listing'` and
   * this method's own validated `id`, structurally incapable of
   * returning another target's rows regardless of what a caller sends.
   *
   * Calls `getListingAdminDetail` first and discards the result — not
   * merely for its `listing.moderate` check (which duplicates one line),
   * but so this endpoint's permission-then-existence ordering, and its
   * soft-deleted-listing visibility, can never drift out of sync with
   * the moderation-detail page this history exists to accompany (brief
   * §8's "match the intentional moderation-detail contract"): a caller
   * without permission gets the identical 403 the detail page would,
   * before any existence check ever runs — no enumeration oracle for a
   * listing id this principal isn't allowed to moderate.
   */
  async getModerationHistory(principal, id, { cursor, limit } = {}) {
    await this.getListingAdminDetail(principal, id);
    return this.#auditLogger.listForTarget('listing', id, { cursor, limit });
  }

  /**
   * Step M2B (brief §5-7): the mandatory pre-publication step — DRAFT (a
   * fresh listing, or one a Moderator just returned for changes) ->
   * PENDING_REVIEW, moderation reset to PENDING, any prior return-for-
   * changes note cleared. Reuses `#checkPublishReadiness` verbatim (the
   * exact same validator `publishListing` itself runs) rather than a
   * second implementation — a listing that reaches PENDING_REVIEW is
   * therefore already known-publishable, so the eventual Moderator
   * APPROVE never needs to re-check readiness.
   *
   * Concurrency-safe (brief §17): locks the row first, re-validates
   * ownership/state against that locked read (never a stale pre-
   * transaction one), and writes + audits inside the same transaction —
   * the identical `lockById` -> revalidate -> write -> audit shape
   * `updateModerationStatus` below and `bookingService.js#confirmBooking`
   * already establish.
   */
  async submitForReview(principal, id, { publicationPeriodDays } = {}) {
    const updated = await withTransaction(async (connection) => {
      const locked = await this.#listingRepository.lockById(id, connection);
      if (!locked || locked.deletedAt) {
        throw new NotFoundError('Listing not found.');
      }
      await this.#assertOwnerOrPermission(
        principal,
        locked.partnerId,
        'listing.update',
      );

      if (
        !isValidListingStatusTransition(locked.statusCode, 'PENDING_REVIEW')
      ) {
        throw new ConflictError(
          `A listing cannot be submitted for review from status "${locked.statusCode}".`,
          'INVALID_STATUS_TRANSITION',
        );
      }
      // Brief §6: a frozen/expired listing must go through the existing
      // Renewal contract, never submission — same guard `publishListing`
      // already applies for the direct-publish case.
      if (isFrozen(locked)) {
        throw new ConflictError(
          'A frozen listing must be renewed, not submitted for review.',
          'LISTING_FROZEN_REQUIRES_RENEWAL',
        );
      }

      // The lightweight locked row has no child-table content (brief
      // §5's readiness check needs translations/media/location/
      // attributes/policies) — re-read the full listing through the
      // SAME connection/transaction so readiness sees a consistent view
      // of exactly the row just locked, never a separate unlocked read.
      const fullListing = await this.#listingRepository.findById(
        id,
        {},
        connection,
      );
      await this.#checkPublishReadiness(fullListing, { publicationPeriodDays });

      const [pendingReviewStatusId, pendingModerationStatusId] =
        await Promise.all([
          this.#listingRepository.findStatusIdByCode(
            'PENDING_REVIEW',
            connection,
          ),
          this.#listingRepository.findModerationStatusIdByCode(
            'PENDING',
            connection,
          ),
        ]);

      const isFirstLifecyclePublish = locked.expiresAt == null;
      await this.#listingRepository.submitForReview(
        id,
        {
          pendingReviewStatusId,
          pendingModerationStatusId,
          publicationPeriodDays: isFirstLifecyclePublish
            ? publicationPeriodDays
            : null,
          updatedBy: principal.userId,
        },
        connection,
      );

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'listing.submitted_for_review',
          targetType: 'listing',
          targetId: id,
          beforeSnapshot: {
            statusCode: locked.statusCode,
            moderationStatusCode: locked.moderationStatusCode,
          },
          afterSnapshot: {
            statusCode: 'PENDING_REVIEW',
            moderationStatusCode: 'PENDING',
          },
        },
        connection,
      );

      return this.#listingRepository.findById(id, {}, connection);
    });

    return updated;
  }

  /**
   * Stage 11.3, hardened in Step M2B (brief §9-11/§16/§20-21) — `PATCH
   * /listings/admin/:id/moderation-status`. `resolveModerationDecision`
   * (`core/domain/listingModerationDecisions.js`) is the single, closed
   * source of truth for which `(current status, requested moderation
   * status)` combinations are even legal and what each one atomically
   * does — a combination not in that table is rejected before any write,
   * never a partial mutation. Runs inside one transaction with the row
   * locked first and revalidated against that locked read (brief §16):
   * two concurrent moderation attempts on the same listing, or a
   * moderation attempt racing a Partner submission, safely serialize
   * instead of one silently clobbering the other's decision.
   */
  async updateModerationStatus(principal, id, statusCode, notes = null) {
    if (!LISTING_MODERATION_STATUSES.includes(statusCode)) {
      throw new ValidationError('Invalid moderation status.');
    }
    await this.#assertPermission(principal, 'listing.moderate');

    const trimmedNotes = notes?.trim() ? notes.trim() : null;

    const { before } = await withTransaction(async (connection) => {
      const locked = await this.#listingRepository.lockById(id, connection);
      if (!locked) throw new NotFoundError('Listing not found.');
      // Brief §25: soft-deleted/archived listings may never be moderated
      // — archived is additionally already excluded by
      // `resolveModerationDecision` simply having no entry for it, but
      // soft-delete needs its own explicit check since `lockById` (like
      // `getListingAdminDetail`) deliberately still resolves a trashed
      // row rather than 404ing outright.
      if (locked.deletedAt) {
        throw new ConflictError(
          'A soft-deleted listing cannot be moderated.',
          'LISTING_DELETED',
        );
      }

      const moderationDecision = resolveModerationDecision(
        locked.statusCode,
        statusCode,
      );
      if (!moderationDecision) {
        throw new ConflictError(
          `Cannot set moderation status "${statusCode}" while the listing is "${locked.statusCode}".`,
          'INVALID_MODERATION_TRANSITION',
        );
      }
      if (moderationDecision.requiresReason && !trimmedNotes) {
        throw new ValidationError(
          'A reason is required to return this listing for changes.',
          [{ field: 'notes', issue: 'REASON_REQUIRED' }],
        );
      }

      const beforeSnapshot = {
        statusCode: locked.statusCode,
        moderationStatusCode: locked.moderationStatusCode,
      };

      if (moderationDecision.writeMode === 'publish') {
        const publishedStatusId =
          await this.#listingRepository.findStatusIdByCode(
            'PUBLISHED',
            connection,
          );
        const isFirstLifecyclePublish = locked.expiresAt == null;
        await this.#listingRepository.markPublished(
          id,
          publishedStatusId,
          principal.userId,
          isFirstLifecyclePublish ? locked.publicationPeriodDays : null,
          connection,
        );
        await this.#listingRepository.updateModerationStatus(
          id,
          'APPROVED',
          null,
          principal.userId,
          connection,
        );
      } else if (moderationDecision.writeMode === 'moderationOnly') {
        await this.#listingRepository.updateModerationStatus(
          id,
          statusCode,
          trimmedNotes,
          principal.userId,
          connection,
        );
      } else {
        const targetStatusId = await this.#listingRepository.findStatusIdByCode(
          moderationDecision.targetStatusCode,
          connection,
        );
        await this.#listingRepository.applyModerationReturn(
          id,
          {
            statusId: targetStatusId,
            moderationStatusCode: statusCode,
            moderationNotes: trimmedNotes,
            updatedBy: principal.userId,
            setUnpublishedAt: moderationDecision.setUnpublishedAt,
          },
          connection,
        );
      }

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'listing.moderation_status_changed',
          targetType: 'listing',
          targetId: id,
          beforeSnapshot,
          afterSnapshot: {
            statusCode: moderationDecision.targetStatusCode,
            moderationStatusCode: statusCode,
            notes: trimmedNotes,
          },
        },
        connection,
      );

      return { before: locked, decision: moderationDecision };
    });

    const updated = await this.#listingRepository.findById(id, {
      includeTrashed: true,
    });

    // Brief §16/§22: only after the transaction has committed — a
    // notification must never describe a decision that rolled back.
    if (statusCode === 'APPROVED' || statusCode === 'REJECTED') {
      await this.#eventBus.publish(
        createDomainEvent({
          eventType:
            statusCode === 'APPROVED'
              ? EVENT_TYPES.LISTING_APPROVED
              : EVENT_TYPES.LISTING_REJECTED,
          actorId: principal.userId,
          resourceType: 'listing',
          resourceId: id,
          payload: {
            listingId: id,
            partnerId: before.partnerId,
            slug: before.slug,
            notes: trimmedNotes,
          },
        }),
      );
    }

    return updated;
  }

  /**
   * Step M2B (brief §12/§13/§18): a Partner may no longer edit content
   * while the listing is under moderation review (`PENDING_REVIEW` — the
   * Moderator must see exactly what they reviewed) or already
   * `PUBLISHED` (live content changes must go through unpublish -> edit
   * -> submit-for-review -> approve, never silently in place). Both
   * checks — and every write below — now happen only after row-locking
   * the listing first (brief §18's concurrency requirement): a
   * concurrent `submitForReview`/`updateModerationStatus` transaction
   * that establishes `PENDING_REVIEW` first is guaranteed to be visible
   * here before this method decides whether editing is even allowed,
   * since both paths lock the identical row.
   */
  async updateListing(principal, id, fields) {
    return withTransaction(async (connection) => {
      const locked = await this.#listingRepository.lockById(id, connection);
      if (!locked || locked.deletedAt) {
        throw new NotFoundError('Listing not found.');
      }
      await this.#assertOwnerOrPermission(
        principal,
        locked.partnerId,
        'listing.update',
      );

      if (locked.statusCode === 'PENDING_REVIEW') {
        throw new ConflictError(
          'A listing currently under moderation review cannot be edited until the Moderator responds.',
          'LISTING_UNDER_REVIEW',
        );
      }
      if (locked.statusCode === 'PUBLISHED') {
        throw new ConflictError(
          'A published listing cannot be edited directly — unpublish it first, then edit and submit for review again.',
          'LISTING_PUBLISHED_EDIT_BLOCKED',
        );
      }

      // Same connection/transaction as the lock above, so every field
      // read below (slug, categoryIds) reflects the exact row just
      // locked, never a separate unlocked read.
      const listing = await this.#listingRepository.findById(
        id,
        {},
        connection,
      );

      let nextSlug;
      if (fields.slug !== undefined) {
        nextSlug = slugify(fields.slug);
        if (!nextSlug) {
          throw new ValidationError(
            'A valid slug could not be derived from the provided value.',
            [{ field: 'slug', issue: 'INVALID' }],
          );
        }
        nextSlug = ensureNonNumericSlug(nextSlug);
        if (nextSlug !== listing.slug) {
          await this.#assertUniqueSlug(nextSlug, id);
        }
      }

      // Step L1: `categoryIds` is not part of `updateListingSchema` at
      // all (the primary category is immutable after creation) — every
      // PATCH-driven attribute/pricing/policy resolution always uses the
      // listing's own already-stored category.
      const primaryCategoryId = listing.categoryIds?.[0];
      const [resolvedAttributeValues, resolvedPolicyValues, resolvedPricing] =
        await Promise.all([
          this.#resolveAttributeValues(
            primaryCategoryId,
            fields.attributeValues,
          ),
          this.#resolvePolicyValues(primaryCategoryId, fields.policyValues),
          this.#resolvePricing(primaryCategoryId, fields.pricing),
        ]);

      if (nextSlug !== undefined && nextSlug !== listing.slug) {
        await this.#listingRepository.recordSlugHistory(
          id,
          listing.slug,
          connection,
        );
      }

      await this.#listingRepository.update(
        id,
        {
          slug: nextSlug,
          canonicalUrl: fields.canonicalUrl,
          ogImageMediaId: fields.ogImageMediaId,
          isIndexable: fields.isIndexable,
          isSitemapIncluded: fields.isSitemapIncluded,
          isContactVisible: fields.isContactVisible,
          updatedBy: principal.userId,
        },
        connection,
      );

      if (fields.translations) {
        // eslint-disable-next-line no-restricted-syntax -- sequential by design
        for (const translation of fields.translations) {
          // eslint-disable-next-line no-await-in-loop -- same connection/transaction
          await this.#listingRepository.insertTranslation(
            { listingId: id, ...translation },
            connection,
          );
        }
      }
      if (fields.location) {
        await this.#listingRepository.upsertLocation(
          { listingId: id, ...fields.location },
          connection,
        );
      }
      if (fields.amenityIds) {
        await this.#listingRepository.replaceAmenityLinks(
          id,
          fields.amenityIds,
          connection,
        );
      }
      if (resolvedAttributeValues) {
        await this.#listingRepository.replaceAttributeValues(
          id,
          resolvedAttributeValues,
          connection,
        );
      }
      if (resolvedPolicyValues) {
        await this.#listingRepository.replacePolicyValues(
          id,
          resolvedPolicyValues,
          connection,
        );
      }
      if (resolvedPricing) {
        await this.#listingRepository.upsertPricing(
          id,
          resolvedPricing,
          connection,
        );
      }
      if (fields.bookingRules) {
        await this.#listingRepository.upsertBookingRules(
          id,
          fields.bookingRules,
          connection,
        );
      }

      await this.#auditLogger.record(
        {
          actorId: principal.userId,
          action: 'listing.updated',
          targetType: 'listing',
          targetId: id,
          afterSnapshot: fields,
        },
        connection,
      );

      return this.#listingRepository.findById(id, {}, connection);
    });
  }

  async deleteListing(principal, id) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.delete',
    );

    await this.#listingRepository.softDelete(id, principal.userId);

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.deleted',
      targetType: 'listing',
      targetId: id,
    });
  }

  /**
   * Readiness check per API_SPECIFICATION.md §38: at least one translation,
   * at least one image, a complete address/location, every `is_required`
   * category attribute/policy has a value, and at least one bookable unit
   * exists — the last two close Sprint 7's own documented gap ("Available
   * once the Availability module exists"; it now does, per Phase 5) and
   * the Generic Attribute Engine's `is_required` flag (unused for
   * enforcement until now).
   */
  /**
   * Listing Lifetime / Renewal, Step B3: `publicationPeriodDays` joins the
   * existing checklist as one more readiness requirement — required only
   * for a listing's FIRST lifecycle-managed publish (`listing.expiresAt`
   * still `null`; a listing already mid-lifecycle keeps its existing
   * `expires_at` untouched by ordinary publish, per the B3 brief's own
   * "no republish-extension exploit" requirement, so no period is needed
   * or accepted from it). Reported through the exact same `details` array
   * as every other readiness issue, never a separate error channel — the
   * UI's `ReviewStep` already renders whichever issues come back from
   * here identically, whether they're about translations, media, or now
   * the publication period.
   */
  async #checkPublishReadiness(listing, { publicationPeriodDays } = {}) {
    const details = [];

    const isFirstLifecyclePublish = listing.expiresAt == null;
    if (
      isFirstLifecyclePublish &&
      !isValidPublicationPeriodDays(publicationPeriodDays)
    ) {
      details.push({
        field: 'publicationPeriodDays',
        issue:
          publicationPeriodDays == null
            ? 'PUBLICATION_PERIOD_REQUIRED'
            : 'INVALID_PUBLICATION_PERIOD',
      });
    }

    if (listing.translations.length === 0) {
      details.push({
        field: 'translations',
        issue: 'AT_LEAST_ONE_TRANSLATION_REQUIRED',
      });
    }

    const hasImage = listing.media.some(
      (media) =>
        media.mediaTypeCode === 'IMAGE' &&
        media.moderationStatusCode !== 'REJECTED',
    );
    if (!hasImage) {
      details.push({ field: 'media', issue: 'AT_LEAST_ONE_IMAGE_REQUIRED' });
    }

    // "Complete" means mappable/bookable — coordinates present.
    // `addressId`/`cityId` stay optional (nullable in listing_locations):
    // useful for display, not required to publish.
    const { location } = listing;
    const hasCompleteLocation = Boolean(
      location && location.latitude !== null && location.longitude !== null,
    );
    if (!hasCompleteLocation) {
      details.push({ field: 'location', issue: 'COMPLETE_LOCATION_REQUIRED' });
    }

    const categoryId = listing.categoryIds?.[0];
    if (categoryId) {
      // Readiness only inspects attributes/policies (never amenity names),
      // so the requested locale doesn't matter here — resolve to the
      // server default rather than threading a locale through publish.
      const locale = await resolveLocaleIds();
      const metadata =
        await this.#listingMetadataRepository.getMetadataForCategory(
          categoryId,
          locale,
        );

      const providedAttributeCodes = new Set(
        listing.attributeValues.map((entry) => entry.code),
      );
      metadata.attributes
        .filter(
          (attribute) =>
            attribute.isRequired && !providedAttributeCodes.has(attribute.code),
        )
        .forEach((attribute) => {
          details.push({
            field: `attributeValues.${attribute.code}`,
            issue: 'REQUIRED_ATTRIBUTE_MISSING',
          });
        });

      const providedPolicyCodes = new Set(
        listing.policyValues.map((entry) => entry.code),
      );
      metadata.policies
        .filter(
          (policy) =>
            policy.isRequired && !providedPolicyCodes.has(policy.code),
        )
        .forEach((policy) => {
          details.push({
            field: `policyValues.${policy.code}`,
            issue: 'REQUIRED_POLICY_MISSING',
          });
        });
    }

    const hasBookableUnit = await this.#hasBookableUnit(listing.id);
    if (!hasBookableUnit) {
      details.push({
        field: 'bookableUnits',
        issue: 'AT_LEAST_ONE_BOOKABLE_UNIT_REQUIRED',
      });
    }

    if (details.length > 0) {
      throw new ValidationError('Listing is not ready to publish.', details);
    }
  }

  /**
   * @param {{userId: number, roles: string[]}} principal
   * @param {number} id
   * @param {{publicationPeriodDays?: number}} [options] Listing Lifetime /
   *   Renewal, Step B3: only consulted (and only required) for this
   *   listing's first lifecycle-managed publish; ignored entirely once
   *   `expires_at` is already set — see `#checkPublishReadiness`'s own
   *   doc comment for why a republish can never silently extend an
   *   existing period.
   */
  /**
   * Step M2B (brief §8): a Partner/owner can no longer reach PUBLISHED
   * through this action — the mandatory path is now `submitForReview`
   * (-> PENDING_REVIEW) followed by a Moderator's APPROVE decision (via
   * `updateModerationStatus`, which itself reuses `markPublished` below
   * for the actual lifecycle write). This method's own owner-fallback
   * was the entire mechanism that let a Partner bypass review, so it is
   * removed here — `#assertPermission` (no owner/Manager fallback,
   * matching every other admin-only action in this file, e.g.
   * `updateModerationStatus`) is the fix. No role is directly granted
   * `listing.publish` except ADMIN/SUPER_ADMIN (`004_roles_and_
   * permissions.js`'s "all permissions" grant), so this is not a new
   * invented bypass — it's the same genuinely-privileged internal path
   * those two roles already have everywhere else, now correctly the
   * ONLY way into this specific action. `unpublishListing`/
   * `archiveListing`/`renewListing` are deliberately untouched — those
   * remain real, legitimate Partner self-service actions per brief
   * §13/§14, and none of them can reach PUBLISHED from DRAFT/
   * PENDING_REVIEW the way this one could.
   */
  async publishListing(principal, id, { publicationPeriodDays } = {}) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertPermission(principal, 'listing.publish');

    if (!isValidListingStatusTransition(listing.statusCode, 'PUBLISHED')) {
      throw new ConflictError(
        `A listing cannot be published from status "${listing.statusCode}".`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    // Step B3: a frozen (expired-without-renewal) listing needs the
    // future B5 Renew flow, which will re-verify readiness and assign a
    // fresh period explicitly — ordinary Publish must never be a
    // side-door back to PUBLISHED that silently clears `frozen_at`/
    // `purge_after` for it. The domain transition table itself still
    // allows UNPUBLISHED -> PUBLISHED (that edge is what B5's Renew will
    // reuse), so this frozen-specific guard has to live here, not there.
    if (isFrozen(listing)) {
      throw new ConflictError(
        'A frozen listing must be renewed, not published directly.',
        'LISTING_FROZEN_REQUIRES_RENEWAL',
      );
    }

    await this.#checkPublishReadiness(listing, { publicationPeriodDays });

    const isFirstLifecyclePublish = listing.expiresAt == null;
    const publishedStatusId =
      await this.#listingRepository.findStatusIdByCode('PUBLISHED');
    await withTransaction((connection) =>
      this.#listingRepository.markPublished(
        id,
        publishedStatusId,
        principal.userId,
        isFirstLifecyclePublish ? publicationPeriodDays : null,
        connection,
      ),
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.published',
      targetType: 'listing',
      targetId: id,
    });

    return this.#listingRepository.findById(id);
  }

  async unpublishListing(principal, id) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.publish',
    );

    if (!isValidListingStatusTransition(listing.statusCode, 'UNPUBLISHED')) {
      throw new ConflictError(
        `A listing cannot be unpublished from status "${listing.statusCode}".`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const unpublishedStatusId =
      await this.#listingRepository.findStatusIdByCode('UNPUBLISHED');
    await this.#listingRepository.markUnpublished(
      id,
      unpublishedStatusId,
      principal.userId,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.unpublished',
      targetType: 'listing',
      targetId: id,
    });

    return this.#listingRepository.findById(id);
  }

  /**
   * Phase 9 (Partner Dashboard): `listingStatusTransitions.js` has always
   * allowed PUBLISHED|UNPUBLISHED -> ARCHIVED, but no endpoint reached it
   * until now. Deliberately terminal — `ARCHIVED` has zero outgoing
   * transitions in the domain state machine (a partner-facing "delete
   * without losing history" action), so there is no `unarchiveListing`.
   */
  async archiveListing(principal, id) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.publish',
    );

    if (!isValidListingStatusTransition(listing.statusCode, 'ARCHIVED')) {
      throw new ConflictError(
        `A listing cannot be archived from status "${listing.statusCode}".`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const archivedStatusId =
      await this.#listingRepository.findStatusIdByCode('ARCHIVED');
    await this.#listingRepository.markArchived(
      id,
      archivedStatusId,
      principal.userId,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.archived',
      targetType: 'listing',
      targetId: id,
    });

    return this.#listingRepository.findById(id);
  }

  async listMedia(principal, listingId) {
    // Reuses getListing's exact visibility rule (published -> public,
    // otherwise owner/permission-gated, else 404) rather than duplicating it.
    await this.getListing(principal, listingId);
    return this.#listingRepository.listMedia(listingId);
  }

  async attachMedia(principal, listingId, buffer, mimeType) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );

    if (!isAllowedMimeType(mimeType)) {
      throw new ValidationError('Unsupported media type.');
    }
    if (!isWithinSizeLimit(mimeType, buffer.length)) {
      throw new ValidationError('Media file exceeds the maximum allowed size.');
    }

    const category = classifyMimeType(mimeType); // 'image' | 'video' | 'document'

    // Step L3 (brief §14-17): images are always actually decoded, never
    // trusted by declared Content-Type alone — `validateAndProcessImage`
    // rejects a magic-byte mismatch, a corrupt/truncated file, or an
    // oversized pixel grid, and returns a re-encoded buffer with
    // EXIF/GPS metadata stripped and orientation already baked in.
    // Video/document bytes pass through unchanged — no processing
    // capability exists for those kinds in this step.
    const storedBuffer =
      category === 'image'
        ? (await validateAndProcessImage(buffer, mimeType)).buffer
        : buffer;

    // Step L3 (brief §18): a cryptographically strong key, not the
    // millisecond-resolution `Date.now()` this replaced — two uploads
    // landing in the same millisecond (realistic once a Partner selects
    // several images at once; `MediaStep.jsx` fires one request per file
    // in parallel) would otherwise collide and overwrite each other in
    // object storage.
    const extension = mimeType.split('/')[1];
    const key = `listings/${listingId}/${randomUUID()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, storedBuffer, {
      contentType: mimeType,
    });

    // Step L3 (brief §19-20): nothing is stored permanently until every
    // validation above has already passed (reject first, store second),
    // and if the DB write itself still fails — a stale `listingId` FK
    // race, a transient connection error — the just-stored object is
    // deleted rather than left orphaned in object storage.
    let media;
    try {
      media = await withTransaction(async (connection) => {
        // Step L3 (brief §22-23): locks the parent listing row FIRST
        // (a locking read, not a snapshot read — see the repository
        // method's own header for why this ordering matters), so two
        // concurrent attachMedia calls for the same listing serialize
        // instead of both computing the same next `position`/`is_cover`
        // from a stale, independently-read `listing.media.length`.
        const locked = await this.#listingRepository.lockById(
          listingId,
          connection,
        );
        if (!locked || locked.deletedAt) {
          throw new NotFoundError('Listing not found.');
        }
        return this.#listingRepository.attachMedia(
          {
            listingId,
            mediaTypeCode: category.toUpperCase(),
            url,
            mimeType,
            fileSizeBytes: storedBuffer.length,
            ownerUserId: principal.userId,
          },
          connection,
        );
      });
    } catch (err) {
      await this.#storageProvider.delete(key).catch(() => {});
      throw err;
    }

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.media_attached',
      targetType: 'listing',
      targetId: listingId,
      afterSnapshot: { mediaId: media.id },
    });

    return media;
  }

  async updateMedia(principal, listingId, mediaId, fields) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );

    const media = await this.#listingRepository.findMediaById(mediaId);
    if (!media || media.mediableId !== listingId) {
      throw new NotFoundError('Media not found for this listing.');
    }

    const updated = await this.#listingRepository.updateMedia(mediaId, {
      position: fields.position,
      isCover: fields.isCover,
      updatedBy: principal.userId,
    });

    if (fields.altText !== undefined || fields.caption !== undefined) {
      const { defaultLocaleId } = await resolveLocaleIds();
      await this.#listingRepository.upsertMediaTranslation(
        mediaId,
        defaultLocaleId,
        { altText: fields.altText, caption: fields.caption },
      );
      return this.#listingRepository.findMediaById(mediaId);
    }

    return updated;
  }

  async removeMedia(principal, listingId, mediaId) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );

    const media = await this.#listingRepository.findMediaById(mediaId);
    if (!media || media.mediableId !== listingId) {
      throw new NotFoundError('Media not found for this listing.');
    }

    await this.#listingRepository.removeMedia(mediaId, principal.userId);

    // Step L3.1 (brief §10) — the DB row is already soft-deleted (and so
    // excluded from every `scopeActive` read) before this runs, so a
    // storage-delete failure here can only ever leave an orphaned
    // object, never a live/public DB record pointing at a file that's
    // already gone. Best-effort: `StorageProvider.delete` already logs
    // its own failure (S3) or is a safe no-op on a missing file (local).
    const key = this.#storageProvider.getKeyFromUrl(media.url);
    if (key) {
      await this.#storageProvider.delete(key).catch(() => {});
    }

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.media_removed',
      targetType: 'listing',
      targetId: listingId,
      afterSnapshot: { mediaId },
    });
  }

  // --- Phase 18 (Premium Listing Detail): highlights / itinerary /
  // included-items / FAQs. Same owner-or-`listing.update` gate every other
  // listing write already uses; each is a full-replace write (see the
  // repository's own comment) so there's only ever one write method per
  // content type, no separate create/update/delete per row.

  // 2026 Partner Workspace redesign (Sprint 3): `languageCode` is now an
  // explicit, optional caller-supplied locale ('en'/'hy'/'ru') — resolved
  // through the exact same `resolveLocaleIds(requestedCode)` every other
  // locale-aware module already uses (search, listing metadata), which
  // falls back to the platform default when omitted/unmatched, so every
  // existing caller that never passed one keeps writing the default
  // locale exactly as before. The repository's own DELETE is already
  // scoped by `listing_id AND language_id` (verified end-to-end before
  // this change), so passing a real per-request locale here only makes
  // MORE locales reachable — it does not change the destructive-only-
  // within-that-locale guarantee the repository already provided.

  async replaceHighlights(principal, listingId, highlights, languageCode) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
    const { localeId } = await resolveLocaleIds(languageCode);
    return this.#listingRepository.replaceHighlights(
      listingId,
      highlights,
      principal.userId,
      localeId,
    );
  }

  async replaceItinerarySteps(principal, listingId, steps, languageCode) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
    const { localeId } = await resolveLocaleIds(languageCode);
    return this.#listingRepository.replaceItinerarySteps(
      listingId,
      steps,
      principal.userId,
      localeId,
    );
  }

  async replaceIncludedItems(principal, listingId, items, languageCode) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
    const { localeId } = await resolveLocaleIds(languageCode);
    return this.#listingRepository.replaceIncludedItems(
      listingId,
      items,
      principal.userId,
      localeId,
    );
  }

  async replaceFaqs(principal, listingId, faqs, languageCode) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );
    const { localeId } = await resolveLocaleIds(languageCode);
    return this.#listingRepository.replaceFaqs(
      listingId,
      faqs,
      principal.userId,
      localeId,
    );
  }

  /**
   * Phase 18: a non-throwing counterpart to `#checkPublishReadiness` —
   * reuses the exact same signal sources (translation/image/location/
   * required-attribute-and-policy/bookable-unit presence) but returns a
   * required/recommended/optional breakdown and percentage instead of
   * rejecting the request. "Recommended" fields (highlights, extra
   * photos, FAQs) are real content-richness signals this phase adds —
   * never publish-blocking, only surfaced to help a partner write a
   * better listing.
   */
  async getListingCompleteness(principal, listingId) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
    );

    const required = [];
    const recommended = [];
    // Baseline checks every listing is scored on, regardless of category
    // (translations/media/location/bookableUnits) — category-required
    // attribute/policy codes are added on top, dynamically, per category.
    let totalRequiredChecks = 4;

    if (listing.translations.length === 0) {
      required.push('translations');
    }
    const hasImage = listing.media.some(
      (media) =>
        media.mediaTypeCode === 'IMAGE' &&
        media.moderationStatusCode !== 'REJECTED',
    );
    if (!hasImage) required.push('media');
    if (!listing.location || listing.location.latitude === null) {
      required.push('location');
    }

    const categoryId = listing.categoryIds?.[0];
    if (categoryId) {
      const locale = await resolveLocaleIds();
      const metadata =
        await this.#listingMetadataRepository.getMetadataForCategory(
          categoryId,
          locale,
        );
      const providedAttributeCodes = new Set(
        listing.attributeValues.map((entry) => entry.code),
      );
      const requiredAttributes = metadata.attributes.filter(
        (a) => a.isRequired,
      );
      totalRequiredChecks += requiredAttributes.length;
      requiredAttributes
        .filter((a) => !providedAttributeCodes.has(a.code))
        .forEach((a) => required.push(`attributeValues.${a.code}`));

      const providedPolicyCodes = new Set(
        listing.policyValues.map((entry) => entry.code),
      );
      const requiredPolicies = metadata.policies.filter((p) => p.isRequired);
      totalRequiredChecks += requiredPolicies.length;
      requiredPolicies
        .filter((p) => !providedPolicyCodes.has(p.code))
        .forEach((p) => required.push(`policyValues.${p.code}`));
    }

    if (!(await this.#hasBookableUnit(listing.id))) {
      required.push('bookableUnits');
    }

    if (listing.highlights.length === 0) recommended.push('highlights');
    if (listing.media.length < 5) recommended.push('media.moreImages');
    if (listing.faqs.length === 0) recommended.push('faqs');
    if (!listing.pricing) recommended.push('pricing');
    const description = listing.translations[0]?.description ?? '';
    if (description.length < 200) {
      recommended.push('translations.description');
    }
    const totalRecommendedChecks = 5;

    // Weighted: required checks (70%) matter more than recommended (30%)
    // — a listing can be publish-ready with a modest percentage if it's
    // missing several "nice to have" fields, but can never score highly
    // while still missing required fields.
    const requiredScore =
      1 - required.length / Math.max(totalRequiredChecks, 1);
    const recommendedScore =
      1 - recommended.length / Math.max(totalRecommendedChecks, 1);
    const percentComplete = Math.round(
      requiredScore * 70 + recommendedScore * 30,
    );

    return {
      isPublishReady: required.length === 0,
      percentComplete,
      requiredMissing: required,
      recommendedMissing: recommended,
    };
  }
}

export default ListingService;

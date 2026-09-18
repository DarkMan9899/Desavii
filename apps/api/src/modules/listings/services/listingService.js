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
      } else {
        const numericValue = Number(entry.value);
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

    const listingTypeId = await this.#listingRepository.findListingTypeIdByCode(
      input.listingType,
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
    const primaryCategoryId = input.categoryIds?.[0];
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
   * Stage 11.3: `PATCH /listings/admin/:id/moderation-status` — the first
   * real write to `listings.moderation_status_id` (set once, at creation,
   * to PENDING, and never transitioned until now). `notes` is optional
   * free text (e.g. a rejection reason), surfaced back to the partner.
   */
  async updateModerationStatus(principal, id, statusCode, notes = null) {
    if (!LISTING_MODERATION_STATUSES.includes(statusCode)) {
      throw new ValidationError('Invalid moderation status.');
    }
    await this.#assertPermission(principal, 'listing.moderate');

    const before = await this.#listingRepository.findById(id, {
      includeTrashed: true,
    });
    if (!before) throw new NotFoundError('Listing not found.');

    await this.#listingRepository.updateModerationStatus(
      id,
      statusCode,
      notes,
      principal.userId,
    );

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.moderation_status_changed',
      targetType: 'listing',
      targetId: id,
      beforeSnapshot: { moderationStatusCode: before.moderationStatusCode },
      afterSnapshot: { moderationStatusCode: statusCode, notes },
    });

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
            notes,
          },
        }),
      );
    }

    return this.#listingRepository.findById(id, { includeTrashed: true });
  }

  async updateListing(principal, id, fields) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.update',
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

    // Falls back to the listing's EXISTING category when this particular
    // PATCH doesn't include `categoryIds` — the wizard's Dynamic
    // Attributes/Pricing/Policies steps each PATCH independently, after
    // Category was already set on an earlier step.
    const primaryCategoryId =
      fields.categoryIds?.[0] ?? listing.categoryIds?.[0];
    const [resolvedAttributeValues, resolvedPolicyValues, resolvedPricing] =
      await Promise.all([
        this.#resolveAttributeValues(primaryCategoryId, fields.attributeValues),
        this.#resolvePolicyValues(primaryCategoryId, fields.policyValues),
        this.#resolvePricing(primaryCategoryId, fields.pricing),
      ]);

    await withTransaction(async (connection) => {
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
      if (fields.categoryIds) {
        await this.#listingRepository.replaceCategoryLinks(
          id,
          fields.categoryIds,
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
    });

    await this.#auditLogger.record({
      actorId: principal.userId,
      action: 'listing.updated',
      targetType: 'listing',
      targetId: id,
      afterSnapshot: fields,
    });

    return this.#listingRepository.findById(id);
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
  async publishListing(principal, id, { publicationPeriodDays } = {}) {
    const listing = await this.#listingRepository.findById(id);
    if (!listing) throw new NotFoundError('Listing not found.');
    await this.#assertOwnerOrPermission(
      principal,
      listing.partnerId,
      'listing.publish',
    );

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
    const extension = mimeType.split('/')[1];
    const key = `listings/${listingId}/${Date.now()}.${extension}`;
    const { url } = await this.#storageProvider.put(key, buffer, {
      contentType: mimeType,
    });

    const media = await this.#listingRepository.attachMedia({
      listingId,
      mediaTypeCode: category.toUpperCase(),
      url,
      mimeType,
      fileSizeBytes: buffer.length,
      ownerUserId: principal.userId,
      position: listing.media.length,
      isCover: listing.media.length === 0,
    });

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

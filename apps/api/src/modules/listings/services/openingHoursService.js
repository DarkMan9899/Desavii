/**
 * OpeningHoursService — Pass 6 (Restaurant vertical, owner issue #13).
 *
 * Same "Owner or `listing.update`" authorization shape `RestaurantMenuService`
 * already uses (reimplemented here for the same reason that file gives:
 * `ListingService#isOwnerOrHasPermission` is private) — not a divergent
 * rule.
 */

import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
} from '../../../errors/AppError.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { isManagerAssignedToPartner } from '../../../infrastructure/database/repositories/managerAssignmentRepository.js';

const MANAGER_ALLOWED_PERMISSION_KEYS = new Set(['listing.update']);

export class OpeningHoursService {
  #openingHoursRepository;

  #listingRepository;

  #permissionResolver;

  constructor({
    openingHoursRepository,
    listingRepository,
    permissionResolver,
  }) {
    this.#openingHoursRepository = openingHoursRepository;
    this.#listingRepository = listingRepository;
    this.#permissionResolver = permissionResolver;
  }

  async #isOwnerOrHasPermission(principal, partnerId, permissionKey) {
    if (!principal) return false;
    const isOwner = await isPartnerOwner(principal.userId, partnerId);
    if (isOwner) return true;
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

  async #assertOwnerOrPermission(principal, partnerId) {
    if (!principal) throw new AuthenticationError();
    const allowed = await this.#isOwnerOrHasPermission(
      principal,
      partnerId,
      'listing.update',
    );
    if (!allowed) throw new AuthorizationError();
  }

  async #getListingOrThrow(listingId) {
    const listing = await this.#listingRepository.findById(listingId);
    if (!listing) throw new NotFoundError('Listing not found.');
    return listing;
  }

  /** Public read — used by both the Partner authoring UI and the public Listing Detail page, same visibility model as `GET /:id/menu`. */
  async getOpeningHours(listingId) {
    await this.#getListingOrThrow(listingId);
    return this.#openingHoursRepository.findByListingId(listingId);
  }

  async replaceOpeningHours(principal, listingId, days) {
    const listing = await this.#getListingOrThrow(listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    return this.#openingHoursRepository.replaceForListing(
      listingId,
      days,
      principal.userId,
    );
  }
}

export default OpeningHoursService;

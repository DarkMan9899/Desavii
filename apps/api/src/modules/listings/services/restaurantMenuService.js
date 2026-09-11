/**
 * RestaurantMenuService — Pass 3 remediation (Restaurant vertical).
 *
 * Same "Owner or `listing.update`" authorization shape `ListingService`
 * already uses for highlights/itinerary/FAQs (API_SPECIFICATION.md §5/§38)
 * — reimplemented here rather than imported, since `ListingService`'s own
 * `#isOwnerOrHasPermission` is a private class method; this mirrors it
 * exactly against the same `isPartnerOwner`/`isManagerAssignedToPartner`
 * primitives, not a divergent rule.
 *
 * A menu may only be created on a RESTAURANT-type listing — sections/items
 * don't re-check this (they're always reached through an existing menu,
 * which already proves the listing was RESTAURANT at menu-creation time).
 */

import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../errors/AppError.js';
import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { isManagerAssignedToPartner } from '../../../infrastructure/database/repositories/managerAssignmentRepository.js';
import { findCurrencyByCode } from '../../../infrastructure/database/repositories/currencyRepository.js';
import { resolveLocaleIds } from '../../../infrastructure/database/repositories/languageRepository.js';

const MANAGER_ALLOWED_PERMISSION_KEYS = new Set(['listing.update']);

export class RestaurantMenuService {
  #restaurantMenuRepository;

  #listingRepository;

  #permissionResolver;

  constructor({
    restaurantMenuRepository,
    listingRepository,
    permissionResolver,
  }) {
    this.#restaurantMenuRepository = restaurantMenuRepository;
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

  async #getMenuOrThrow(menuId) {
    const menu = await this.#restaurantMenuRepository.findMenuById(menuId);
    if (!menu) throw new NotFoundError('Menu not found.');
    return menu;
  }

  async #getSectionOrThrow(sectionId) {
    const section =
      await this.#restaurantMenuRepository.findSectionById(sectionId);
    if (!section) throw new NotFoundError('Menu section not found.');
    return section;
  }

  async #getItemOrThrow(itemId) {
    const item = await this.#restaurantMenuRepository.findItemById(itemId);
    if (!item) throw new NotFoundError('Menu item not found.');
    return item;
  }

  async #resolveCurrencyOrThrow(currencyCode) {
    const currency = await findCurrencyByCode(currencyCode);
    if (!currency) {
      throw new ValidationError('Invalid currency.', [
        { field: 'price_currency_code', issue: 'UNKNOWN_CURRENCY' },
      ]);
    }
    return currency;
  }

  /** Public read — used by both the Partner authoring UI and the public Listing Detail page; visibility (draft vs. published listing) is the caller's concern, same as `GET /listings/:id`. */
  async getMenusForListing(listingId, localeCode) {
    const listing = await this.#getListingOrThrow(listingId);
    const { localeId } = await resolveLocaleIds(localeCode);
    return this.#restaurantMenuRepository.listMenuTreeForListing(
      listing.id,
      localeId,
    );
  }

  async createMenu(principal, listingId, input) {
    const listing = await this.#getListingOrThrow(listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    if (listing.listingTypeCode !== 'RESTAURANT') {
      throw new ValidationError('Only Restaurant listings can have a menu.', [
        { field: 'listing_id', issue: 'NOT_A_RESTAURANT_LISTING' },
      ]);
    }
    const { localeId } = await resolveLocaleIds(input.languageCode);
    return this.#restaurantMenuRepository.createMenu({
      listingId: listing.id,
      languageId: localeId,
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder ?? 0,
      userId: principal.userId,
    });
  }

  async updateMenu(principal, menuId, input) {
    const menu = await this.#getMenuOrThrow(menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    return this.#restaurantMenuRepository.updateMenu(menuId, {
      name: input.name ?? menu.name,
      description: input.description ?? menu.description,
      isActive: input.isActive ?? menu.isActive,
      sortOrder: input.sortOrder ?? menu.sortOrder,
      userId: principal.userId,
    });
  }

  async deleteMenu(principal, menuId) {
    const menu = await this.#getMenuOrThrow(menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    const sectionCount =
      await this.#restaurantMenuRepository.countSectionsForMenu(menuId);
    if (sectionCount > 0) {
      throw new ConflictError(
        'Remove every section from this menu before deleting it.',
      );
    }
    await this.#restaurantMenuRepository.deleteMenu(menuId);
  }

  async createSection(principal, menuId, input) {
    const menu = await this.#getMenuOrThrow(menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    return this.#restaurantMenuRepository.createSection({
      menuId,
      title: input.title,
      sortOrder: input.sortOrder ?? 0,
      userId: principal.userId,
    });
  }

  async updateSection(principal, sectionId, input) {
    const section = await this.#getSectionOrThrow(sectionId);
    const menu = await this.#getMenuOrThrow(section.menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    return this.#restaurantMenuRepository.updateSection(sectionId, {
      title: input.title ?? section.title,
      sortOrder: input.sortOrder ?? section.sortOrder,
      userId: principal.userId,
    });
  }

  async deleteSection(principal, sectionId) {
    const section = await this.#getSectionOrThrow(sectionId);
    const menu = await this.#getMenuOrThrow(section.menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    const itemCount =
      await this.#restaurantMenuRepository.countItemsForSection(sectionId);
    if (itemCount > 0) {
      throw new ConflictError(
        'Remove every item from this section before deleting it.',
      );
    }
    await this.#restaurantMenuRepository.deleteSection(sectionId);
  }

  async createItem(principal, sectionId, input) {
    const section = await this.#getSectionOrThrow(sectionId);
    const menu = await this.#getMenuOrThrow(section.menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    const currency = await this.#resolveCurrencyOrThrow(
      input.priceCurrencyCode,
    );
    return this.#restaurantMenuRepository.createItem({
      sectionId,
      title: input.title,
      description: input.description,
      priceAmount: input.priceAmount,
      priceCurrencyId: currency.id,
      mediaId: input.mediaId,
      dietaryMarkers: input.dietaryMarkers,
      sortOrder: input.sortOrder ?? 0,
      userId: principal.userId,
    });
  }

  async updateItem(principal, itemId, input) {
    const item = await this.#getItemOrThrow(itemId);
    const section = await this.#getSectionOrThrow(item.sectionId);
    const menu = await this.#getMenuOrThrow(section.menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    const currency = input.priceCurrencyCode
      ? await this.#resolveCurrencyOrThrow(input.priceCurrencyCode)
      : null;
    return this.#restaurantMenuRepository.updateItem(itemId, {
      title: input.title ?? item.title,
      description: input.description ?? item.description,
      priceAmount: input.priceAmount ?? item.priceAmount,
      priceCurrencyId: currency ? currency.id : item.priceCurrencyId,
      mediaId: input.mediaId ?? item.mediaId,
      dietaryMarkers: input.dietaryMarkers ?? item.dietaryMarkers,
      isActive: input.isActive ?? item.isActive,
      sortOrder: input.sortOrder ?? item.sortOrder,
      userId: principal.userId,
    });
  }

  async deleteItem(principal, itemId) {
    const item = await this.#getItemOrThrow(itemId);
    const section = await this.#getSectionOrThrow(item.sectionId);
    const menu = await this.#getMenuOrThrow(section.menuId);
    const listing = await this.#getListingOrThrow(menu.listingId);
    await this.#assertOwnerOrPermission(principal, listing.partnerId);
    await this.#restaurantMenuRepository.deleteItem(itemId);
  }
}

export default RestaurantMenuService;

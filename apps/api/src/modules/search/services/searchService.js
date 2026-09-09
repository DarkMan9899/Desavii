/**
 * SearchService — public Service for the Search & Discovery module.
 *
 * Read-only: no mutation methods, so no `auditLogger` dependency (nothing
 * to audit). Reuses `isPartnerOwner` (Sprint 6,
 * `infrastructure/database/repositories/partnerEmployeeRepository.js`) and
 * the injected `PermissionResolver` — the exact same authorization
 * primitives `ListingService` uses — rather than re-deriving visibility
 * rules. Never duplicates listing business logic: this module only reads
 * and filters, it has no CRUD/ownership/status-transition concerns of its
 * own (BACKEND_ARCHITECTURE.md §4's cross-module rule doesn't apply to
 * shared crosscutting primitives like `isPartnerOwner`, only to another
 * module's Repository).
 */

import { isPartnerOwner } from '../../../infrastructure/database/repositories/partnerEmployeeRepository.js';
import { resolveSortOption } from '../../../core/domain/sortOptions.js';

const SUGGESTION_MIN_QUERY_LENGTH = 2;
const ATTR_RANGE_PATTERN = /^attr_(.+)_(min|max)$/;
const ATTR_PREFIX = 'attr_';

function toIdList(value) {
  return String(value)
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/** DATE bounds stay a plain string (MySQL compares `YYYY-MM-DD` directly); every other type coerces to a number. */
function resolveBound(rawValue, isDate) {
  if (rawValue === undefined) return undefined;
  return isDate ? rawValue : Number(rawValue);
}

/** `YYYY-MM-DD` minus one calendar day, in plain string form (no Date/timezone round-trip needed for a pure calendar-date subtraction). */
function previousDateString(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Turns `dateFrom`/`dateTo`/`guests` into the shape the Repository's query
 * builder needs to filter on real Inventory Engine availability — the
 * Repository itself (not this function) now decides, per candidate unit's
 * own `bookable_unit_types.code`, whether that unit's consumed range is
 * checkout-exclusive (`HOTEL_ROOM`/`PROPERTY_UNIT`, via
 * `accommodationDateSemantics.js`) or inclusive-both-ends (every other
 * type) — see `mysqlSearchRepository.js`'s availability EXISTS block for
 * the actual per-type branching. This function only ever computes the two
 * candidate end-dates a unit might need: `availabilityDateTo` (the raw
 * requested end date, used as-is for inclusive-duration types and as the
 * date-series' own upper bound) and `availabilityLastNight` (one day
 * earlier, used for checkout-exclusive types — equal to `dateTo` itself
 * when `dateFrom === dateTo`, so a genuine single-day request is never
 * collapsed into an empty, vacuously-passing range for either kind of
 * type).
 */
function resolveAvailabilityFilter({ dateFrom, dateTo, guests }) {
  if (!dateFrom || !dateTo) {
    return undefined;
  }
  const lastNight = dateFrom === dateTo ? dateTo : previousDateString(dateTo);
  return {
    availabilityDateFrom: dateFrom,
    availabilityDateTo: dateTo,
    availabilityLastNight: lastNight,
    availabilityGuests: guests ? Number(guests) : 1,
  };
}

/**
 * Groups the generic `attr_{code}` / `attr_{code}_min` / `attr_{code}_max`
 * query keys (passthrough-validated by `searchListingsQuerySchema`, since
 * the set of attribute codes is data, not a fixed enum) by attribute code,
 * ready for `#resolveAttributeFilters` to turn into real filter entries.
 */
function extractAttributeParams(rest) {
  const byCode = new Map();
  Object.entries(rest).forEach(([key, value]) => {
    if (!key.startsWith(ATTR_PREFIX) || value === undefined || value === '') {
      return;
    }
    const rangeMatch = key.match(ATTR_RANGE_PATTERN);
    if (rangeMatch) {
      const [, code, bound] = rangeMatch;
      byCode.set(code, { ...byCode.get(code), [bound]: value });
      return;
    }
    const code = key.slice(ATTR_PREFIX.length);
    byCode.set(code, { ...byCode.get(code), optionIds: toIdList(value) });
  });
  return byCode;
}

export class SearchService {
  #searchRepository;

  #permissionResolver;

  constructor({ searchRepository, permissionResolver }) {
    this.#searchRepository = searchRepository;
    this.#permissionResolver = permissionResolver;
  }

  /**
   * Visibility rule (Sprint 8 plan): an owner of the filtered `partnerId`
   * (Sprint 6's "Host" mapping) or anyone holding `listing.moderate`
   * (Admin/Moderator) may see the `status` they asked for — including
   * drafts — with no filter meaning "every status," mirroring
   * `ListingService.listListings`. Everyone else is silently narrowed to
   * `PUBLISHED` only, the same "never leak via an error, just narrow"
   * philosophy as `ListingService.getListing`'s 404-masking.
   */
  async #resolveVisibility(principal, { partnerId, status }) {
    let elevated = false;
    if (principal && partnerId !== undefined) {
      elevated = await isPartnerOwner(principal.userId, partnerId);
    }
    if (!elevated && principal) {
      elevated = await this.#permissionResolver.hasPermission(
        principal.roles,
        'listing.moderate',
      );
    }
    if (elevated) {
      return status ? { statusCode: status } : {};
    }
    return { onlyPublished: true };
  }

  /**
   * Resolves the `attr_*` params `extractAttributeParams` grouped by code
   * into the `attributeFilters` shape the Repository's query builder
   * consumes — codes not currently registered as `attribute_definitions`
   * are dropped, and a bare `attr_{code}` with no ids (or a `_min`/`_max`
   * pair with neither bound present) is dropped too, since neither can
   * express a filter.
   */
  async #resolveAttributeFilters(rest) {
    const paramsByCode = extractAttributeParams(rest);
    if (paramsByCode.size === 0) {
      return undefined;
    }
    const definitions =
      await this.#searchRepository.getAttributeDefinitionsByCode(
        Array.from(paramsByCode.keys()),
      );

    const filters = [];
    paramsByCode.forEach((value, code) => {
      const definition = definitions.get(code);
      if (!definition) {
        return;
      }
      if (value.optionIds) {
        if (value.optionIds.length > 0) {
          filters.push({
            attributeDefinitionId: definition.id,
            dataTypeCode: definition.dataTypeCode,
            optionIds: value.optionIds,
          });
        }
        return;
      }
      const isDate = definition.dataTypeCode === 'DATE';
      const min = resolveBound(value.min, isDate);
      const max = resolveBound(value.max, isDate);
      if (min === undefined && max === undefined) {
        return;
      }
      filters.push({
        attributeDefinitionId: definition.id,
        dataTypeCode: definition.dataTypeCode,
        min,
        max,
      });
    });
    return filters.length > 0 ? filters : undefined;
  }

  async searchListings(principal, params = {}) {
    const {
      keyword,
      categoryId,
      listingType,
      cityId,
      countryId,
      partnerId,
      status,
      locale,
      sort: sortKey,
      cursor,
      limit,
      amenityIds,
      dateFrom,
      dateTo,
      guests,
      ...rest
    } = params;

    const [visibility, { localeId, defaultLocaleId }, attributeFilters] =
      await Promise.all([
        this.#resolveVisibility(principal, { partnerId, status }),
        this.#searchRepository.resolveLocaleIds(locale),
        this.#resolveAttributeFilters(rest),
      ]);
    const sort = resolveSortOption(sortKey, { hasKeyword: Boolean(keyword) });
    const availabilityFilter = resolveAvailabilityFilter({
      dateFrom,
      dateTo,
      guests,
    });

    const filters = {
      keyword,
      categoryId,
      listingTypeCode: listingType,
      cityId,
      countryId,
      partnerId,
      localeId,
      defaultLocaleId,
      amenityIds: amenityIds ? toIdList(amenityIds) : undefined,
      attributeFilters,
      ...availabilityFilter,
      ...visibility,
    };

    return this.#searchRepository.searchListings(filters, sort, {
      cursor,
      limit,
    });
  }

  /**
   * Sprint E (Promotion Engine): hydrates an explicit, small set of
   * listing ids into the exact same card shape `searchListings` already
   * produces — `AdvertisementService`'s public Home/Category-TOP
   * endpoints call this rather than duplicating this module's join/
   * price/rating logic in a second repository (BACKEND_ARCHITECTURE.md
   * §4's cross-module rule: a Service's public interface, never a second
   * Repository over `search`'s own tables). Order is the CALLER's to
   * decide (promotion priority, not this method) — see
   * `mysqlSearchRepository.js#searchListingsByIds` for why.
   */
  async getListingsByIds(listingIds, { locale } = {}) {
    if (!listingIds || listingIds.length === 0) return [];
    const { localeId, defaultLocaleId } =
      await this.#searchRepository.resolveLocaleIds(locale);
    return this.#searchRepository.searchListingsByIds(listingIds, {
      localeId,
      defaultLocaleId,
    });
  }

  async searchCategories(locale) {
    const { localeId, defaultLocaleId } =
      await this.#searchRepository.resolveLocaleIds(locale);
    return this.#searchRepository.searchCategories({
      localeId,
      defaultLocaleId,
    });
  }

  /** Phase 20 (SEO) — backs the destination landing pages. */
  async searchDestinations(locale) {
    const { localeId, defaultLocaleId } =
      await this.#searchRepository.resolveLocaleIds(locale);
    return this.#searchRepository.searchDestinations({
      localeId,
      defaultLocaleId,
    });
  }

  /**
   * Empty/very-short queries return no suggestions rather than a
   * validation error — graceful, typing-in-progress UX (and avoids a
   * wasteful `LIKE '%'`-style scan for a query too short to mean anything).
   */
  async suggest(query, locale) {
    if (!query || query.trim().length < SUGGESTION_MIN_QUERY_LENGTH) {
      return [];
    }
    const { localeId, defaultLocaleId } =
      await this.#searchRepository.resolveLocaleIds(locale);
    return this.#searchRepository.suggest(query.trim(), {
      localeId,
      defaultLocaleId,
    });
  }

  /**
   * Filter metadata is the same catalog for every caller — unlike
   * `searchListings`, there's no per-principal visibility to narrow, so
   * this is a direct passthrough to the Repository's derived
   * category-resolution query (§4.1 of the proposal).
   */
  async getFilterDefinitions(categoryId) {
    return this.#searchRepository.getFilterDefinitions(categoryId);
  }

  /**
   * Stage 15.1 (AI Trip Planner): resolves a free-text destination string
   * to a real city — never a fabricated one. Read-only, no visibility
   * rule needed (cities are not access-controlled).
   */
  async findCityByName(query) {
    return this.#searchRepository.findCityByName(query);
  }
}

export default SearchService;

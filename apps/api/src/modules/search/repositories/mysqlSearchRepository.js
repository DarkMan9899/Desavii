/**
 * MySQL-backed Search repository.
 *
 * Implements Sprint 8's Search & Discovery module. Read-only — it queries
 * the accepted Sprint 5/7 schema (`listings` + friends) directly rather
 * than a dedicated search index, which doesn't exist yet (see the Sprint 8
 * plan's "no search-index infrastructure exists" note). Keyword relevance
 * uses the `ft_listing_translations_search` FULLTEXT index already defined
 * on `listing_translations` (migration 0005) — no new index required.
 *
 * `searchListings` wraps its joined query in a derived table so the outer
 * query can filter/order by a computed alias (`relevance_score`, the
 * COALESCE'd display `title`) — MySQL doesn't allow a `WHERE` clause to
 * reference a `SELECT` alias directly, but it can reference a derived
 * table's column freely, since the alias becomes a real column one layer
 * out.
 *
 * In `buildSearchListingsQuery`, every join is either 1:1
 * (`listing_locations`, one cover `media` row) or filtered to equality on
 * the join itself (`listing_translations` scoped to one `language_id`,
 * `listing_category_listing` scoped to one `category_id`), so no row
 * multiplies and no `GROUP BY`/de-duplication is needed there.
 * `searchCategories`, below, deliberately does the opposite — it fans out
 * one row per linked listing specifically so `COUNT(DISTINCT ...)` can
 * collapse it back into a per-category listing count.
 */

import { getMysqlPool } from '../../../infrastructure/database/mysqlPool.js';
import { scopeActive } from '../../../infrastructure/database/softDelete.js';
import { scopePubliclyVisibleListing } from '../../listings/repositories/listingVisibilitySql.js';
import {
  decodeCursor,
  buildPageMeta,
} from '../../../infrastructure/database/pagination.js';
import { ACCOMMODATION_BOOKABLE_UNIT_TYPES } from '../../../core/domain/accommodationDateSemantics.js';
import { INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES } from '../../../core/domain/inventoryQuantityUnitTypes.js';
import { BASE_CURRENCY_CODE } from '../../../core/domain/fxConversion.js';
import {
  ENUM_DATA_TYPE_CODES,
  ATTRIBUTE_VALUE_TABLES,
} from './attributeValueTables.js';
import { loadSearchFilterCatalog } from './searchFilterCatalog.js';
import { FILTERABLE_POLICY_DATA_TYPES } from '../../../core/domain/searchComputedFilters.js';
import {
  APPROXIMATE_LOCATION_CATEGORY_SLUGS,
  APPROXIMATE_GRID_DEGREES,
  LOCATION_PRECISION,
} from '../../../core/domain/searchMap.js';

/** `IN (?, ?)`-shaped placeholder list matching `ACCOMMODATION_BOOKABLE_UNIT_TYPES`'s length — reused everywhere the query needs to branch by accommodation-vs-not without a second, independent type list (DATE semantics only — see `INVENTORY_QUANTITY_TYPE_PLACEHOLDERS` below for the separate capacity-semantics branch). */
const ACCOMMODATION_TYPE_PLACEHOLDERS = ACCOMMODATION_BOOKABLE_UNIT_TYPES.map(
  () => '?',
).join(', ');

/** Launch-blocker remediation (P0-C): same `IN (?, ?, ?)` shape, but for `INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES` — deliberately a different list/placeholder pair from the one above, since VEHICLE belongs in the capacity-semantics branch but must stay OUT of the date-semantics one. */
const INVENTORY_QUANTITY_TYPE_PLACEHOLDERS =
  INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES.map(() => '?').join(', ');

/**
 * P2.2D: search has no "how many rooms" input yet (unlike booking-time,
 * which takes a real `quantity` from the rooms a customer actually
 * held) — the smallest correct interpretation is quantity=1: does at
 * least one available unit of a type exist, and can that one unit's own
 * `max_guests` hold the requested party. Never conflated with occupancy
 * — see the availability EXISTS block below.
 */
const SEARCH_REQUESTED_QUANTITY = 1;

/**
 * "Can ONE unit of this type hold the party" for accommodation types —
 * `bookingService.js#resolveItem`'s `guestCount > maxGuests * quantity`
 * check with quantity=1, NULL-safe the same way (a unit with no
 * `max_guests` is never vetoed). Binds the accommodation type list, then
 * the guest count. Shared by the dated availability EXISTS and the
 * undated occupancy EXISTS so the two can never disagree on occupancy.
 */
const ACCOMMODATION_OCCUPANCY_FITS_SQL = `(
          but.code NOT IN (${ACCOMMODATION_TYPE_PLACEHOLDERS})
          OR bu.max_guests IS NULL
          OR bu.max_guests >= ?
        )`;

/**
 * The card's "from" price, only when it is in the platform's base
 * currency: price filters and price sorts compare AMD to AMD and never
 * convert. A listing priced in anything else (never authored today) is
 * treated as unpriced rather than compared across currencies.
 */
const BASE_PRICE_SQL = `CASE WHEN base.price_currency_code = '${BASE_CURRENCY_CODE}' THEN base.price_amount END`;

/** Never-NULL price sort keys: unpriced listings sort last in either direction (above any real price ascending, below zero descending). */
const UNPRICED_SORT_KEY_ASC = '999999999999999';
const UNPRICED_SORT_KEY_DESC = '-1';

/** Never-NULL rating sort key: listings without an approved review sort after every rated one. */
const UNRATED_SORT_KEY = '-1';

/**
 * A `created_at`-sorted cursor's `sortValue` is a `DATETIME(3)` column,
 * which mysql2 returns as a JS `Date`. `encodeCursor`/`decodeCursor`
 * round-trip it through `JSON.stringify`/`JSON.parse`, which turns it into
 * an ISO-8601 string (`...T...Z`) — not the `YYYY-MM-DD HH:MM:SS.fff`
 * format MySQL reliably compares against a `DATETIME` column. Normalizing
 * to that format here (once, at encode time) keeps the decoded cursor
 * value directly bindable in the next page's query.
 */
function toCursorSortValue(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 23).replace('T', ' ');
  }
  return value;
}

/**
 * Reverses `toCursorSortValue` for the next page's query parameter.
 *
 * Binding the normalized string straight back as a query parameter is a
 * real bug, only visible once a search has more than one page of
 * results (never exercised by earlier phases' handful of dev-seeded
 * listings, confirmed during the Phase 11 pre-flight demo-data pass):
 * mysql2 decodes a `DATETIME` column by interpreting its raw wall-clock
 * value in the connection's session `time_zone` (`SYSTEM` by default —
 * i.e. the server OS's local zone, not UTC) and represents it as a JS
 * `Date` (a UTC instant). `toCursorSortValue` above then formats that
 * `Date` back out as a UTC wall-clock string. Passing that UTC string as
 * a literal `DATETIME` parameter compares it against the column's
 * *local-timezone* wall-clock value directly — silently wrong by exactly
 * the session timezone's offset whenever it isn't UTC, so every "load
 * more" page after the first came back empty. Reconstructing a real
 * `Date` object here and binding *that* instead lets mysql2 re-encode it
 * through the same session timezone it used to decode the column,
 * symmetric with the read path.
 */
function fromCursorSortValue(value) {
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)
  ) {
    return new Date(`${value.replace(' ', 'T')}Z`);
  }
  return value;
}

/**
 * The public map point of a listing (see `searchMap.js`'s location
 * policy): a private stay's stored point snapped to the centre of its
 * `APPROXIMATE_GRID_DEGREES` grid cell, every other listing's exact point.
 * Built from domain constants only — never a request value — so it is
 * inlined rather than bound.
 */
const APPROXIMATE_LOCATION_SQL = `EXISTS (
        SELECT 1 FROM listing_category_listing lcl_loc
        JOIN listing_categories lc_loc ON lc_loc.id = lcl_loc.category_id
        WHERE lcl_loc.listing_id = l.id
          AND lc_loc.slug IN (${APPROXIMATE_LOCATION_CATEGORY_SLUGS.map((slug) => `'${slug}'`).join(', ')})
      )`;
const snappedSql = (column) =>
  `FLOOR(base.${column} / ${APPROXIMATE_GRID_DEGREES}) * ${APPROXIMATE_GRID_DEGREES} + ${APPROXIMATE_GRID_DEGREES / 2}`;
const MAP_POINT_SQL = `
      CASE WHEN base.is_location_approximate THEN ${snappedSql('latitude')} ELSE base.latitude END AS map_latitude,
      CASE WHEN base.is_location_approximate THEN ${snappedSql('longitude')} ELSE base.longitude END AS map_longitude`;

/**
 * Pass 7 (category-specific visual identity) — three extra card-display
 * fields, shared verbatim between `buildSearchListingsQuery`'s inner SELECT
 * and `searchListingsByIds`'s standalone one (Sprint E's Home/Category-TOP
 * promoted-listing endpoint reuses the exact same card shape, so it needs
 * the same fields or its cards would silently regress relative to normal
 * Search/Category cards). Every literal here (`'cuisine'`, `'price_tier'`)
 * is a stable backend-declared `attribute_definitions.code`/DTO-shape
 * constant, not user input, so it's safe to inline directly rather than as
 * a bound param — keeps this reusable as a plain string with no
 * placeholder-ordering entanglement in either call site.
 *
 * `category_slug`: a listing can technically link to more than one
 * `listing_categories` row (`listing_category_listing` is a bare M:N
 * junction with no `is_primary` column), but every real/demo listing today
 * has exactly one — `MIN(category_id)` gives a single deterministic slug
 * per listing without inventing a primary-category concept the schema
 * doesn't have.
 *
 * `cuisine_codes`/`price_tier_code`: Restaurant's `cuisine` (MULTI_ENUM)
 * and `price_tier` (ENUM) attributes, resolved through the same
 * `listing_attribute_option` -> `attribute_options` -> `attribute_definitions`
 * chain `getFilterDefinitions` already reads for the filter UI. `cuisine`
 * is GROUP_CONCAT'd (a listing can hold more than one cuisine option) and
 * split back into an array in `toSearchResultDomain`; `price_tier` is
 * single-valued by construction (ENUM, not MULTI_ENUM) so a bare LIMIT 1
 * is correct, not a shortcut.
 */
const CARD_METADATA_SELECT = `
      (SELECT lc.slug FROM listing_category_listing lcl_card
         JOIN listing_categories lc ON lc.id = lcl_card.category_id
         WHERE lcl_card.listing_id = l.id
         ORDER BY lcl_card.category_id ASC LIMIT 1
      ) AS category_slug,
      (SELECT GROUP_CONCAT(ao_cuisine.code ORDER BY ao_cuisine.sort_order SEPARATOR ',')
         FROM listing_attribute_option lao_cuisine
         JOIN attribute_options ao_cuisine ON ao_cuisine.id = lao_cuisine.attribute_option_id
         JOIN attribute_definitions ad_cuisine ON ad_cuisine.id = ao_cuisine.attribute_definition_id
         WHERE lao_cuisine.listing_id = l.id AND ad_cuisine.code = 'cuisine'
      ) AS cuisine_codes,
      (SELECT ao_tier.code
         FROM listing_attribute_option lao_tier
         JOIN attribute_options ao_tier ON ao_tier.id = lao_tier.attribute_option_id
         JOIN attribute_definitions ad_tier ON ad_tier.id = ao_tier.attribute_definition_id
         WHERE lao_tier.listing_id = l.id AND ad_tier.code = 'price_tier'
         LIMIT 1
      ) AS price_tier_code,
      -- Emergency premium card redesign: one more real, non-fabricated
      -- "headline" fact per remaining category, following the exact same
      -- correlated-subquery shape as cuisine/price_tier above -- never a
      -- second card-metadata mechanism. The frontend (categoryCardConfig.js)
      -- decides which single field is this listing's category actually
      -- displays; every field here is SQL NULL whenever that attribute was
      -- never authored for this listing, never a guessed/default value.
      (SELECT ao_star.code
         FROM listing_attribute_option lao_star
         JOIN attribute_options ao_star ON ao_star.id = lao_star.attribute_option_id
         JOIN attribute_definitions ad_star ON ad_star.id = ao_star.attribute_definition_id
         WHERE lao_star.listing_id = l.id AND ad_star.code = 'star_rating'
         LIMIT 1
      ) AS star_rating_code,
      (SELECT ao_trans.code
         FROM listing_attribute_option lao_trans
         JOIN attribute_options ao_trans ON ao_trans.id = lao_trans.attribute_option_id
         JOIN attribute_definitions ad_trans ON ad_trans.id = ao_trans.attribute_definition_id
         WHERE lao_trans.listing_id = l.id AND ad_trans.code = 'transmission'
         LIMIT 1
      ) AS transmission_code,
      (SELECT lav_bed.value
         FROM listing_attribute_values_integer lav_bed
         JOIN attribute_definitions ad_bed ON ad_bed.id = lav_bed.attribute_definition_id
         WHERE lav_bed.listing_id = l.id AND ad_bed.code = 'bedrooms'
         LIMIT 1
      ) AS bedrooms_value,
      (SELECT lav_dur.value
         FROM listing_attribute_values_integer lav_dur
         JOIN attribute_definitions ad_dur ON ad_dur.id = lav_dur.attribute_definition_id
         WHERE lav_dur.listing_id = l.id AND ad_dur.code = 'duration_minutes'
         LIMIT 1
      ) AS duration_minutes_value,
      -- Step L6.2H1: the listing's own pricing model, so a card labels its
      -- price by the basis booking uses rather than by category. NULL when
      -- no listing-level pricing row exists (listing_pricing is 1:1).
      (SELECT pm_card.code
         FROM listing_pricing lp_card
         JOIN pricing_models pm_card ON pm_card.id = lp_card.pricing_model_id
         WHERE lp_card.listing_id = l.id
      ) AS pricing_model_code`;

function toSearchResultDomain(row) {
  return {
    id: row.id,
    partnerId: row.partner_id,
    listingTypeCode: row.listing_type_code,
    slug: row.slug,
    statusCode: row.status_code,
    // Listing Lifetime / Renewal, Step B5 — mapped for every caller
    // (`undefined` on `searchListingsByIds`'s own narrower SELECT, same
    // "column absent there" precedent `categorySlug` etc. already
    // document below); the owner-vs-public DTO split happens downstream,
    // never here.
    publicationPeriodDays: row.publication_period_days ?? null,
    expiresAt: row.expires_at ?? null,
    frozenAt: row.frozen_at ?? null,
    purgeAfter: row.purge_after ?? null,
    renewedAt: row.renewed_at ?? null,
    title: row.title,
    summary: row.summary,
    cityId: row.city_id,
    cityName: row.city_name,
    countryId: row.country_id,
    coverImageUrl: row.cover_image_url,
    priceAmount: row.price_amount,
    priceCurrencyCode: row.price_currency_code,
    mediaCount: Number(row.media_count),
    // Phase 12 (Product Polish): read-only aggregate from `reviews` —
    // `null`/0 when a listing has no approved reviews yet.
    ratingAverage:
      row.rating_average !== null ? Number(row.rating_average) : null,
    reviewCount: Number(row.review_count),
    createdAt: row.created_at,
    // Pass 7 (category-specific visual identity): the coarser
    // `listing_type_code` above can't distinguish e.g. Apartments from
    // Villas (both PROPERTY) — cards need the real category slug to
    // choose a category-precise presentation. `undefined` (column absent
    // from `searchListingsByIds`'s own SELECT — n/a there) collapses to
    // `null` the same as a listing genuinely in no category.
    categorySlug: row.category_slug ?? null,
    // Restaurant card metadata (brief §9/§22, the deferred item from the
    // previous pass) — MULTI_ENUM `cuisine` is GROUP_CONCAT'd into a
    // comma string by the subquery below; split back into option codes
    // here so callers never parse SQL-shaped strings themselves. `null`
    // for a listing with no cuisine attribute set (every non-Restaurant
    // category, or a Restaurant not yet authored) — never `[]`, so
    // "not applicable/not set" stays distinguishable from a future
    // genuinely-empty-selection state.
    cuisineCodes: row.cuisine_codes ? row.cuisine_codes.split(',') : null,
    priceTierCode: row.price_tier_code ?? null,
    // Emergency premium card redesign — same "real value or null, never
    // guessed" rule as cuisine/price_tier above.
    starRatingCode: row.star_rating_code ?? null,
    transmissionCode: row.transmission_code ?? null,
    bedroomsValue:
      row.bedrooms_value !== undefined && row.bedrooms_value !== null
        ? Number(row.bedrooms_value)
        : null,
    durationMinutesValue:
      row.duration_minutes_value !== undefined &&
      row.duration_minutes_value !== null
        ? Number(row.duration_minutes_value)
        : null,
    pricingModelCode: row.pricing_model_code ?? null,
  };
}

/** A marker: the card fields a map preview shows, plus the point. */
function toSearchMapDomain(row) {
  const card = toSearchResultDomain(row);
  return {
    id: card.id,
    slug: card.slug,
    title: card.title,
    listingTypeCode: card.listingTypeCode,
    categorySlug: card.categorySlug,
    cityName: card.cityName,
    // The public map point, never the stored one (see MAP_POINT_SQL).
    latitude: Number(row.map_latitude),
    longitude: Number(row.map_longitude),
    locationPrecision: Number(row.is_location_approximate)
      ? LOCATION_PRECISION.APPROXIMATE
      : LOCATION_PRECISION.EXACT,
    coverImageUrl: card.coverImageUrl,
    priceAmount: card.priceAmount,
    priceCurrencyCode: card.priceCurrencyCode,
    pricingModelCode: card.pricingModelCode,
    ratingAverage: card.ratingAverage,
    reviewCount: card.reviewCount,
    starRatingCode: card.starRatingCode,
    cuisineCodes: card.cuisineCodes,
    priceTierCode: card.priceTierCode,
    transmissionCode: card.transmissionCode,
    bedroomsValue: card.bedroomsValue,
    durationMinutesValue: card.durationMinutesValue,
  };
}

function toCategoryResultDomain(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    slug: row.slug,
    name: row.name,
    listingCount: Number(row.listing_count),
  };
}

function toDestinationResultDomain(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    listingCount: Number(row.listing_count),
  };
}

/** A `GROUP_CONCAT` of ids (or NULL) as numbers. */
function toIdArray(concatenated) {
  return concatenated ? String(concatenated).split(',').map(Number) : [];
}

function toSuggestionDomain(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
  };
}

/**
 * Pure SQL/params builder for every Search projection (the List page and
 * count in `searchListings`, the markers in `searchMap`), extracted so its
 * placeholder/parameter alignment can be unit-tested without a database
 * (`tests/unit/modules/search/mysqlSearchRepository.buildQuery.test.js`) —
 * the single most error-prone part of this file, since MySQL binds `?`
 * placeholders strictly by their left-to-right physical position in the
 * assembled SQL string, not by the order pieces were assembled in code.
 *
 * @param {object} filters - keyword, categoryId, listingTypeCode, cityId,
 *   countryId, partnerId, statusCode, onlyPublished, localeId, defaultLocaleId,
 *   amenityIds (number[], AND semantics — must have ALL), attributeFilters
 *   (Array<{attributeDefinitionId, dataTypeCode, optionIds?: number[], min?,
 *   max?}> — ENUM/MULTI_ENUM use `optionIds` with OR semantics within one
 *   attribute; every other type uses `min`/`max` against its typed value
 *   table; different attributes/amenityIds are always AND'd together),
 *   availabilityDateFrom/availabilityDateTo/availabilityLastNight/
 *   availabilityGuests (dated availability), occupancyGuests (party size
 *   with no dates), excludeCategoryTop (Category page grid only),
 *   priceMin/priceMax (AMD, against the card's "from" price), bbox
 *   ({west, south, east, north}: the committed "Search this area")
 * @returns {{pricedResultsSql: string, filterConditions: string[], filteredParams: any[]}}
 *   the whole filtered result set every projection (the List page, its
 *   count, the Map markers) selects from — the one place a Search
 *   predicate is written
 */
function buildSearchResultSet(filters) {
  const {
    keyword,
    categoryId,
    listingTypeCode,
    cityId,
    countryId,
    partnerId,
    statusCode,
    onlyPublished,
    localeId,
    defaultLocaleId,
    amenityIds,
    attributeFilters,
    availabilityDateFrom,
    availabilityDateTo,
    availabilityLastNight,
    availabilityGuests,
    occupancyGuests,
    excludeCategoryTop,
    priceMin,
    priceMax,
    policyFilters,
    roomMealPlans,
    roomHourlyStays,
    ratingMin,
    bbox,
  } = filters;

  const innerConditions = [scopeActive('l')];
  const innerParams = [];

  if (partnerId !== undefined) {
    innerConditions.push('l.partner_id = ?');
    innerParams.push(partnerId);
  }
  if (listingTypeCode !== undefined) {
    innerConditions.push('ltype.code = ?');
    innerParams.push(listingTypeCode);
  }
  if (statusCode !== undefined) {
    innerConditions.push('ls.code = ?');
    innerParams.push(statusCode);
  } else if (onlyPublished) {
    // Step B4: an anonymous/public searcher must never see an
    // expired/frozen listing — the expiry sweep is only a convenience
    // sync, never the sole authority (see `listingVisibilitySql.js`).
    innerConditions.push(scopePubliclyVisibleListing());
  }
  if (cityId !== undefined) {
    innerConditions.push('loc.city_id = ?');
    innerParams.push(cityId);
  }
  if (countryId !== undefined) {
    innerConditions.push('r.country_id = ?');
    innerParams.push(countryId);
  }
  if (categoryId !== undefined) {
    innerConditions.push('lcl.category_id = ?');
    innerParams.push(categoryId);
  }
  if (categoryId !== undefined && excludeCategoryTop) {
    // Sprint E (Promotion Engine, spec §19): a listing with an active
    // CATEGORY_TOP promotion is shown in the category page's dedicated
    // TOP section (`AdvertisementService#getPublicCategoryTop`) — it
    // must never ALSO appear in that page's normal grid, or it would be
    // duplicated on the page. Opt-in (`excludeCategoryTop`), sent only by
    // the Category page: gating it on `categoryId` alone made the Search
    // page's category filter silently hide the very listing promoted in
    // that category, since Search has no TOP section to show it in.
    // Matches spec §21's "do not broaden into sponsored search ranking."
    // A direct read of `advertisements`/
    // `ad_placement_types`/`advertisement_statuses` here, not a second
    // Repository call — the same "Search reads other modules' tables
    // directly for read-only query composition" precedent this file's
    // `rating_average`/`review_count` subqueries over `reviews` already
    // establish (BACKEND_ARCHITECTURE.md §4 governs Service-layer
    // business-logic reuse, not a read-only SQL join like this one).
    innerConditions.push(`
      NOT EXISTS (
        SELECT 1 FROM advertisements ad
        JOIN ad_placement_types apt ON apt.id = ad.ad_placement_type_id
        JOIN advertisement_statuses ads ON ads.id = ad.status_id
        WHERE ad.listing_id = l.id
          AND apt.code = 'CATEGORY_TOP'
          AND ads.code IN ('APPROVED', 'SCHEDULED', 'ACTIVE')
          AND ad.start_date <= CURDATE() AND ad.end_date >= CURDATE()
          AND ad.deleted_at IS NULL
      )
    `);
  }
  if (amenityIds && amenityIds.length > 0) {
    // One EXISTS per id (not a single IN), so multiple ids require the
    // listing to have ALL of them, not ANY — amenityIds is AND semantics.
    // Step L6.1: a stored link only counts when the amenity applies to
    // the listing's own category — a legacy out-of-category link (kept
    // for compatibility, hidden on the listing page) must never make a
    // listing match an amenity filter, with or without a category filter.
    amenityIds.forEach((amenityId) => {
      innerConditions.push(
        `EXISTS (
          SELECT 1 FROM listing_amenity_listing lal
          JOIN listing_category_listing lal_lcl ON lal_lcl.listing_id = lal.listing_id
          JOIN amenity_category_applicability lal_aca
            ON lal_aca.category_id = lal_lcl.category_id AND lal_aca.amenity_id = lal.amenity_id
          WHERE lal.listing_id = l.id AND lal.amenity_id = ?
        )`,
      );
      innerParams.push(amenityId);
    });
  }
  if (attributeFilters && attributeFilters.length > 0) {
    attributeFilters.forEach((filter) => {
      if (ENUM_DATA_TYPE_CODES.includes(filter.dataTypeCode)) {
        const placeholders = filter.optionIds.map(() => '?').join(', ');
        innerConditions.push(
          `EXISTS (SELECT 1 FROM listing_attribute_option lao WHERE lao.listing_id = l.id AND lao.attribute_option_id IN (${placeholders}))`,
        );
        innerParams.push(...filter.optionIds);
        return;
      }
      const table = ATTRIBUTE_VALUE_TABLES[filter.dataTypeCode];
      const subConditions = [
        'av.listing_id = l.id',
        'av.attribute_definition_id = ?',
      ];
      const subParams = [filter.attributeDefinitionId];
      if (filter.min !== undefined) {
        subConditions.push('av.value >= ?');
        subParams.push(filter.min);
      }
      if (filter.max !== undefined) {
        subConditions.push('av.value <= ?');
        subParams.push(filter.max);
      }
      innerConditions.push(
        `EXISTS (SELECT 1 FROM ${table} av WHERE ${subConditions.join(' AND ')})`,
      );
      innerParams.push(...subParams);
    });
  }
  // Category policies (cancellation policy, pets/children/smoking
  // allowed): one EXISTS per policy, OR within its own values — the same
  // AND-across / OR-within contract as `attributeFilters`.
  if (policyFilters && policyFilters.length > 0) {
    policyFilters.forEach((filter) => {
      const placeholders = filter.values.map(() => '?').join(', ');
      innerConditions.push(
        `EXISTS (SELECT 1 FROM listing_policy_values lpv
          WHERE lpv.listing_id = l.id AND lpv.policy_definition_id = ?
            AND lpv.value IN (${placeholders}))`,
      );
      innerParams.push(filter.policyDefinitionId, ...filter.values);
    });
  }
  // Room facts: at least one live room offers one of the meal plans /
  // can be booked by the hour.
  if (roomMealPlans && roomMealPlans.length > 0) {
    const placeholders = roomMealPlans.map(() => '?').join(', ');
    innerConditions.push(
      `EXISTS (SELECT 1 FROM bookable_units bu_meal
        WHERE bu_meal.listing_id = l.id AND bu_meal.deleted_at IS NULL
          AND bu_meal.meal_plan IN (${placeholders}))`,
    );
    innerParams.push(...roomMealPlans);
  }
  if (roomHourlyStays) {
    innerConditions.push(
      `EXISTS (SELECT 1 FROM bookable_units bu_hourly
        WHERE bu_hourly.listing_id = l.id AND bu_hourly.deleted_at IS NULL
          AND bu_hourly.hourly_enabled = 1)`,
    );
  }

  // Real Inventory Engine availability filtering (Phase 17 §Search
  // integration; P2.2D fix) — shared across every `bookable_unit_types`
  // code, no category branching in WHICH units are considered, but two
  // real per-unit-type distinctions apply, both reusing
  // `accommodationDateSemantics.js`'s single canonical type list rather
  // than a second, independent one:
  //
  // 1. Checkout-exclusive vs. inclusive date range. `availability_search_
  //    dates` always spans the FULL requested `[dateFrom, dateTo]`
  //    (bound as the first two params, since its `WITH RECURSIVE` text is
  //    prepended before everything else) — the per-unit check below then
  //    caps which dates actually apply to THAT unit via
  //    `IF(but.code IN (accommodation types), lastNight, dateTo)`,
  //    matching `resolveConsumedRange`'s own `HOTEL_ROOM`/`PROPERTY_UNIT`
  //    (checkout-exclusive) vs. `RESTAURANT_TABLE`/`TOUR_DEPARTURE`/
  //    `VEHICLE` (inclusive-both-ends) split exactly — previously this
  //    was collapsed by date-shape alone (any multi-day request became
  //    checkout-exclusive for every type), silently under-checking a
  //    non-accommodation booking's final inclusive day.
  //
  // 2. Occupancy vs. inventory quantity, never conflated. `bu.capacity`/
  //    `ac.quantity_available` answer "is at least one unit of this type
  //    free" — for INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES (accommodation
  //    types, and — launch-blocker remediation P0-C — VEHICLE, whose
  //    `capacity` is fleet inventory under the current one-row-per-VIN
  //    data model, never a passenger-seat count) that's compared against
  //    a fixed `SEARCH_REQUESTED_QUANTITY` (1; search has no "how many
  //    rooms/vehicles" input yet, unlike booking-time's real held-unit
  //    count), never against the guest count. `bu.max_guests` separately
  //    answers "can ONE such unit hold this party" — mirrors
  //    `bookingService.js#resolveItem`'s proven `guestCount > maxGuests *
  //    quantity` check exactly (quantity=1 here), including its
  //    NULL-safety (a unit with no `max_guests` set is never vetoed on
  //    occupancy, same as booking-time) — VEHICLE has no `max_guests`
  //    set, so this branch was already a no-op for it before P0-C.
  //    RESTAURANT_TABLE (Step L6.2H2B) is in that list too: its capacity
  //    counts concurrent reservations, so one free slot fits any party.
  //    For every OTHER non-accommodation type (TOUR_DEPARTURE), `capacity` keeps its
  //    pre-existing meaning of a direct occupancy ceiling (e.g. a Tour
  //    departure's total seats) compared straight against the requested
  //    party size — proven by `searchAvailability.test.js`'s existing
  //    TOUR_DEPARTURE case — so the quantity/guest bound is itself
  //    type-gated, by a DIFFERENT type list than #1's date-semantics
  //    gate (`INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES`, not
  //    `ACCOMMODATION_BOOKABLE_UNIT_TYPES` — VEHICLE's DATE semantics
  //    stay inclusive-both-ends, unchanged).
  const hasAvailabilityFilter = Boolean(
    availabilityDateFrom && availabilityDateTo,
  );
  if (hasAvailabilityFilter) {
    // One unit must satisfy EVERY condition together (occupancy, every
    // consumed date's capacity/status, and the listing-level blackout
    // veto) — all four live inside this single EXISTS over `bu`, never
    // split across independent EXISTS blocks that could each be
    // satisfied by a different, unrelated unit.
    innerConditions.push(`
      EXISTS (
        SELECT 1 FROM bookable_units bu
        JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
        WHERE bu.listing_id = l.id AND bu.deleted_at IS NULL
        AND ${ACCOMMODATION_OCCUPANCY_FITS_SQL}
        AND NOT EXISTS (
          SELECT 1 FROM availability_search_dates sd
          LEFT JOIN availability_calendar ac ON ac.bookable_unit_id = bu.id AND ac.date = sd.d
          LEFT JOIN availability_statuses ast ON ast.id = ac.status_id
          WHERE sd.d <= IF(but.code IN (${ACCOMMODATION_TYPE_PLACEHOLDERS}), ?, ?)
            AND (
              COALESCE(ast.code, 'AVAILABLE') = 'BLOCKED'
              OR COALESCE(ac.quantity_available, bu.capacity)
                 -- Step L6.3B: rooms held by hourly stays that date are
                 -- not free for the night either — the busiest hour, the
                 -- same peak a nightly hold subtracts. Half-open
                 -- intervals peak at some reservation's own start time.
                 - (
                   SELECT COALESCE(MAX((
                     SELECT SUM(hs.quantity) FROM hourly_inventory_reservations hs
                     WHERE hs.bookable_unit_id = hr.bookable_unit_id
                       AND hs.date = hr.date AND hs.released_at IS NULL
                       AND hs.start_time <= hr.start_time
                       AND hs.end_time > hr.start_time
                   )), 0)
                   FROM hourly_inventory_reservations hr
                   WHERE hr.bookable_unit_id = bu.id AND hr.date = sd.d
                     AND hr.released_at IS NULL
                 )
                 < IF(but.code IN (${INVENTORY_QUANTITY_TYPE_PLACEHOLDERS}), ?, ?)
            )
        )
        -- Mirrors MySqlBlackoutRepository's established
        -- bookable_unit_id IS NULL (listing-level veto) convention
        -- exactly; the same per-unit-type date bound as above so an
        -- accommodation unit's checkout morning is never wrongly
        -- vetoed by a blackout that starts fresh that same day.
        AND NOT EXISTS (
          SELECT 1 FROM blackout_dates bd
          WHERE bd.listing_id = l.id AND bd.bookable_unit_id IS NULL
            AND bd.date_from <= IF(but.code IN (${ACCOMMODATION_TYPE_PLACEHOLDERS}), ?, ?)
            AND bd.date_to >= ?
        )
      )
    `);
    innerParams.push(
      ...ACCOMMODATION_BOOKABLE_UNIT_TYPES,
      availabilityGuests,
      ...ACCOMMODATION_BOOKABLE_UNIT_TYPES,
      availabilityLastNight,
      availabilityDateTo,
      ...INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES,
      SEARCH_REQUESTED_QUANTITY,
      availabilityGuests,
      ...ACCOMMODATION_BOOKABLE_UNIT_TYPES,
      availabilityLastNight,
      availabilityDateTo,
      availabilityDateFrom,
    );
  } else if (occupancyGuests !== undefined) {
    // A party size with no dates: no calendar to consult, so only "could
    // one unit ever hold this party". Same per-type split as the dated
    // block above, with the unit's static `capacity` standing in for a
    // date's `quantity_available`: accommodation checks `max_guests`;
    // inventory-quantity types (rooms, tables, vehicles) never compare
    // capacity to the party; every other type (TOUR_DEPARTURE seats)
    // needs `capacity` for the whole party.
    innerConditions.push(`
      EXISTS (
        SELECT 1 FROM bookable_units bu
        JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id
        WHERE bu.listing_id = l.id AND bu.deleted_at IS NULL
        AND ${ACCOMMODATION_OCCUPANCY_FITS_SQL}
        AND (
          but.code IN (${INVENTORY_QUANTITY_TYPE_PLACEHOLDERS})
          OR bu.capacity >= ?
        )
      )
    `);
    innerParams.push(
      ...ACCOMMODATION_BOOKABLE_UNIT_TYPES,
      occupancyGuests,
      ...INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES,
      occupancyGuests,
    );
  }

  const hasKeyword = Boolean(keyword);
  const matchExpression =
    'MATCH(lt.title, lt.description) AGAINST (? IN NATURAL LANGUAGE MODE)';
  const relevanceSelect = hasKeyword
    ? `${matchExpression} AS relevance_score`
    : 'NULL AS relevance_score';
  if (hasKeyword) {
    innerParams.push(keyword);
    innerConditions.push(`${matchExpression} > 0`);
  }
  // Placeholders must be bound in the exact left-to-right physical order
  // they appear in `innerSql`: the SELECT clause's `relevanceSelect`
  // placeholder comes first (it's written before FROM), then the two
  // JOIN ... language_id placeholders, then the WHERE clause's
  // placeholders in `innerConditions` push order (which includes a
  // second copy of `keyword`, for the WHERE's `matchExpression > 0`).
  const selectKeywordParam = hasKeyword ? [keyword] : [];

  // The recursive CTE's own two params (`dateFrom`, `dateTo`) bind
  // before every other placeholder in the query, since its `WITH
  // RECURSIVE` text is physically the first thing in `innerSql`. Always
  // the FULL requested range (never pre-collapsed to `lastNight`) since
  // the per-unit-type checkout-exclusive/inclusive split now happens
  // inside the per-unit EXISTS above, not at the date-series level —
  // a non-accommodation unit needs `dateTo` itself in the series too.
  const availabilityCteParams = hasAvailabilityFilter
    ? [availabilityDateFrom, availabilityDateTo]
    : [];
  const availabilityCtePrefix = hasAvailabilityFilter
    ? `
    WITH RECURSIVE availability_search_dates AS (
      SELECT ? AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM availability_search_dates WHERE d < ?
    )
  `
    : '';

  const innerSql = `
    ${availabilityCtePrefix}
    SELECT
      l.id, l.partner_id, l.created_at,
      -- Listing Lifetime / Renewal, Step B5: always selected (cheap, and
      -- selecting them here is not the leak boundary -- toSearchResultDomain
      -- below always maps them onto the domain object too, same as
      -- mysqlListingRepository.js's own LISTING_SELECT_COLUMNS precedent).
      -- The actual public/owner split happens once, at the DTO layer
      -- (searchDto.js's toSearchResultResponse vs. toOwnerSearchResultResponse),
      -- never here.
      l.publication_period_days, l.expires_at, l.frozen_at, l.purge_after, l.renewed_at,
      ltype.code AS listing_type_code,
      ls.code AS status_code,
      l.slug,
      COALESCE(lt.title, lt2.title, '') AS title,
      COALESCE(lt.summary, lt2.summary) AS summary,
      -- The city in the visitor's language: requested, then default, then
      -- the canonical name (the same fallback GET /search/destinations uses).
      loc.city_id, COALESCE(ct.name, ct2.name, c.name) AS city_name, r.country_id,
      -- The listing's own stored point and whether its category is shown
      -- only approximately; the outer layer derives the public map point.
      loc.latitude, loc.longitude,
      ${APPROXIMATE_LOCATION_SQL} AS is_location_approximate,
      m.url AS cover_image_url,
      -- P2.2D: a "from" price -- the cheapest real per-unit base price
      -- (P2.2A) when the listing's priced units all share one currency.
      --
      -- The listing-level listing_pricing fallback is deliberately
      -- gated by a "does this listing have ANY priced unit at all" EXISTS
      -- check, not merely COALESCE'd in whenever the MIN subquery is
      -- NULL. Per accommodationPriceResolution.js#resolvePriceForDate
      -- (the same precedence booking-time actually charges), a unit's
      -- own base price always outranks the listing fallback for THAT
      -- unit -- so if a listing's units already carry base prices, just
      -- priced in more than one currency, listing_pricing would never
      -- actually be charged for booking any of them. Showing it anyway
      -- would display a price checkout cannot produce for this listing's
      -- real units -- correctness bug, not a display nuance. The
      -- fallback is only valid when NO unit has a base price at all
      -- (rung 2 genuinely absent for every unit, so rung 3 is what
      -- booking-time would actually resolve to). Both subqueries share
      -- the identical WHERE/HAVING/EXISTS scope, so amount and currency
      -- always come from the same set of rows, never mixed.
      COALESCE(
        (SELECT MIN(bu_price.base_price_amount)
           FROM bookable_units bu_price
           WHERE bu_price.listing_id = l.id AND bu_price.deleted_at IS NULL
             AND bu_price.base_price_amount IS NOT NULL
           HAVING COUNT(DISTINCT bu_price.base_price_currency_id) = 1
        ),
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM bookable_units bu_any_price
            WHERE bu_any_price.listing_id = l.id AND bu_any_price.deleted_at IS NULL
              AND bu_any_price.base_price_amount IS NOT NULL
          ) THEN lp.amount
        END
      ) AS price_amount,
      COALESCE(
        -- MAX(), not GROUP BY: a GROUP BY on code would let the HAVING
        -- guard pass once per distinct currency instead of once for the
        -- whole listing (each single-currency group trivially satisfies
        -- "1 distinct currency" on its own), which is exactly backwards
        -- and can return more than one row. Aggregating over the whole
        -- unfiltered set means MAX() only ever sees the single shared
        -- code once HAVING has already confirmed there's just one.
        (SELECT MAX(cur_price.code)
           FROM bookable_units bu_price
           JOIN currencies cur_price ON cur_price.id = bu_price.base_price_currency_id
           WHERE bu_price.listing_id = l.id AND bu_price.deleted_at IS NULL
             AND bu_price.base_price_amount IS NOT NULL
           HAVING COUNT(DISTINCT bu_price.base_price_currency_id) = 1
        ),
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM bookable_units bu_any_price2
            WHERE bu_any_price2.listing_id = l.id AND bu_any_price2.deleted_at IS NULL
              AND bu_any_price2.base_price_amount IS NOT NULL
          ) THEN cur.code
        END
      ) AS price_currency_code,
      (SELECT COUNT(*) FROM media gm
         WHERE gm.mediable_type = 'listing' AND gm.mediable_id = l.id AND gm.deleted_at IS NULL
      ) AS media_count,
      (SELECT AVG(rv.rating) FROM reviews rv
         JOIN moderation_statuses rs ON rs.id = rv.status_id
         WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
      ) AS rating_average,
      (SELECT COUNT(*) FROM reviews rv
         JOIN moderation_statuses rs ON rs.id = rv.status_id
         WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
      ) AS review_count,
      ${CARD_METADATA_SELECT},
      ${relevanceSelect}
    FROM listings l
    JOIN listing_types ltype ON ltype.id = l.listing_type_id
    JOIN listing_statuses ls ON ls.id = l.status_id
    LEFT JOIN listing_locations loc ON loc.listing_id = l.id
    LEFT JOIN cities c ON c.id = loc.city_id
    LEFT JOIN regions r ON r.id = c.region_id
    LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = ?
    LEFT JOIN listing_translations lt2 ON lt2.listing_id = l.id AND lt2.language_id = ?
    LEFT JOIN city_translations ct ON ct.city_id = c.id AND ct.language_id = ?
    LEFT JOIN city_translations ct2 ON ct2.city_id = c.id AND ct2.language_id = ?
    LEFT JOIN media m ON m.mediable_type = 'listing' AND m.mediable_id = l.id AND m.is_cover = 1 AND m.deleted_at IS NULL
    LEFT JOIN listing_pricing lp ON lp.listing_id = l.id
    LEFT JOIN currencies cur ON cur.id = lp.currency_id
    ${categoryId !== undefined ? 'LEFT JOIN listing_category_listing lcl ON lcl.listing_id = l.id' : ''}
    WHERE ${innerConditions.join(' AND ')}
  `;

  // One more derived-table layer, so the base-currency price and its two
  // never-NULL sort keys become real columns the price filter, the price
  // sorts and their keyset cursor can all reference by name.
  const pricedResultsSql = `
    SELECT base.*,
      ${BASE_PRICE_SQL} AS price_amount_base,
      COALESCE(${BASE_PRICE_SQL}, ${UNPRICED_SORT_KEY_ASC}) AS price_sort_asc,
      COALESCE(${BASE_PRICE_SQL}, ${UNPRICED_SORT_KEY_DESC}) AS price_sort_desc,
      COALESCE(base.rating_average, ${UNRATED_SORT_KEY}) AS rating_sort,
      ${MAP_POINT_SQL}
    FROM (${innerSql}) AS base
  `;

  // Filters on the computed price (shared by the page and the count);
  // the keyset cursor is page-only.
  const filterConditions = [];
  const filterParams = [];
  if (priceMin !== undefined) {
    filterConditions.push('results.price_amount_base >= ?');
    filterParams.push(priceMin);
  }
  if (priceMax !== undefined) {
    filterConditions.push('results.price_amount_base <= ?');
    filterParams.push(priceMax);
  }
  // Approved-review average; a listing with no approved review never
  // matches a rating bound.
  if (ratingMin !== undefined) {
    filterConditions.push('results.rating_average >= ?');
    filterParams.push(ratingMin);
  }
  // "Search this area": the listing's PUBLIC map point inside the
  // committed area — the point the map shows, so List and Map agree, and a
  // private stay's real point can't be found by probing with tiny areas.
  // A listing without coordinates can never be inside an area.
  if (bbox !== undefined) {
    filterConditions.push(
      'results.map_latitude BETWEEN ? AND ? AND results.map_longitude BETWEEN ? AND ?',
    );
    filterParams.push(bbox.south, bbox.north, bbox.west, bbox.east);
  }

  return {
    pricedResultsSql,
    filterConditions,
    // Physical placeholder order: the CTE, the SELECT's relevance match,
    // the title translation joins, the city translation joins, the WHERE
    // predicates, then the outer price/rating filters.
    filteredParams: [
      ...availabilityCteParams,
      ...selectKeywordParam,
      localeId,
      defaultLocaleId,
      localeId,
      defaultLocaleId,
      ...innerParams,
      ...filterParams,
    ],
  };
}

function toWhere(conditions) {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * The List page of a search: `buildSearchResultSet`'s rows, keyset
 * paginated, plus the count of the whole filtered result set.
 *
 * @param {object} filters - see `buildSearchResultSet`
 * @param {{key: string, column: string, direction: 'ASC'|'DESC'}} sort
 * @param {{cursor?: string|null, limit?: number}} [paginationOpts]
 * @returns {{sql: string, params: any[], limit: number, countSql: string, countParams: any[]}}
 */
export function buildSearchListingsQuery(
  filters,
  sort,
  { cursor = null, limit = 20 } = {},
) {
  const { pricedResultsSql, filterConditions, filteredParams } =
    buildSearchResultSet(filters);

  const pageConditions = [...filterConditions];
  const cursorParams = [];
  const decoded = decodeCursor(cursor);
  if (decoded && decoded.sortValue !== undefined && decoded.id !== undefined) {
    const operator = sort.direction === 'DESC' ? '<' : '>';
    pageConditions.push(
      `(results.${sort.column}, results.id) ${operator} (?, ?)`,
    );
    cursorParams.push(fromCursorSortValue(decoded.sortValue), decoded.id);
  }

  const sql = `
    SELECT * FROM (${pricedResultsSql}) AS results
    ${toWhere(pageConditions)}
    ORDER BY results.${sort.column} ${sort.direction}, results.id ${sort.direction}
    LIMIT ?
  `;
  const params = [...filteredParams, ...cursorParams, limit + 1];

  // The whole filtered result set's size, for an honest "N results"
  // summary — the page query alone only knows whether one more row exists.
  const countSql = `
    SELECT COUNT(*) AS total FROM (${pricedResultsSql}) AS results
    ${toWhere(filterConditions)}
  `;

  return { sql, params, limit, countSql, countParams: filteredParams };
}

/** The marker fields — never the full card, let alone the listing detail. */
const MAP_COLUMNS = [
  'id',
  'slug',
  'title',
  'listing_type_code',
  'category_slug',
  'city_name',
  'map_latitude',
  'map_longitude',
  'is_location_approximate',
  'cover_image_url',
  'price_amount',
  'price_currency_code',
  'pricing_model_code',
  'rating_average',
  'review_count',
  'star_rating_code',
  'cuisine_codes',
  'price_tier_code',
  'transmission_code',
  'bedrooms_value',
  'duration_minutes_value',
]
  .map((column) => `results.${column}`)
  .join(', ');

/**
 * Map Search: the SAME filtered result set the List pages through — every
 * predicate comes from `buildSearchResultSet`, none is restated here — as
 * lightweight marker rows for every match that has a stored point, in the
 * List's own sort order, up to `limit`. The count reports the whole match
 * and how much of it can be placed on the map, so a capped or partly
 * unmappable result is never silently presented as complete.
 *
 * @param {object} filters - see `buildSearchResultSet`
 * @param {{key: string, column: string, direction: 'ASC'|'DESC'}} sort
 * @param {{limit: number}} options
 * @returns {{sql: string, params: any[], countSql: string, countParams: any[]}}
 */
export function buildSearchMapQuery(filters, sort, { limit }) {
  const { pricedResultsSql, filterConditions, filteredParams } =
    buildSearchResultSet(filters);
  const mappable =
    'results.latitude IS NOT NULL AND results.longitude IS NOT NULL';

  const sql = `
    SELECT ${MAP_COLUMNS} FROM (${pricedResultsSql}) AS results
    ${toWhere([...filterConditions, mappable])}
    ORDER BY results.${sort.column} ${sort.direction}, results.id ${sort.direction}
    LIMIT ?
  `;
  const countSql = `
    SELECT COUNT(*) AS total, COALESCE(SUM(${mappable}), 0) AS mappable
    FROM (${pricedResultsSql}) AS results
    ${toWhere(filterConditions)}
  `;
  return {
    sql,
    params: [...filteredParams, limit],
    countSql,
    countParams: filteredParams,
  };
}

export class MySqlSearchRepository {
  #pool;

  constructor(pool = getMysqlPool()) {
    this.#pool = pool;
  }

  /**
   * Resolves a requested `?locale=` code (may be absent/unknown) plus the
   * platform default (`languages.is_default`) to their ids, for
   * `SearchService` to scope translation joins with. A narrow, scoped
   * lookup living here rather than in a dedicated localization repository
   * — the same precedent as `MySqlListingRepository.getPartnerVerification`
   * (Sprint 7): no module owns general `languages` lookups yet, and this
   * is the only caller.
   *
   * @param {string} [requestedCode]
   * @returns {Promise<{localeId: number|null, defaultLocaleId: number|null}>}
   */
  async resolveLocaleIds(requestedCode) {
    const [[defaultLanguage]] = await this.#pool.query(
      'SELECT id FROM languages WHERE is_default = 1 LIMIT 1',
    );
    const defaultLocaleId = defaultLanguage?.id ?? null;

    if (!requestedCode) {
      return { localeId: defaultLocaleId, defaultLocaleId };
    }

    const [[requestedLanguage]] = await this.#pool.query(
      'SELECT id FROM languages WHERE code = ? LIMIT 1',
      [requestedCode],
    );
    return {
      localeId: requestedLanguage?.id ?? defaultLocaleId,
      defaultLocaleId,
    };
  }

  /**
   * @param {object} filters - see `buildSearchListingsQuery`
   * @param {{key: string, column: string, direction: 'ASC'|'DESC'}} sort -
   *   from `core/domain/sortOptions.js`; `column`/`id` always share
   *   `direction` (see the module header) so keyset pagination stays a
   *   plain tuple comparison.
   * @param {{cursor?: string|null, limit?: number}} paginationOpts
   */
  async searchListings(filters, sort, paginationOpts = {}) {
    const { sql, params, limit, countSql, countParams } =
      buildSearchListingsQuery(filters, sort, paginationOpts);
    // `meta.total` is computed for the first page only — a "Load more"
    // page reuses the total its first page already reported, so it never
    // pays for the count again.
    const isFirstPage = !paginationOpts.cursor;
    const [[rows], countResult] = await Promise.all([
      this.#pool.query(sql, params),
      isFirstPage ? this.#pool.query(countSql, countParams) : null,
    ]);

    const { rows: pageRows, meta } = buildPageMeta(rows, limit, (row) => ({
      sortValue: toCursorSortValue(row[sort.column]),
      id: row.id,
    }));
    const pageMeta = countResult
      ? { ...meta, total: Number(countResult[0][0].total) }
      : meta;
    return { rows: pageRows.map(toSearchResultDomain), meta: pageMeta };
  }

  /**
   * Map Search — the same filtered result set as `searchListings`, as
   * markers (see `buildSearchMapQuery`).
   *
   * @param {object} filters - see `buildSearchListingsQuery`
   * @param {{key: string, column: string, direction: 'ASC'|'DESC'}} sort
   * @param {{limit: number}} options
   * @returns {Promise<{rows: object[], meta: {total: number, mappable: number, returned: number, truncated: boolean}}>}
   */
  async searchMap(filters, sort, { limit }) {
    const { sql, params, countSql, countParams } = buildSearchMapQuery(
      filters,
      sort,
      { limit },
    );
    const [[rows], [[counts]]] = await Promise.all([
      this.#pool.query(sql, params),
      this.#pool.query(countSql, countParams),
    ]);
    const mappable = Number(counts.mappable);
    return {
      rows: rows.map(toSearchMapDomain),
      meta: {
        total: Number(counts.total),
        mappable,
        returned: rows.length,
        truncated: rows.length < mappable,
      },
    };
  }

  /**
   * Sprint E (Promotion Engine): the same card shape `searchListings`
   * already produces (title/cover/price/rating/review_count), for an
   * explicit small set of ids — `SearchService#getListingsByIds`'s only
   * caller is `AdvertisementService`'s public Home/Category-TOP
   * endpoints. Deliberately NOT a slice of `buildSearchListingsQuery`
   * (no keyword/attribute/availability filtering, no cursor pagination
   * needed for a handful of promoted listings) — a smaller, standalone
   * query reusing the identical join/column shape instead. Always scoped
   * to published + not-soft-deleted, matching `onlyPublished`'s existing
   * anonymous-visibility rule elsewhere in this repository. Returns rows
   * in NO particular order — the caller re-sorts to its own priority
   * order (an `IN (...)` list guarantees nothing about row order).
   */
  async searchListingsByIds(listingIds, { localeId, defaultLocaleId }) {
    if (listingIds.length === 0) return [];
    const placeholders = listingIds.map(() => '?').join(', ');
    const [rows] = await this.#pool.query(
      `
      SELECT
        l.id, l.partner_id, l.created_at,
        ltype.code AS listing_type_code,
        ls.code AS status_code,
        l.slug,
        COALESCE(lt.title, lt2.title, '') AS title,
        COALESCE(lt.summary, lt2.summary) AS summary,
        loc.city_id, COALESCE(ct.name, ct2.name, c.name) AS city_name, r.country_id,
        m.url AS cover_image_url,
        COALESCE(
          (SELECT MIN(bu_price.base_price_amount)
             FROM bookable_units bu_price
             WHERE bu_price.listing_id = l.id AND bu_price.deleted_at IS NULL
               AND bu_price.base_price_amount IS NOT NULL
             HAVING COUNT(DISTINCT bu_price.base_price_currency_id) = 1
          ),
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM bookable_units bu_any_price
              WHERE bu_any_price.listing_id = l.id AND bu_any_price.deleted_at IS NULL
                AND bu_any_price.base_price_amount IS NOT NULL
            ) THEN lp.amount
          END
        ) AS price_amount,
        COALESCE(
          (SELECT MAX(cur_price.code)
             FROM bookable_units bu_price
             JOIN currencies cur_price ON cur_price.id = bu_price.base_price_currency_id
             WHERE bu_price.listing_id = l.id AND bu_price.deleted_at IS NULL
               AND bu_price.base_price_amount IS NOT NULL
             HAVING COUNT(DISTINCT bu_price.base_price_currency_id) = 1
          ),
          CASE
            WHEN NOT EXISTS (
              SELECT 1 FROM bookable_units bu_any_price2
              WHERE bu_any_price2.listing_id = l.id AND bu_any_price2.deleted_at IS NULL
                AND bu_any_price2.base_price_amount IS NOT NULL
            ) THEN cur.code
          END
        ) AS price_currency_code,
        (SELECT COUNT(*) FROM media gm
           WHERE gm.mediable_type = 'listing' AND gm.mediable_id = l.id AND gm.deleted_at IS NULL
        ) AS media_count,
        (SELECT AVG(rv.rating) FROM reviews rv
           JOIN moderation_statuses rs ON rs.id = rv.status_id
           WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
        ) AS rating_average,
        (SELECT COUNT(*) FROM reviews rv
           JOIN moderation_statuses rs ON rs.id = rv.status_id
           WHERE rv.listing_id = l.id AND rs.code = 'APPROVED' AND rv.deleted_at IS NULL
        ) AS review_count,
        ${CARD_METADATA_SELECT}
      FROM listings l
      JOIN listing_types ltype ON ltype.id = l.listing_type_id
      JOIN listing_statuses ls ON ls.id = l.status_id
      LEFT JOIN listing_locations loc ON loc.listing_id = l.id
      LEFT JOIN cities c ON c.id = loc.city_id
      LEFT JOIN regions r ON r.id = c.region_id
      LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = ?
      LEFT JOIN listing_translations lt2 ON lt2.listing_id = l.id AND lt2.language_id = ?
      LEFT JOIN city_translations ct ON ct.city_id = c.id AND ct.language_id = ?
      LEFT JOIN city_translations ct2 ON ct2.city_id = c.id AND ct2.language_id = ?
      LEFT JOIN media m ON m.mediable_type = 'listing' AND m.mediable_id = l.id AND m.is_cover = 1 AND m.deleted_at IS NULL
      LEFT JOIN listing_pricing lp ON lp.listing_id = l.id
      LEFT JOIN currencies cur ON cur.id = lp.currency_id
      WHERE ${scopeActive('l')} AND ${scopePubliclyVisibleListing()} AND l.id IN (${placeholders})
      `,
      [localeId, defaultLocaleId, localeId, defaultLocaleId, ...listingIds],
    );
    return rows.map(toSearchResultDomain);
  }

  /** Bounded, ungrouped taxonomy (a few dozen rows) — no pagination needed. */
  async searchCategories({ localeId, defaultLocaleId }) {
    const [rows] = await this.#pool.query(
      `
      SELECT
        cat.id, cat.parent_id, cat.slug,
        COALESCE(ct.name, ct2.name, cat.name) AS name,
        COUNT(DISTINCT CASE WHEN ${scopePubliclyVisibleListing()} AND l.deleted_at IS NULL THEN l.id END) AS listing_count
      FROM listing_categories cat
      LEFT JOIN listing_category_translations ct ON ct.listing_category_id = cat.id AND ct.language_id = ?
      LEFT JOIN listing_category_translations ct2 ON ct2.listing_category_id = cat.id AND ct2.language_id = ?
      LEFT JOIN listing_category_listing lcl ON lcl.category_id = cat.id
      LEFT JOIN listings l ON l.id = lcl.listing_id
      LEFT JOIN listing_statuses ls ON ls.id = l.status_id
      GROUP BY cat.id, cat.parent_id, cat.slug, name
      ORDER BY name ASC
      LIMIT 200
      `,
      [localeId, defaultLocaleId],
    );
    return rows.map(toCategoryResultDomain);
  }

  /**
   * Phase 20 (SEO) — real seeded cities, each with a published-listing
   * count, backing the new destination landing pages. Mirrors
   * `searchCategories`'s exact join/translation-fallback shape for the
   * city equivalent (`cities`/`city_translations` instead of
   * `listing_categories`/`listing_category_translations`).
   *
   * With `categoryId`, each count is that category's publicly visible
   * listings in the city — what Search's destination picker shows once a
   * category is chosen, so a count always matches the results it leads to.
   */
  async searchDestinations({ localeId, defaultLocaleId, categoryId }) {
    const categoryCondition =
      categoryId !== undefined
        ? `AND EXISTS (SELECT 1 FROM listing_category_listing lcl_dest
             WHERE lcl_dest.listing_id = l.id AND lcl_dest.category_id = ?)`
        : '';
    const [rows] = await this.#pool.query(
      `
      SELECT
        city.id, city.slug, city.latitude, city.longitude,
        COALESCE(ct.name, ct2.name, city.name) AS name,
        COUNT(DISTINCT CASE WHEN ${scopePubliclyVisibleListing()} AND l.deleted_at IS NULL ${categoryCondition} THEN l.id END) AS listing_count
      FROM cities city
      LEFT JOIN city_translations ct ON ct.city_id = city.id AND ct.language_id = ?
      LEFT JOIN city_translations ct2 ON ct2.city_id = city.id AND ct2.language_id = ?
      LEFT JOIN listing_locations loc ON loc.city_id = city.id
      LEFT JOIN listings l ON l.id = loc.listing_id
      LEFT JOIN listing_statuses ls ON ls.id = l.status_id
      GROUP BY city.id, city.slug, city.latitude, city.longitude, name
      ORDER BY name ASC
      LIMIT 200
      `,
      categoryId !== undefined
        ? [categoryId, localeId, defaultLocaleId]
        : [localeId, defaultLocaleId],
    );
    return rows.map(toDestinationResultDomain);
  }

  /**
   * Typeahead suggestions — `LIKE` prefix match, not FULLTEXT (FULLTEXT's
   * minimum-word-length floor drops short prefixes like "ho"), mirroring
   * `GET /cities/search?q=`'s documented convention
   * (`API_SPECIFICATION.md` §36). Published, non-deleted, non-expired
   * listings only (Step B4) — a public typeahead must never suggest a
   * draft's title, and never an expired listing's either.
   */
  async suggest(query, { localeId, defaultLocaleId }, limit = 10) {
    const prefix = `${query}%`;
    const [rows] = await this.#pool.query(
      `
      SELECT DISTINCT l.id, COALESCE(lt.title, lt2.title) AS title, l.slug
      FROM listings l
      JOIN listing_statuses ls ON ls.id = l.status_id
      LEFT JOIN listing_translations lt ON lt.listing_id = l.id AND lt.language_id = ?
      LEFT JOIN listing_translations lt2 ON lt2.listing_id = l.id AND lt2.language_id = ?
      WHERE ${scopeActive('l')} AND ${scopePubliclyVisibleListing()} AND (lt.title LIKE ? OR lt2.title LIKE ?)
      ORDER BY title ASC
      LIMIT ?
      `,
      [localeId, defaultLocaleId, prefix, prefix, limit],
    );
    return rows.map(toSuggestionDomain);
  }

  /**
   * Resolves a free-text destination string (e.g. "Yerevan") to a real
   * `cities` row — Stage 15.1 (AI Trip Planner)'s grounding step: a
   * destination the AI provider is never trusted to invent a city id for
   * itself. `LIKE` prefix match (not FULLTEXT), the same convention
   * `suggest()` above already uses for short free-text input.
   *
   * @param {string} query
   * @returns {Promise<{id: number, name: string}|null>}
   */
  async findCityByName(query) {
    const [rows] = await this.#pool.query(
      `SELECT id, name FROM cities WHERE name LIKE ? ORDER BY name ASC LIMIT 1`,
      [`${query}%`],
    );
    return rows[0] ?? null;
  }

  /**
   * Resolves `attr_{code}` query keys to their attribute definition id,
   * data type and the categories it belongs to (`category_attributes`),
   * so `SearchService` can build `attributeFilters` entries — and drop an
   * attribute that does not belong to the searched category — without
   * hand-rolling SQL of its own. Unknown codes are simply absent from the
   * returned Map — `SearchService` drops them rather than erroring, the
   * same "narrow, don't leak" tolerance as an unknown `?locale=`.
   *
   * @param {string[]} codes
   * @returns {Promise<Map<string, {id: number, dataTypeCode: string, categoryIds: number[]}>>}
   */
  async getAttributeDefinitionsByCode(codes) {
    if (codes.length === 0) {
      return new Map();
    }
    const [rows] = await this.#pool.query(
      `SELECT ad.code, ad.id, adt.code AS data_type_code,
         GROUP_CONCAT(ca.category_id) AS category_ids
       FROM attribute_definitions ad
       JOIN attribute_data_types adt ON adt.id = ad.data_type_id
       LEFT JOIN category_attributes ca ON ca.attribute_definition_id = ad.id
       WHERE ad.code IN (?)
       GROUP BY ad.code, ad.id, adt.code`,
      [codes],
    );
    return new Map(
      rows.map((row) => [
        row.code,
        {
          id: row.id,
          dataTypeCode: row.data_type_code,
          categoryIds: toIdArray(row.category_ids),
        },
      ]),
    );
  }

  /**
   * Resolves `policy_{code}` query keys to filterable policy definitions
   * (ENUM/BOOLEAN — see `core/domain/searchComputedFilters.js`), their
   * option codes and the categories they apply to (`category_policies`).
   *
   * @param {string[]} codes
   * @returns {Promise<Map<string, {id: number, dataTypeCode: string, optionCodes: string[], categoryIds: number[]}>>}
   */
  async getPolicyDefinitionsByCode(codes) {
    if (codes.length === 0) {
      return new Map();
    }
    const [rows] = await this.#pool.query(
      `SELECT pd.code, pd.id, adt.code AS data_type_code,
         (SELECT GROUP_CONCAT(po.code) FROM policy_options po
            WHERE po.policy_definition_id = pd.id) AS option_codes,
         (SELECT GROUP_CONCAT(cp.category_id) FROM category_policies cp
            WHERE cp.policy_definition_id = pd.id) AS category_ids
       FROM policy_definitions pd
       JOIN attribute_data_types adt ON adt.id = pd.data_type_id
       WHERE pd.code IN (?) AND adt.code IN (?)`,
      [codes, FILTERABLE_POLICY_DATA_TYPES],
    );
    return new Map(
      rows.map((row) => [
        row.code,
        {
          id: row.id,
          dataTypeCode: row.data_type_code,
          optionCodes: row.option_codes ? row.option_codes.split(',') : [],
          categoryIds: toIdArray(row.category_ids),
        },
      ]),
    );
  }

  /**
   * `GET /search/filters`'s catalog — see `searchFilterCatalog.js`.
   *
   * @param {number|undefined} categoryId
   * @param {{localeId: number|null, defaultLocaleId: number|null}} locale
   */
  async getFilterDefinitions(categoryId, { localeId, defaultLocaleId }) {
    return loadSearchFilterCatalog(this.#pool, {
      categoryId,
      localeId,
      defaultLocaleId,
    });
  }
}

export default MySqlSearchRepository;

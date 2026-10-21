/**
 * Search module Zod validators (Layer 2, BACKEND_ARCHITECTURE.md §10) —
 * structural/format validation only. `status`/`sort` are validated
 * against the real, reused domain enums (`LISTING_STATUSES`/`SORT_KEYS`)
 * rather than re-declared string literals, so a future new status/sort
 * option can't silently drift out of sync between the two files.
 * Business-rule validation (visibility narrowing, locale resolution)
 * lives in `SearchService`, never here.
 */

import { z } from 'zod';
import { isoDateSchema } from '../../../validation/isoDate.js';
import { MEAL_PLANS } from '../../../core/domain/roomAttributes.js';
import {
  POLICY_PARAM_PREFIX,
  ROOM_PARAM_PREFIX,
  ROOM_FILTERS,
  TOGGLE_ON_VALUE,
  RATING_MIN,
  RATING_MAX,
} from '../../../core/domain/searchComputedFilters.js';
import { LISTING_STATUSES } from '../../../core/domain/listingStatusTransitions.js';
import { parseBoundingBox } from '../../../core/domain/searchMap.js';
import {
  SORT_KEYS,
  DEFAULT_SORT_KEY,
} from '../../../core/domain/sortOptions.js';

const passthroughParams = z.object({}).passthrough();

const paginationShape = {
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
};

/** Price bounds are whole AMD amounts (the platform's one authored currency); the ceiling only rejects absurd input, never a real price. */
export const SEARCH_PRICE_MAX_AMD = 1_000_000_000;

const priceBoundSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(SEARCH_PRICE_MAX_AMD)
  .optional();

const RATING_STEP = 0.5;

/**
 * Structural shapes for the passthrough keys `SearchService` resolves
 * against its registries: a `_min`/`_max` bound is a number or a real
 * calendar date (DATE attributes); every option list (`attr_{code}`,
 * `amenityIds`) is comma-separated positive ids; a `policy_{code}` is an
 * option-code list or `true`; `room_*` is a closed set (meal plans,
 * hourly stays). Anything else (`abc`, `2026-02-30`, an unknown `room_*`,
 * a repeated key arriving as an array) is a 422 here, never a value the
 * query builder could fail on.
 */
const ATTRIBUTE_BOUND_KEY_PATTERN = /^attr_.+_(min|max)$/;
const ATTRIBUTE_KEY_PATTERN = /^attr_/;
const POLICY_KEY_PATTERN = new RegExp(
  `^${POLICY_PARAM_PREFIX}[a-z][a-z0-9_]*$`,
);
const ID_LIST_PATTERN = /^\d+(,\d+)*$/;
const CODE_LIST_PATTERN = /^[A-Z0-9_]+(,[A-Z0-9_]+)*$/;
const NUMERIC_BOUND_PATTERN = /^-?\d+(\.\d+)?$/;

const ROOM_PARAM_RULES = {
  [`${ROOM_PARAM_PREFIX}${ROOM_FILTERS.MEAL_PLAN}`]: (value) =>
    CODE_LIST_PATTERN.test(value) &&
    value.split(',').every((code) => MEAL_PLANS.includes(code)),
  [`${ROOM_PARAM_PREFIX}${ROOM_FILTERS.HOURLY_STAYS}`]: (value) =>
    value === TOGGLE_ON_VALUE,
};

function isValidPolicyParam(key, value) {
  return (
    POLICY_KEY_PATTERN.test(key) &&
    typeof value === 'string' &&
    (value === TOGGLE_ON_VALUE || CODE_LIST_PATTERN.test(value))
  );
}

function isValidRoomParam(key, value) {
  const rule = ROOM_PARAM_RULES[key];
  return Boolean(rule) && typeof value === 'string' && rule(value);
}

function isValidAttributeBound(value) {
  return (
    typeof value === 'string' &&
    (NUMERIC_BOUND_PATTERN.test(value) ||
      isoDateSchema.safeParse(value).success)
  );
}

function isValidIdList(value) {
  return typeof value === 'string' && ID_LIST_PATTERN.test(value);
}

function validateDynamicFilterKeys(data, ctx) {
  Object.entries(data).forEach(([key, value]) => {
    let valid = true;
    if (ATTRIBUTE_BOUND_KEY_PATTERN.test(key)) {
      valid = isValidAttributeBound(value);
    } else if (ATTRIBUTE_KEY_PATTERN.test(key) || key === 'amenityIds') {
      valid = isValidIdList(value);
    } else if (key.startsWith(POLICY_PARAM_PREFIX)) {
      valid = isValidPolicyParam(key, value);
    } else if (key.startsWith(ROOM_PARAM_PREFIX)) {
      valid = isValidRoomParam(key, value);
    }
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key] });
    }
  });
}

export const searchListingsQuerySchema = z.object({
  params: passthroughParams,
  // `.passthrough()`: generic `attr_{code}` / `attr_{code}_min` /
  // `attr_{code}_max` keys aren't individually declared here — the set of
  // attribute codes is data (`attribute_definitions`), not a fixed enum, so
  // `SearchService` validates them against the registry instead (an unknown
  // code is silently dropped, never a 400). Every *fixed* param still gets
  // its own declared, typed check below.
  query: z
    .object({
      keyword: z.string().trim().max(200).optional(),
      categoryId: z.coerce.number().int().positive().optional(),
      listingType: z.string().trim().min(1).max(30).optional(),
      cityId: z.coerce.number().int().positive().optional(),
      countryId: z.coerce.number().int().positive().optional(),
      partnerId: z.coerce.number().int().positive().optional(),
      status: z.enum(LISTING_STATUSES).optional(),
      locale: z.string().trim().min(2).max(10).optional(),
      sort: z.enum(SORT_KEYS).default(DEFAULT_SORT_KEY),
      amenityIds: z.string().trim().min(1).optional(),
      // The card's own "from" price, in AMD — see
      // `mysqlSearchRepository.js`'s price filter for why a listing priced
      // in any other currency never matches a bound.
      priceMin: priceBoundSchema,
      priceMax: priceBoundSchema,
      // Approved-review average, "this or better", in half-star steps.
      ratingMin: z.coerce
        .number()
        .min(RATING_MIN)
        .max(RATING_MAX)
        .multipleOf(RATING_STEP)
        .optional(),
      // The Category page shows active CATEGORY_TOP promotions in their
      // own section above its grid and asks the grid to leave them out.
      // Plain Search never does, so choosing a category can't hide a
      // listing that belongs to it.
      excludeCategoryTop: z
        .enum(['true', 'false'])
        .optional()
        .transform((value) => value === 'true'),
      // Real Inventory Engine availability filtering (Phase 17 §Search
      // integration) — both dates required together, `guests` optional
      // (default 1). `dateFrom === dateTo` is a single-day request (Tour/
      // Activity/Car/Guide-style); `dateFrom < dateTo` is a "stay" request
      // (Hotel/Apartment-style, checked as checkout-exclusive nights) —
      // see `searchService.js#resolveAvailabilityFilter` for why this
      // date-shape-driven split needs no explicit category branching.
      dateFrom: isoDateSchema.optional(),
      dateTo: isoDateSchema.optional(),
      guests: z.coerce.number().int().positive().max(50).optional(),
      // "Search this area": `west,south,east,north` (see searchMap.js).
      // A plain string, so a repeated `bbox` (an array) is rejected too.
      bbox: z
        .string()
        .max(100)
        .refine((value) => parseBoundingBox(value) !== null, {
          message:
            'bbox must be "west,south,east,north" in degrees, with south < north and west < east.',
        })
        .optional(),
      ...paginationShape,
    })
    .passthrough()
    .superRefine(validateDynamicFilterKeys)
    .refine(
      (data) =>
        data.priceMin === undefined ||
        data.priceMax === undefined ||
        data.priceMin <= data.priceMax,
      { message: 'priceMin must not exceed priceMax.', path: ['priceMax'] },
    )
    .refine((data) => Boolean(data.dateFrom) === Boolean(data.dateTo), {
      message: 'dateFrom and dateTo must be provided together.',
      path: ['dateTo'],
    })
    .refine(
      (data) => !data.dateFrom || !data.dateTo || data.dateTo >= data.dateFrom,
      { message: 'dateTo must not be before dateFrom.', path: ['dateTo'] },
    )
    .refine(
      (data) => {
        if (!data.dateFrom || !data.dateTo) return true;
        const spanDays =
          (new Date(`${data.dateTo}T00:00:00Z`) -
            new Date(`${data.dateFrom}T00:00:00Z`)) /
          86_400_000;
        return spanDays <= 90;
      },
      { message: 'Date range must not exceed 90 days.', path: ['dateTo'] },
    ),
  body: z.any(),
});

/**
 * `GET /search/map` takes exactly the List's params — the same filters
 * mean the same listings on both — so it is the same schema; a `cursor`
 * or `limit` sent to it is accepted and has no effect.
 */
export const searchMapQuerySchema = searchListingsQuerySchema;

export const searchCategoriesQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    locale: z.string().trim().min(2).max(10).optional(),
  }),
  body: z.any(),
});

export const searchDestinationsQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    locale: z.string().trim().min(2).max(10).optional(),
    // Scopes each city's listing count to one category (Search's picker).
    categoryId: z.coerce.number().int().positive().optional(),
  }),
  body: z.any(),
});

export const searchSuggestionsQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    q: z.string().trim().max(200).optional(),
    locale: z.string().trim().min(2).max(10).optional(),
  }),
  body: z.any(),
});

export const searchFiltersQuerySchema = z.object({
  params: passthroughParams,
  query: z.object({
    categoryId: z.coerce.number().int().positive().optional(),
    // Amenity labels are localized server-side.
    locale: z.string().trim().min(2).max(10).optional(),
  }),
  body: z.any(),
});

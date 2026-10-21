/**
 * Search URL <-> filter-state translation — the single place that knows
 * how Search state is represented in the URL (FRONTEND_ARCHITECTURE.md's
 * "search filters live in URL search params, must be shareable/
 * bookmarkable" rule). Pure functions only, no React —
 * `useSearchFilters.js` wires these to `useSearchParams()`.
 *
 * The URL is read in two steps:
 *
 * 1. `parseSearchParams` — structural: every param is kept only when it
 *    is well-formed (a real calendar date that is not in the past, an
 *    integer in range, an id list, ...). A malformed or stale value is
 *    dropped as if it were never there, so a hand-edited or old link
 *    never reaches `GET /search` just to be rejected with a 422.
 * 2. `normalizeSearchFilters` — semantic: needs the category and
 *    destination catalogs (`GET /search/categories` / `/destinations`) to
 *    resolve a `?category=<slug>` nav link to its id, drop an id that
 *    doesn't exist, and apply the chosen category's date/party rules
 *    (`categoryFilterCapabilities.js`) — and, when category filters are
 *    present, that category's filter catalog (`GET /search/filters`) to
 *    drop any the category does not offer.
 *
 * `buildSearchParams` writes the canonical form back; parsing and
 * normalizing that form again yields the same filters, which is what
 * lets `useSearchFilters` replace a messy URL with its canonical twin
 * without triggering a second search.
 *
 * Param names are the long-standing public ones — Home's `SearchWidget`,
 * the primary nav and old bookmarks all link here with them:
 * `destination` is the free-text keyword (the backend's `keyword`),
 * `category` is a nav slug, `cityId` is the real destination (a city).
 * `dynamicFilters` holds the category-filter params `GET /search/filters`
 * declares as data — `attr_{code}` (+ `_min`/`_max`), `amenityIds`,
 * `policy_{code}`, `room_{code}`, `ratingMin` — never a fixed list this
 * file could name in advance.
 *
 * `bbox` is the committed map area ("Search this area", `utils/mapArea.js`)
 * — a filter like any other, applied to List and Map alike. `view=map`
 * only chooses how the results are shown: it is URL state (reload and a
 * copied link reopen the map) but never part of the search itself.
 */

import {
  SORT_KEYS,
  DEFAULT_SORT_KEY,
  SORT_OPTION_META,
} from '../../../constants/sortOptions.js';
import { getBusinessToday } from '../../../utils/businessDate.js';
import {
  DATE_MODES,
  getSearchCapabilities,
} from '../utils/categoryFilterCapabilities.js';
import { canonicalMapArea } from '../utils/mapArea.js';

export const SEARCH_PARAM_KEYS = Object.freeze({
  destination: 'destination',
  categoryId: 'categoryId',
  categorySlug: 'category',
  cityId: 'cityId',
  sort: 'sort',
  dateFrom: 'dateFrom',
  dateTo: 'dateTo',
  guests: 'guests',
  priceMin: 'priceMin',
  priceMax: 'priceMax',
  bbox: 'bbox',
  view: 'view',
});

/** How results are shown; the List is the default and is never written. */
export const RESULT_VIEWS = Object.freeze({ LIST: 'list', MAP: 'map' });

/** Mirrors the backend's own bounds (`searchValidators.js`). */
export const MAX_KEYWORD_LENGTH = 200;
export const MAX_GUESTS = 50;
export const MAX_DATE_RANGE_DAYS = 90;
export const MAX_PRICE_AMD = 1_000_000_000;

const DAY_MS = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const ID_LIST_PATTERN = /^\d+(,\d+)*$/;
const NUMERIC_BOUND_PATTERN = /^-?\d+(\.\d+)?$/;
const ATTRIBUTE_BOUND_KEY_PATTERN = /^attr_.+_(min|max)$/;
const ATTRIBUTE_KEY_PATTERN = /^attr_/;
const AMENITY_IDS_KEY = 'amenityIds';
// Computed filters (see the API's `core/domain/searchComputedFilters.js`):
// category policies, room facts and the guest-rating floor.
const POLICY_OR_ROOM_KEY_PATTERN = /^(policy|room)_[a-z][a-z0-9_]*$/;
const CODE_LIST_PATTERN = /^[A-Z0-9_]+(,[A-Z0-9_]+)*$/;
const TOGGLE_ON = 'true';
export const RATING_PARAM = 'ratingMin';
const RATING_PATTERN = /^[1-5](\.[05])?$/;

/**
 * Category filters that stay meaningful in any category — kept when the
 * category changes, while every category-specific one is dropped.
 */
export const GLOBAL_DYNAMIC_KEYS = Object.freeze([RATING_PARAM]);

/** `YYYY-MM-DD` that is also a real calendar date (rejects `2026-02-30`). */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function daysBetween(dateFrom, dateTo) {
  return (
    (new Date(`${dateTo}T00:00:00Z`) - new Date(`${dateFrom}T00:00:00Z`)) /
    DAY_MS
  );
}

function parseInteger(raw, { min, max }) {
  if (raw === null || !POSITIVE_INTEGER_PATTERN.test(raw)) return undefined;
  const value = Number(raw);
  return value >= min && value <= max ? value : undefined;
}

function isValidDynamicFilter(key, value) {
  if (ATTRIBUTE_BOUND_KEY_PATTERN.test(key)) {
    return NUMERIC_BOUND_PATTERN.test(value) || isCalendarDate(value);
  }
  if (ATTRIBUTE_KEY_PATTERN.test(key) || key === AMENITY_IDS_KEY) {
    return ID_LIST_PATTERN.test(value);
  }
  if (POLICY_OR_ROOM_KEY_PATTERN.test(key)) {
    return value === TOGGLE_ON || CODE_LIST_PATTERN.test(value);
  }
  if (key === RATING_PARAM) {
    return RATING_PATTERN.test(value) && Number(value) <= 5;
  }
  return false;
}

/**
 * A date pair is kept only as a whole: both real calendar dates, in
 * order, not starting before today (a past stay can never be booked),
 * and within the backend's 90-day window.
 */
function parseDateRange(dateFromRaw, dateToRaw, today) {
  const isValid =
    isCalendarDate(dateFromRaw) &&
    isCalendarDate(dateToRaw) &&
    dateFromRaw >= today &&
    dateToRaw >= dateFromRaw &&
    daysBetween(dateFromRaw, dateToRaw) <= MAX_DATE_RANGE_DAYS;
  return isValid
    ? { dateFrom: dateFromRaw, dateTo: dateToRaw }
    : { dateFrom: undefined, dateTo: undefined };
}

/**
 * @param {URLSearchParams} searchParams
 * @param {{ today?: string }} [options] - `YYYY-MM-DD` business date
 * @returns {{ destination: string, categoryId?: number, categorySlug?: string, cityId?: number, sort: string, dateFrom?: string, dateTo?: string, guests?: number, priceMin?: number, priceMax?: number, bbox?: string, view: string, dynamicFilters: Object<string, string> }}
 */
export function parseSearchParams(
  searchParams,
  { today = getBusinessToday() } = {},
) {
  const get = (key) => searchParams.get(SEARCH_PARAM_KEYS[key]);

  const destination = (get('destination') ?? '')
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH);
  const categoryId = parseInteger(get('categoryId'), {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });
  // A nav slug only matters when no id is present.
  const categorySlug =
    categoryId === undefined
      ? (get('categorySlug') ?? '').trim() || undefined
      : undefined;
  const cityId = parseInteger(get('cityId'), {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });

  const sortRaw = get('sort');
  const sort = SORT_KEYS.includes(sortRaw) ? sortRaw : DEFAULT_SORT_KEY;

  const { dateFrom, dateTo } = parseDateRange(
    get('dateFrom'),
    get('dateTo'),
    today,
  );
  const guests = parseInteger(get('guests'), { min: 1, max: MAX_GUESTS });

  let priceMin = parseInteger(get('priceMin'), { min: 0, max: MAX_PRICE_AMD });
  let priceMax = parseInteger(get('priceMax'), { min: 0, max: MAX_PRICE_AMD });
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    priceMin = undefined;
    priceMax = undefined;
  }

  const bbox = canonicalMapArea(get('bbox'));
  const view =
    get('view') === RESULT_VIEWS.MAP ? RESULT_VIEWS.MAP : RESULT_VIEWS.LIST;

  const dynamicFilters = {};
  searchParams.forEach((value, key) => {
    if (value && isValidDynamicFilter(key, value)) {
      dynamicFilters[key] = value;
    }
  });

  return {
    destination,
    categoryId,
    categorySlug,
    cityId,
    sort,
    dateFrom,
    dateTo,
    guests,
    priceMin,
    priceMax,
    bbox,
    view,
    dynamicFilters,
  };
}

/**
 * Applies what only the catalogs and the chosen category can decide.
 * While a catalog the URL depends on is still loading, the filters are
 * returned as-is with `isResolved: false` — the caller waits rather than
 * searching with a half-understood URL.
 *
 * @param {ReturnType<typeof parseSearchParams>} filters
 * @param {{ categories?: Array<{id: number, slug: string}>, destinations?: Array<{id: number}> }} catalogs
 * @returns {{ filters: ReturnType<typeof parseSearchParams>, categorySlug?: string, isResolved: boolean }}
 */
export function normalizeSearchFilters(
  filters,
  { categories, destinations, filterParamKeys } = {},
) {
  const needsCategories =
    filters.categoryId !== undefined || filters.categorySlug !== undefined;
  const needsDestinations = filters.cityId !== undefined;
  if (
    (needsCategories && !categories) ||
    (needsDestinations && !destinations)
  ) {
    return { filters, categorySlug: undefined, isResolved: false };
  }

  const category = needsCategories
    ? categories.find((candidate) =>
        filters.categoryId !== undefined
          ? candidate.id === filters.categoryId
          : candidate.slug === filters.categorySlug,
      )
    : undefined;
  const cityExists =
    needsDestinations &&
    destinations.some((destination) => destination.id === filters.cityId);
  const { dateMode, party } = getSearchCapabilities(category?.slug);

  const next = {
    ...filters,
    categoryId: category?.id,
    categorySlug: undefined,
    cityId: cityExists ? filters.cityId : undefined,
    guests: party ? filters.guests : undefined,
  };
  // One date for single-day categories: a range there would ask for a
  // listing free on every day of it (see `categoryFilterCapabilities.js`).
  if (dateMode === DATE_MODES.DAY && next.dateFrom) {
    next.dateTo = next.dateFrom;
  }
  // A sort that needs a keyword means nothing without one (the backend
  // falls back the same way), so the URL never claims it.
  if (SORT_OPTION_META[next.sort]?.requiresKeyword && !next.destination) {
    next.sort = DEFAULT_SORT_KEY;
  }

  // Category filters only mean something in their own category's catalog
  // (`GET /search/filters`): until it has loaded, a URL carrying any is
  // not resolved; once it has, a key the catalog does not declare (a
  // Hotels-only `attr_bedrooms_min` on a Restaurants search) is dropped.
  const dynamicKeys = Object.keys(next.dynamicFilters);
  if (dynamicKeys.length > 0) {
    if (!filterParamKeys) {
      return { filters: next, categorySlug: category?.slug, isResolved: false };
    }
    next.dynamicFilters = Object.fromEntries(
      Object.entries(next.dynamicFilters).filter(([key]) =>
        filterParamKeys.has(key),
      ),
    );
  }

  return { filters: next, categorySlug: category?.slug, isResolved: true };
}

/**
 * Builds the canonical `URLSearchParams` for filter state — every key at
 * its empty/default value is omitted (`/search`, never
 * `/search?destination=&sort=newest`), and nothing outside this schema is
 * carried over.
 * @param {Partial<ReturnType<typeof parseSearchParams>>} filters
 * @returns {URLSearchParams}
 */
export function buildSearchParams({
  destination,
  categoryId,
  categorySlug,
  cityId,
  sort,
  dateFrom,
  dateTo,
  guests,
  priceMin,
  priceMax,
  bbox,
  view,
  dynamicFilters = {},
}) {
  const params = new URLSearchParams();
  const set = (key, value) => params.set(SEARCH_PARAM_KEYS[key], String(value));

  if (destination && destination.trim()) set('destination', destination.trim());
  if (categoryId) set('categoryId', categoryId);
  else if (categorySlug) set('categorySlug', categorySlug);
  if (cityId) set('cityId', cityId);
  if (sort && sort !== DEFAULT_SORT_KEY) set('sort', sort);
  // Only ever written as a pair — see parseDateRange's identical rule.
  if (dateFrom && dateTo) {
    set('dateFrom', dateFrom);
    set('dateTo', dateTo);
  }
  if (guests) set('guests', guests);
  if (priceMin !== undefined) set('priceMin', priceMin);
  if (priceMax !== undefined) set('priceMax', priceMax);
  Object.entries(dynamicFilters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (bbox) set('bbox', bbox);
  if (view === RESULT_VIEWS.MAP) set('view', view);
  return params;
}

/**
 * Translates filter state into the exact params `GET /search` accepts.
 * `partnerId`/`listingType`/`excludeCategoryTop` are never URL state —
 * only callers that build their own filters object pass them
 * (`CompanyProfilePageContent`'s "this company's listings",
 * `PopularExperiences`' Tours carousel, `CategoryPageContent`'s grid
 * beneath its promoted TOP section).
 */
export function toSearchQueryParams(
  {
    destination,
    categoryId,
    partnerId,
    cityId,
    listingType,
    sort,
    dateFrom,
    dateTo,
    guests,
    priceMin,
    priceMax,
    excludeCategoryTop,
    bbox,
    dynamicFilters = {},
  },
  locale,
) {
  const query = { ...dynamicFilters };
  if (destination) query.keyword = destination;
  if (categoryId) query.categoryId = categoryId;
  if (partnerId) query.partnerId = partnerId;
  if (cityId) query.cityId = cityId;
  if (listingType) query.listingType = listingType;
  if (sort) query.sort = sort;
  if (dateFrom && dateTo) {
    query.dateFrom = dateFrom;
    query.dateTo = dateTo;
  }
  if (guests) query.guests = guests;
  if (priceMin !== undefined) query.priceMin = priceMin;
  if (priceMax !== undefined) query.priceMax = priceMax;
  if (excludeCategoryTop) query.excludeCategoryTop = 'true';
  if (bbox) query.bbox = bbox;
  if (locale) query.locale = locale;
  return query;
}

export default {
  SEARCH_PARAM_KEYS,
  RESULT_VIEWS,
  parseSearchParams,
  normalizeSearchFilters,
  buildSearchParams,
  toSearchQueryParams,
};

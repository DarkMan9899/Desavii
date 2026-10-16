/**
 * The Search form's draft — what the visitor is editing before pressing
 * Search / Show results. Pure functions only; `useSearchDraft` holds the
 * state. Nothing here reaches the URL or the API until it is applied, so
 * a half-picked date range or a half-typed price never triggers a
 * search (the old bar wrote every keystroke and the first click of a
 * range straight to the URL, which dropped the unpaired date and reset
 * the calendar — the "date filter does nothing" bug).
 *
 * Draft values keep their input shape (`dateRange`, price text); applied
 * filters keep the URL shape (`dateFrom`/`dateTo`, integer prices).
 */

import {
  DATE_MODES,
  getSearchCapabilities,
} from './categoryFilterCapabilities.js';
import { MAX_PRICE_AMD } from '../schemas/searchParams.js';

const PRICE_INPUT_PATTERN = /^\d+$/;

/** @returns the draft for a set of applied filters */
export function toSearchDraft(filters) {
  return {
    destination: filters.destination ?? '',
    cityId: filters.cityId,
    categoryId: filters.categoryId,
    dateRange: { start: filters.dateFrom ?? null, end: filters.dateTo ?? null },
    guests: filters.guests,
    priceMin: filters.priceMin === undefined ? '' : String(filters.priceMin),
    priceMax: filters.priceMax === undefined ? '' : String(filters.priceMax),
    dynamicFilters: filters.dynamicFilters ?? {},
  };
}

function findCategorySlug(categories, categoryId) {
  return categories?.find((category) => category.id === categoryId)?.slug;
}

/**
 * Merges `patch` into `draft`, applying the same category rules the URL
 * normalizer does, so what the form shows is what will be searched:
 * another category drops the old one's attribute filters, a category
 * with no party field drops the party size, and a single-day category
 * keeps only the first date.
 */
export function applySearchDraftPatch(draft, patch, categories) {
  const next = { ...draft, ...patch };
  if ('categoryId' in patch && patch.categoryId !== draft.categoryId) {
    next.dynamicFilters = {};
    const { dateMode, party } = getSearchCapabilities(
      findCategorySlug(categories, patch.categoryId),
    );
    if (!party) next.guests = undefined;
    if (dateMode === DATE_MODES.DAY && next.dateRange.start) {
      next.dateRange = {
        start: next.dateRange.start,
        end: next.dateRange.start,
      };
    }
  }
  return next;
}

function parsePriceInput(text) {
  const trimmed = text.trim();
  if (!PRICE_INPUT_PATTERN.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= MAX_PRICE_AMD ? value : undefined;
}

/**
 * What would stop the draft from being applied — the error keys the
 * fields show next to themselves. `dates`: a range category with only a
 * start date picked. `price`: a minimum above the maximum.
 */
export function getSearchDraftErrors(draft, categories) {
  const { dateMode } = getSearchCapabilities(
    findCategorySlug(categories, draft.categoryId),
  );
  const errors = {};
  if (
    dateMode !== DATE_MODES.DAY &&
    draft.dateRange.start &&
    !draft.dateRange.end
  ) {
    errors.dates = 'endRequired';
  }
  const priceMin = parsePriceInput(draft.priceMin);
  const priceMax = parsePriceInput(draft.priceMax);
  if (priceMin !== undefined && priceMax !== undefined && priceMin > priceMax) {
    errors.price = 'invalidRange';
  }
  return errors;
}

/** The applied-filter shape of a draft (see `useSearchFilters.updateFilters`). */
export function fromSearchDraft(draft) {
  const { start, end } = draft.dateRange;
  const hasDates = Boolean(start && end);
  return {
    destination: draft.destination.trim(),
    cityId: draft.cityId,
    categoryId: draft.categoryId,
    dateFrom: hasDates ? start : undefined,
    dateTo: hasDates ? end : undefined,
    guests: draft.guests,
    priceMin: parsePriceInput(draft.priceMin),
    priceMax: parsePriceInput(draft.priceMax),
    dynamicFilters: draft.dynamicFilters,
  };
}

/** Empty draft for "Clear all" inside the drawer — nothing applies until Show results. */
export const EMPTY_SEARCH_DRAFT = Object.freeze(
  toSearchDraft({ dynamicFilters: {} }),
);

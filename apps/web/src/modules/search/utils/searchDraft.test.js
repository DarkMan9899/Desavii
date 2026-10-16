import { describe, test, expect } from 'vitest';
import {
  toSearchDraft,
  applySearchDraftPatch,
  getSearchDraftErrors,
  fromSearchDraft,
  EMPTY_SEARCH_DRAFT,
} from './searchDraft.js';

const CATEGORIES = [
  { id: 1, slug: 'hotels' },
  { id: 6, slug: 'tours' },
  { id: 7, slug: 'car-rentals' },
];

const APPLIED = {
  destination: 'spa',
  categoryId: 1,
  cityId: 2,
  dateFrom: '2026-11-01',
  dateTo: '2026-11-04',
  guests: 2,
  priceMin: 0,
  priceMax: 30000,
  sort: 'newest',
  dynamicFilters: { attr_star_rating: '4' },
};

describe('searchDraft (apps/web/src/modules/search)', () => {
  test('a draft round-trips the applied filters it was made from', () => {
    const draft = toSearchDraft(APPLIED);
    expect(draft.dateRange).toEqual({ start: '2026-11-01', end: '2026-11-04' });
    expect(draft.priceMin).toBe('0');
    const { sort, ...appliedWithoutSort } = APPLIED;
    expect(fromSearchDraft(draft)).toEqual(appliedWithoutSort);
  });

  test('a half-picked range is never applied as dates', () => {
    const draft = applySearchDraftPatch(
      toSearchDraft({ dynamicFilters: {} }),
      { dateRange: { start: '2026-11-01', end: null } },
      CATEGORIES,
    );
    expect(fromSearchDraft(draft)).toMatchObject({
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(getSearchDraftErrors(draft, CATEGORIES)).toEqual({
      dates: 'endRequired',
    });
  });

  test('a single-day category never reports a missing end date', () => {
    const draft = toSearchDraft({
      categoryId: 6,
      dateFrom: '2026-11-01',
      dynamicFilters: {},
    });
    expect(getSearchDraftErrors(draft, CATEGORIES)).toEqual({});
  });

  test('switching category drops the old category filters and applies the new rules', () => {
    const toCars = applySearchDraftPatch(
      toSearchDraft(APPLIED),
      { categoryId: 7 },
      CATEGORIES,
    );
    expect(toCars.dynamicFilters).toEqual({});
    expect(toCars.guests).toBeUndefined();

    const toTours = applySearchDraftPatch(
      toSearchDraft(APPLIED),
      { categoryId: 6 },
      CATEGORIES,
    );
    expect(toTours.dateRange).toEqual({
      start: '2026-11-01',
      end: '2026-11-01',
    });
    expect(toTours.guests).toBe(2);
  });

  test('a patch that keeps the same category leaves its filters alone', () => {
    const draft = applySearchDraftPatch(
      toSearchDraft(APPLIED),
      { categoryId: 1, destination: 'pool' },
      CATEGORIES,
    );
    expect(draft.dynamicFilters).toEqual({ attr_star_rating: '4' });
  });

  test('price text must be a whole number, and min above max is an error', () => {
    const draft = (priceMin, priceMax) =>
      applySearchDraftPatch(
        EMPTY_SEARCH_DRAFT,
        { priceMin, priceMax },
        CATEGORIES,
      );
    expect(fromSearchDraft(draft(' 5000 ', 'abc'))).toMatchObject({
      priceMin: 5000,
      priceMax: undefined,
    });
    expect(getSearchDraftErrors(draft('9000', '1000'), CATEGORIES)).toEqual({
      price: 'invalidRange',
    });
  });

  test('the empty draft applies no filter at all', () => {
    expect(fromSearchDraft(EMPTY_SEARCH_DRAFT)).toEqual({
      destination: '',
      cityId: undefined,
      categoryId: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      guests: undefined,
      priceMin: undefined,
      priceMax: undefined,
      dynamicFilters: {},
    });
  });
});

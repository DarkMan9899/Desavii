import { describe, test, expect } from 'vitest';
import {
  parseSearchParams,
  normalizeSearchFilters,
  buildSearchParams,
  toSearchQueryParams,
  isCalendarDate,
} from './searchParams.js';

const TODAY = '2026-10-16';
const parse = (query) =>
  parseSearchParams(new URLSearchParams(query), { today: TODAY });

const CATALOGS = {
  categories: [
    { id: 1, slug: 'hotels' },
    { id: 5, slug: 'restaurants' },
    { id: 6, slug: 'tours' },
    { id: 7, slug: 'car-rentals' },
  ],
  destinations: [{ id: 1 }, { id: 2 }],
};

describe('searchParams (apps/web/src/modules/search)', () => {
  describe('isCalendarDate', () => {
    test.each([
      ['2026-11-30', true],
      ['2028-02-29', true],
      ['2026-02-30', false],
      ['2026-13-01', false],
      ['2026-1-01', false],
      ['not-a-date', false],
      [null, false],
    ])('%s -> %s', (value, expected) => {
      expect(isCalendarDate(value)).toBe(expected);
    });
  });

  describe('parseSearchParams', () => {
    test('defaults to empty keyword, no filters, and the default sort', () => {
      expect(parse('')).toEqual({
        destination: '',
        sort: 'newest',
        dynamicFilters: {},
      });
    });

    test('reads every real param', () => {
      expect(
        parse(
          'destination=yerevan&categoryId=3&cityId=2&sort=price_asc&dateFrom=2026-11-01&dateTo=2026-11-05&guests=4&priceMin=10000&priceMax=50000',
        ),
      ).toEqual({
        destination: 'yerevan',
        categoryId: 3,
        cityId: 2,
        sort: 'price_asc',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-05',
        guests: 4,
        priceMin: 10000,
        priceMax: 50000,
        dynamicFilters: {},
      });
    });

    test('keeps a nav ?category=<slug> only when there is no categoryId', () => {
      expect(parse('category=tours').categorySlug).toBe('tours');
      expect(parse('category=tours&categoryId=1').categorySlug).toBeUndefined();
    });

    test('drops invalid ids, unknown sorts and stale param names', () => {
      const result = parse(
        'categoryId=abc&cityId=-2&sort=trending&checkIn=2026-11-01',
      );
      expect(result.categoryId).toBeUndefined();
      expect(result.cityId).toBeUndefined();
      expect(result.sort).toBe('newest');
      expect(result.dateFrom).toBeUndefined();
    });

    test.each([
      ['only one of the pair', 'dateFrom=2026-11-01'],
      ['an impossible calendar date', 'dateFrom=2026-02-30&dateTo=2026-03-02'],
      ['malformed text', 'dateFrom=soon&dateTo=2026-11-05'],
      ['an inverted range', 'dateFrom=2026-11-05&dateTo=2026-11-01'],
      ['a start in the past', 'dateFrom=2026-10-15&dateTo=2026-10-20'],
      ['a range over 90 days', 'dateFrom=2026-11-01&dateTo=2027-02-01'],
    ])('drops the whole date pair for %s', (_label, query) => {
      const result = parse(query);
      expect(result.dateFrom).toBeUndefined();
      expect(result.dateTo).toBeUndefined();
    });

    test('accepts a same-day pair starting today', () => {
      expect(parse(`dateFrom=${TODAY}&dateTo=${TODAY}`)).toMatchObject({
        dateFrom: TODAY,
        dateTo: TODAY,
      });
    });

    test.each(['0', '-1', 'abc', '2.5', '51'])(
      'drops an invalid guests value (%s)',
      (guests) => {
        expect(parse(`guests=${guests}`).guests).toBeUndefined();
      },
    );

    test('drops a price that is not a whole AMD amount, and both bounds when inverted', () => {
      expect(parse('priceMin=12.5&priceMax=abc')).toMatchObject({
        priceMin: undefined,
        priceMax: undefined,
      });
      expect(parse('priceMin=9000&priceMax=1000')).toMatchObject({
        priceMin: undefined,
        priceMax: undefined,
      });
      expect(parse('priceMin=0').priceMin).toBe(0);
    });

    test('keeps only well-formed category filter params', () => {
      expect(
        parse(
          'attr_bedrooms_min=2&attr_opened_min=2026-01-01&amenityIds=1,2&attr_star_rating=4&attr_bad_min=abc&amenityIds2=1&attr_list=a,b&attr_empty=',
        ).dynamicFilters,
      ).toEqual({
        attr_bedrooms_min: '2',
        attr_opened_min: '2026-01-01',
        amenityIds: '1,2',
        attr_star_rating: '4',
      });
    });
  });

  describe('normalizeSearchFilters', () => {
    test('is unresolved while a catalog the URL depends on is still loading', () => {
      expect(normalizeSearchFilters(parse('categoryId=1'), {}).isResolved).toBe(
        false,
      );
      expect(
        normalizeSearchFilters(parse('cityId=1'), { categories: [] })
          .isResolved,
      ).toBe(false);
      expect(
        normalizeSearchFilters(parse('destination=x'), {}).isResolved,
      ).toBe(true);
    });

    test('resolves a category slug and reports the category slug', () => {
      const { filters, categorySlug } = normalizeSearchFilters(
        parse('category=tours'),
        CATALOGS,
      );
      expect(filters.categoryId).toBe(6);
      expect(filters.categorySlug).toBeUndefined();
      expect(categorySlug).toBe('tours');
    });

    test('drops ids that do not exist in the catalogs', () => {
      const { filters } = normalizeSearchFilters(
        parse('categoryId=99&cityId=99&category=nope'),
        CATALOGS,
      );
      expect(filters.categoryId).toBeUndefined();
      expect(filters.cityId).toBeUndefined();
    });

    test('collapses a range to its first day for single-day categories', () => {
      const { filters } = normalizeSearchFilters(
        parse('categoryId=5&dateFrom=2026-11-01&dateTo=2026-11-04'),
        CATALOGS,
      );
      expect(filters).toMatchObject({
        dateFrom: '2026-11-01',
        dateTo: '2026-11-01',
      });
    });

    test.each([
      ['car-rentals', 7],
      ['restaurants', 5],
    ])('drops guests for %s (no party filter there)', (_slug, categoryId) => {
      const { filters } = normalizeSearchFilters(
        parse(`categoryId=${categoryId}&guests=4`),
        CATALOGS,
      );
      expect(filters.guests).toBeUndefined();
    });

    test('keeps a stay range and guests for hotels', () => {
      const { filters } = normalizeSearchFilters(
        parse('categoryId=1&dateFrom=2026-11-01&dateTo=2026-11-04&guests=2'),
        CATALOGS,
      );
      expect(filters).toMatchObject({
        dateFrom: '2026-11-01',
        dateTo: '2026-11-04',
        guests: 2,
      });
    });

    test('downgrades "relevance" without a keyword', () => {
      expect(
        normalizeSearchFilters(parse('sort=relevance'), CATALOGS).filters.sort,
      ).toBe('newest');
      expect(
        normalizeSearchFilters(
          parse('sort=relevance&destination=spa'),
          CATALOGS,
        ).filters.sort,
      ).toBe('relevance');
    });

    test('the canonical URL parses back to the same filters (no second search)', () => {
      const messy = parse(
        'category=tours&dateFrom=2026-11-01&dateTo=2026-11-09&guests=3&utm=x&priceMax=20000&attr_bad_min=x&sort=relevance',
      );
      const { filters } = normalizeSearchFilters(messy, CATALOGS);
      const canonical = buildSearchParams(filters);
      const again = normalizeSearchFilters(
        parseSearchParams(canonical, { today: TODAY }),
        CATALOGS,
      ).filters;
      expect(again).toEqual(filters);
      expect(buildSearchParams(again).toString()).toBe(canonical.toString());
    });
  });

  describe('buildSearchParams', () => {
    test('omits every key at its default/empty value', () => {
      expect(
        buildSearchParams({ destination: '', sort: 'newest' }).toString(),
      ).toBe('');
    });

    test('writes every set filter, keeping a 0 price', () => {
      const params = buildSearchParams({
        destination: ' yerevan ',
        categoryId: 3,
        cityId: 1,
        sort: 'price_desc',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-05',
        guests: 2,
        priceMin: 0,
        priceMax: 9000,
        dynamicFilters: { attr_bedrooms_min: '2', amenityIds: '' },
      });
      expect(Object.fromEntries(params)).toEqual({
        destination: 'yerevan',
        categoryId: '3',
        cityId: '1',
        sort: 'price_desc',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-05',
        guests: '2',
        priceMin: '0',
        priceMax: '9000',
        attr_bedrooms_min: '2',
      });
    });

    test('never writes a half-formed date pair', () => {
      const params = buildSearchParams({
        sort: 'newest',
        dateFrom: '2026-11-01',
      });
      expect(params.has('dateFrom')).toBe(false);
      expect(params.has('dateTo')).toBe(false);
    });

    test('writes an unresolved category slug only when there is no id', () => {
      expect(buildSearchParams({ categorySlug: 'tours' }).toString()).toBe(
        'category=tours',
      );
    });
  });

  describe('toSearchQueryParams', () => {
    test('maps the keyword to the backend "keyword" param and passes the rest by name', () => {
      expect(
        toSearchQueryParams(
          {
            destination: 'yerevan',
            categoryId: 3,
            cityId: 1,
            sort: 'newest',
            dateFrom: '2026-11-01',
            dateTo: '2026-11-05',
            guests: 2,
            priceMin: 0,
            priceMax: 20000,
            dynamicFilters: { attr_bedrooms_min: '2' },
          },
          'en',
        ),
      ).toEqual({
        keyword: 'yerevan',
        categoryId: 3,
        cityId: 1,
        sort: 'newest',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-05',
        guests: 2,
        priceMin: 0,
        priceMax: 20000,
        attr_bedrooms_min: '2',
        locale: 'en',
      });
    });

    test('omits empty values and half-formed date pairs', () => {
      expect(
        toSearchQueryParams(
          { destination: '', sort: 'newest', dateFrom: '2026-11-01' },
          undefined,
        ),
      ).toEqual({ sort: 'newest' });
    });

    test('sends excludeCategoryTop only when a caller asks for it (Category page grid)', () => {
      expect(
        toSearchQueryParams({ categoryId: 1, excludeCategoryTop: true }),
      ).toEqual({ categoryId: 1, excludeCategoryTop: 'true' });
      expect(toSearchQueryParams({ categoryId: 1 })).toEqual({ categoryId: 1 });
    });
  });
});

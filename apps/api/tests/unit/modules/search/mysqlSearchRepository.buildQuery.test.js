/**
 * Sprint 8: `buildSearchListingsQuery` is pure (no DB), extracted from
 * `MySqlSearchRepository` specifically so its `?` placeholder/parameter
 * alignment can be verified mechanically — MySQL binds placeholders by
 * their left-to-right physical position in the assembled SQL string, a
 * classic place for an off-by-one/out-of-order bug to hide undetected
 * until a query silently returns wrong rows.
 */

import { describe, test, expect } from '@jest/globals';
import { buildSearchListingsQuery } from '../../../../src/modules/search/repositories/mysqlSearchRepository.js';
import { resolveSortOption } from '../../../../src/core/domain/sortOptions.js';
import { ACCOMMODATION_BOOKABLE_UNIT_TYPES } from '../../../../src/core/domain/accommodationDateSemantics.js';
import { INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES } from '../../../../src/core/domain/inventoryQuantityUnitTypes.js';

function countPlaceholders(sql) {
  return (sql.match(/\?/g) ?? []).length;
}

const baseFilters = { localeId: 1, defaultLocaleId: 1 };

/** `ACCOMMODATION_BOOKABLE_UNIT_TYPES` bound once per `IN (...)` occurrence in the availability EXISTS block — see `mysqlSearchRepository.js`'s own comment on why this repeats rather than being reused. */
const TYPES = ACCOMMODATION_BOOKABLE_UNIT_TYPES;
/** Launch-blocker remediation (P0-C): the quantity IF's own IN(...) is gated by this separate, VEHICLE-inclusive list instead of `TYPES` above. */
const INVENTORY_TYPES = INVENTORY_QUANTITY_BOOKABLE_UNIT_TYPES;

describe('buildSearchListingsQuery — placeholder/parameter alignment', () => {
  test('no filters, no keyword: placeholder count matches params length', () => {
    const { sql, params } = buildSearchListingsQuery(
      baseFilters,
      resolveSortOption('newest'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('every optional filter set simultaneously (no keyword)', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        categoryId: 5,
        listingTypeCode: 'HOTEL',
        cityId: 10,
        countryId: 2,
        partnerId: 7,
        statusCode: 'PUBLISHED',
      },
      resolveSortOption('oldest'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('keyword present: placeholder count still matches params length', () => {
    const { sql, params } = buildSearchListingsQuery(
      { ...baseFilters, keyword: 'hotel yerevan' },
      resolveSortOption('relevance', { hasKeyword: true }),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('keyword + every filter + cursor: placeholder count still matches params length', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        keyword: 'boutique',
        categoryId: 5,
        listingTypeCode: 'HOTEL',
        cityId: 10,
        countryId: 2,
        partnerId: 7,
        statusCode: 'DRAFT',
      },
      resolveSortOption('relevance', { hasKeyword: true }),
      { cursor: 'eyJzb3J0VmFsdWUiOjAuNSwiaWQiOjR9', limit: 10 },
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('onlyPublished (no explicit statusCode) still balances', () => {
    const { sql, params } = buildSearchListingsQuery(
      { ...baseFilters, onlyPublished: true },
      resolveSortOption('alphabetical'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('exact param order for a representative keyword + filter query matches the physical placeholder order', () => {
    const { params } = buildSearchListingsQuery(
      {
        localeId: 3,
        defaultLocaleId: 1,
        keyword: 'spa',
        partnerId: 42,
        onlyPublished: true,
      },
      resolveSortOption('relevance', { hasKeyword: true }),
      { limit: 5 },
    );

    // Physical order in the SQL: SELECT's MATCH keyword, then JOIN
    // lt.language_id, JOIN lt2.language_id, then WHERE's partner_id,
    // then WHERE's MATCH keyword (again, for the `> 0` filter), then
    // LIMIT's (limit + 1).
    expect(params).toEqual(['spa', 3, 1, 42, 'spa', 6]);
  });

  test('a cursor contributes exactly two trailing params (sortValue, id) before LIMIT', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: 'Alpha Hotel', id: 9 }),
      'utf8',
    ).toString('base64url');
    const { params } = buildSearchListingsQuery(
      { localeId: 1, defaultLocaleId: 1 },
      resolveSortOption('alphabetical'),
      { cursor, limit: 20 },
    );
    // localeId, defaultLocaleId, then cursor's (sortValue, id), then limit+1.
    expect(params).toEqual([1, 1, 'Alpha Hotel', 9, 21]);
  });

  test('amenityIds: one EXISTS placeholder per id, balances with params', () => {
    const { sql, params } = buildSearchListingsQuery(
      { ...baseFilters, amenityIds: [3, 9, 14] },
      resolveSortOption('newest'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, 3, 9, 14, 21]);
  });

  test('attributeFilters: ENUM optionIds expand to one IN(...) placeholder each', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        attributeFilters: [
          {
            attributeDefinitionId: 5,
            dataTypeCode: 'ENUM',
            optionIds: [16, 17],
          },
        ],
      },
      resolveSortOption('newest'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, 16, 17, 21]);
  });

  test('attributeFilters: numeric min/max against a typed value table', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        attributeFilters: [
          { attributeDefinitionId: 1, dataTypeCode: 'INTEGER', min: 2 },
          {
            attributeDefinitionId: 8,
            dataTypeCode: 'INTEGER',
            min: 30,
            max: 120,
          },
        ],
      },
      resolveSortOption('newest'),
    );
    expect(sql).toContain('listing_attribute_values_integer');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, 1, 2, 8, 30, 120, 21]);
  });

  test('availability filter (single-day request): CTE params bind first, condition params balance', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-10',
        availabilityLastNight: '2026-09-10',
        availabilityGuests: 2,
      },
      resolveSortOption('newest'),
    );
    expect(sql).toContain('WITH RECURSIVE availability_search_dates');
    expect(sql).toContain('bookable_units');
    expect(sql).toContain('bookable_unit_types');
    expect(sql).toContain('blackout_dates');
    expect(countPlaceholders(sql)).toBe(params.length);
    // CTE's (dateFrom, dateTo) bind first, then localeId/defaultLocaleId,
    // then the single EXISTS-over-bu block's four placeholder groups in
    // physical order: max_guests's IN(...) + bound, the date IF's IN(...)
    // + (lastNight, dateTo), the quantity IF's IN(...) + (requestedQty,
    // guests), the blackout IF's IN(...) + (lastNight, dateTo), then the
    // blackout's own dateFrom bound, then LIMIT.
    expect(params).toEqual([
      '2026-09-10',
      '2026-09-10',
      1,
      1,
      ...TYPES,
      2,
      ...TYPES,
      '2026-09-10',
      '2026-09-10',
      ...INVENTORY_TYPES,
      1,
      2,
      ...TYPES,
      '2026-09-10',
      '2026-09-10',
      '2026-09-10',
      21,
    ]);
  });

  test('availability filter joins bookable_unit_types, gates the date bound by accommodation type, and gates the quantity bound by the separate (accommodation + VEHICLE) inventory-quantity type list (P2.2D / P0-C launch-blocker remediation)', () => {
    const { sql } = buildSearchListingsQuery(
      {
        ...baseFilters,
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-12',
        availabilityLastNight: '2026-09-11',
        availabilityGuests: 2,
      },
      resolveSortOption('newest'),
    );
    const typePlaceholders = TYPES.map(() => '?').join(', ');
    const inventoryTypePlaceholders = INVENTORY_TYPES.map(() => '?').join(', ');
    expect(sql).toContain(
      'JOIN bookable_unit_types but ON but.id = bu.bookable_unit_type_id',
    );
    expect(sql).toContain('bu.max_guests IS NULL');
    expect(sql).toContain(
      `sd.d <= IF(but.code IN (${typePlaceholders}), ?, ?)`,
    );
    // The quantity bound uses a DIFFERENT, VEHICLE-inclusive type list —
    // deliberately not the same `typePlaceholders` as the date bound
    // above (VEHICLE's date semantics stay unchanged).
    expect(sql).toContain(
      `< IF(but.code IN (${inventoryTypePlaceholders}), ?, ?)`,
    );
    expect(sql).not.toContain(`< IF(but.code IN (${typePlaceholders}), ?, ?)`);
  });

  test('availability filter (multi-night stay request) uses distinct dateFrom/lastNight for the checkout-exclusive branch', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-12',
        availabilityLastNight: '2026-09-11',
        availabilityGuests: 1,
      },
      resolveSortOption('newest'),
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([
      '2026-09-10',
      '2026-09-12',
      1,
      1,
      ...TYPES,
      1,
      ...TYPES,
      '2026-09-11',
      '2026-09-12',
      ...INVENTORY_TYPES,
      1,
      1,
      ...TYPES,
      '2026-09-11',
      '2026-09-12',
      '2026-09-10',
      21,
    ]);
  });

  test('no availability filter when dates are absent: no CTE/date-aware EXISTS emitted', () => {
    const { sql, params } = buildSearchListingsQuery(
      baseFilters,
      resolveSortOption('newest'),
    );
    expect(sql).not.toContain('WITH RECURSIVE');
    expect(sql).not.toContain('bookable_unit_types');
    expect(sql).not.toContain('blackout_dates');
    // The P2.2D "from" price aggregation always references
    // `bookable_units` (unconditionally, unlike the availability filter),
    // so this file's presence check moved from the table name itself to
    // the availability-specific `bookable_unit_types` join alias above.
    expect(sql).toContain('bookable_units');
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('availability filter combined with amenityIds + attributeFilters + keyword + cursor still balances', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: 0.5, id: 4 }),
      'utf8',
    ).toString('base64url');
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        keyword: 'spa',
        amenityIds: [3],
        attributeFilters: [
          { attributeDefinitionId: 5, dataTypeCode: 'ENUM', optionIds: [16] },
        ],
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-12',
        availabilityLastNight: '2026-09-11',
        availabilityGuests: 2,
      },
      resolveSortOption('relevance', { hasKeyword: true }),
      { cursor, limit: 10 },
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params[0]).toBe('2026-09-10');
    expect(params[1]).toBe('2026-09-12');
  });

  test('amenityIds + attributeFilters + keyword + cursor all combined still balance', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: 0.5, id: 4 }),
      'utf8',
    ).toString('base64url');
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        keyword: 'spa',
        amenityIds: [3],
        attributeFilters: [
          { attributeDefinitionId: 5, dataTypeCode: 'ENUM', optionIds: [16] },
        ],
      },
      resolveSortOption('relevance', { hasKeyword: true }),
      { cursor, limit: 10 },
    );
    expect(countPlaceholders(sql)).toBe(params.length);
  });
});

describe('buildSearchListingsQuery — Search & Discovery rebuild filters', () => {
  test('a category filter alone never excludes CATEGORY_TOP promotions; excludeCategoryTop opts in', () => {
    const plain = buildSearchListingsQuery(
      { ...baseFilters, categoryId: 5 },
      resolveSortOption('newest'),
    );
    expect(plain.sql).not.toContain('CATEGORY_TOP');

    const grid = buildSearchListingsQuery(
      { ...baseFilters, categoryId: 5, excludeCategoryTop: true },
      resolveSortOption('newest'),
    );
    expect(grid.sql).toContain("apt.code = 'CATEGORY_TOP'");
    expect(countPlaceholders(grid.sql)).toBe(grid.params.length);
  });

  test('excludeCategoryTop without a category is a no-op', () => {
    const { sql } = buildSearchListingsQuery(
      { ...baseFilters, excludeCategoryTop: true },
      resolveSortOption('newest'),
    );
    expect(sql).not.toContain('CATEGORY_TOP');
  });

  test('occupancyGuests (party size, no dates): one undated occupancy EXISTS with its exact params', () => {
    const { sql, params } = buildSearchListingsQuery(
      { ...baseFilters, occupancyGuests: 3 },
      resolveSortOption('newest'),
    );
    expect(sql).not.toContain('WITH RECURSIVE');
    expect(sql).toContain('bu.max_guests >= ?');
    expect(sql).toContain('bu.capacity >= ?');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, ...TYPES, 3, ...INVENTORY_TYPES, 3, 21]);
  });

  test('a dated search ignores occupancyGuests (the availability EXISTS already checks the party)', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-10',
        availabilityLastNight: '2026-09-10',
        availabilityGuests: 2,
        occupancyGuests: 2,
      },
      resolveSortOption('newest'),
    );
    expect(sql).not.toContain('bu.capacity >= ?');
    expect(countPlaceholders(sql)).toBe(params.length);
  });

  test('priceMin/priceMax bind against the base-currency price, before the cursor and LIMIT', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: '15000.00', id: 8 }),
      'utf8',
    ).toString('base64url');
    const { sql, params } = buildSearchListingsQuery(
      { ...baseFilters, priceMin: 10000, priceMax: 20000 },
      resolveSortOption('price_asc'),
      { cursor, limit: 5 },
    );
    expect(sql).toContain("base.price_currency_code = 'AMD'");
    expect(sql).toContain('results.price_amount_base >= ?');
    expect(sql).toContain('results.price_amount_base <= ?');
    expect(sql).toContain(
      'ORDER BY results.price_sort_asc ASC, results.id ASC',
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, 10000, 20000, '15000.00', 8, 6]);
  });

  test('price_desc orders by its own never-NULL sort key', () => {
    const { sql } = buildSearchListingsQuery(
      baseFilters,
      resolveSortOption('price_desc'),
    );
    expect(sql).toContain(
      'ORDER BY results.price_sort_desc DESC, results.id DESC',
    );
  });

  test('the count query shares every filter but never the cursor or LIMIT', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: '2026-01-01 00:00:00.000', id: 3 }),
      'utf8',
    ).toString('base64url');
    const { countSql, countParams } = buildSearchListingsQuery(
      {
        ...baseFilters,
        keyword: 'spa',
        categoryId: 5,
        occupancyGuests: 2,
        priceMax: 30000,
      },
      resolveSortOption('newest'),
      { cursor, limit: 10 },
    );
    expect(countSql).toContain('SELECT COUNT(*) AS total');
    expect(countSql).not.toContain('LIMIT ?');
    expect(countSql).not.toContain('results.id) <');
    expect(countPlaceholders(countSql)).toBe(countParams.length);
    expect(countParams[countParams.length - 1]).toBe(30000);
  });

  test('a dated count query binds the CTE params first, like the page query', () => {
    const { countSql, countParams } = buildSearchListingsQuery(
      {
        ...baseFilters,
        availabilityDateFrom: '2026-09-10',
        availabilityDateTo: '2026-09-12',
        availabilityLastNight: '2026-09-11',
        availabilityGuests: 2,
      },
      resolveSortOption('newest'),
    );
    expect(countPlaceholders(countSql)).toBe(countParams.length);
    expect(countParams.slice(0, 2)).toEqual(['2026-09-10', '2026-09-12']);
  });
});

describe('buildSearchListingsQuery — Search & Discovery remediation filters', () => {
  test('policyFilters: one EXISTS per policy, OR within its values, params in physical order', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        policyFilters: [
          { policyDefinitionId: 4, values: ['FLEXIBLE', 'MODERATE'] },
          { policyDefinitionId: 7, values: ['true'] },
        ],
      },
      resolveSortOption('newest'),
    );
    expect(sql.match(/FROM listing_policy_values lpv/g)).toHaveLength(2);
    expect(sql).toContain('lpv.value IN (?, ?)');
    expect(sql).toContain('lpv.value IN (?)');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params.slice(2, 7)).toEqual([4, 'FLEXIBLE', 'MODERATE', 7, 'true']);
  });

  test('roomMealPlans / roomHourlyStays: room EXISTS over live units only', () => {
    const { sql, params } = buildSearchListingsQuery(
      {
        ...baseFilters,
        roomMealPlans: ['BREAKFAST_INCLUDED', 'HALF_BOARD'],
        roomHourlyStays: true,
      },
      resolveSortOption('newest'),
    );
    expect(sql).toContain('bu_meal.meal_plan IN (?, ?)');
    expect(sql).toContain('bu_meal.deleted_at IS NULL');
    expect(sql).toContain('bu_hourly.hourly_enabled = 1');
    expect(sql).toContain('bu_hourly.deleted_at IS NULL');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toContain('HALF_BOARD');
  });

  test('roomHourlyStays false adds nothing', () => {
    const { sql } = buildSearchListingsQuery(
      { ...baseFilters, roomHourlyStays: false },
      resolveSortOption('newest'),
    );
    expect(sql).not.toContain('bu_hourly');
  });

  test('ratingMin binds against the approved-review average, on page and count alike', () => {
    const { sql, params, countSql, countParams } = buildSearchListingsQuery(
      { ...baseFilters, ratingMin: 4.5 },
      resolveSortOption('newest'),
      { limit: 5 },
    );
    expect(sql).toContain('results.rating_average >= ?');
    expect(countSql).toContain('results.rating_average >= ?');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(countPlaceholders(countSql)).toBe(countParams.length);
    expect(params).toEqual([1, 1, 4.5, 6]);
    expect(countParams[countParams.length - 1]).toBe(4.5);
  });

  test('rating_desc orders by the never-NULL rating key with a keyset cursor', () => {
    const cursor = Buffer.from(
      JSON.stringify({ sortValue: '4.50', id: 12 }),
      'utf8',
    ).toString('base64url');
    const { sql, params } = buildSearchListingsQuery(
      baseFilters,
      resolveSortOption('rating_desc'),
      { cursor, limit: 5 },
    );
    expect(sql).toContain('AS rating_sort');
    expect(sql).toContain('ORDER BY results.rating_sort DESC, results.id DESC');
    expect(sql).toContain('(results.rating_sort, results.id) < (?, ?)');
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(params).toEqual([1, 1, '4.50', 12, 6]);
  });

  test('every remediation filter combined with keyword, attributes and price still balances', () => {
    const { sql, params, countSql, countParams } = buildSearchListingsQuery(
      {
        ...baseFilters,
        keyword: 'spa',
        categoryId: 1,
        amenityIds: [1, 2],
        attributeFilters: [
          { attributeDefinitionId: 3, dataTypeCode: 'ENUM', optionIds: [9] },
        ],
        policyFilters: [{ policyDefinitionId: 4, values: ['FLEXIBLE'] }],
        roomMealPlans: ['BREAKFAST_INCLUDED'],
        roomHourlyStays: true,
        priceMin: 1000,
        ratingMin: 4,
      },
      resolveSortOption('rating_desc'),
      { limit: 20 },
    );
    expect(countPlaceholders(sql)).toBe(params.length);
    expect(countPlaceholders(countSql)).toBe(countParams.length);
  });
});

import { describe, test, expect } from 'vitest';
import parsedSearchToFilters from './parsedSearchToFilters.js';

describe('parsedSearchToFilters', () => {
  test('maps every resolved part onto the canonical Search filters', () => {
    expect(
      parsedSearchToFilters({
        keyword: 'quiet hotel breakfast',
        category_id: 1,
        city_id: 4,
        amenity_ids: [101, 102],
      }),
    ).toEqual({
      destination: 'quiet hotel breakfast',
      categoryId: 1,
      cityId: 4,
      dynamicFilters: { amenityIds: '101,102' },
    });
  });

  test('leaves out whatever the server could not resolve — nothing is guessed', () => {
    expect(
      parsedSearchToFilters({
        keyword: 'somewhere quiet',
        category_id: null,
        city_id: null,
        amenity_ids: [],
      }),
    ).toEqual({
      destination: 'somewhere quiet',
      categoryId: undefined,
      cityId: undefined,
      dynamicFilters: {},
    });
  });
});

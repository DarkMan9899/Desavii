import { describe, test, expect } from '@jest/globals';
import {
  parseBoundingBox,
  formatBoundingBox,
  MAP_RESULT_LIMIT,
} from '../../../../src/core/domain/searchMap.js';

describe('searchMap — bbox parsing', () => {
  test('a well-formed west,south,east,north area parses to numbers', () => {
    expect(parseBoundingBox('44.4,40.1,44.6,40.25')).toEqual({
      west: 44.4,
      south: 40.1,
      east: 44.6,
      north: 40.25,
    });
    expect(parseBoundingBox('-180,-90,180,90')).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    });
  });

  test.each([
    ['missing a coordinate', '44.4,40.1,44.6'],
    ['an extra coordinate', '44.4,40.1,44.6,40.2,1'],
    ['empty', ''],
    ['NaN', '44.4,NaN,44.6,40.2'],
    ['Infinity', '44.4,40.1,Infinity,40.2'],
    ['exponent notation', '4.4e1,40.1,44.6,40.2'],
    ['whitespace', '44.4, 40.1,44.6,40.2'],
    ['latitude above 90', '44.4,40.1,44.6,90.5'],
    ['latitude below -90', '44.4,-91,44.6,40.2'],
    ['longitude above 180', '44.4,40.1,181,40.2'],
    ['south above north', '44.4,40.3,44.6,40.2'],
    ['zero height', '44.4,40.2,44.6,40.2'],
    ['crossing the antimeridian (west > east)', '179,40.1,-179,40.2'],
    ['zero width', '44.6,40.1,44.6,40.2'],
  ])('rejects %s', (_label, raw) => {
    expect(parseBoundingBox(raw)).toBeNull();
  });

  test('anything that is not one string (a repeated param) is rejected', () => {
    expect(parseBoundingBox(['44.4,40.1,44.6,40.2', '1,1,2,2'])).toBeNull();
    expect(parseBoundingBox(undefined)).toBeNull();
  });

  test('formatting is canonical: fixed order and precision, round-trips', () => {
    const formatted = formatBoundingBox({
      west: 44.4,
      south: 40.1,
      east: 44.6123456,
      north: 40.25,
    });
    expect(formatted).toBe('44.40000,40.10000,44.61235,40.25000');
    expect(parseBoundingBox(formatted)).toEqual({
      west: 44.4,
      south: 40.1,
      east: 44.61235,
      north: 40.25,
    });
  });

  test('the map universe is capped, not unbounded', () => {
    expect(MAP_RESULT_LIMIT).toBeGreaterThan(0);
  });
});

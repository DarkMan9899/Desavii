import { describe, test, expect } from 'vitest';
import {
  canonicalMapArea,
  formatMapArea,
  mapAreaFromBounds,
  parseMapArea,
} from './mapArea.js';

const bounds = (west, south, east, north) => ({
  getWest: () => west,
  getSouth: () => south,
  getEast: () => east,
  getNorth: () => north,
});

describe('mapArea (apps/web/src/modules/search)', () => {
  test('parses a west,south,east,north area', () => {
    expect(parseMapArea('44.4,40.1,44.6,40.25')).toEqual({
      west: 44.4,
      south: 40.1,
      east: 44.6,
      north: 40.25,
    });
  });

  test.each([
    ['not a string', undefined],
    ['too few parts', '44.4,40.1,44.6'],
    ['too many parts', '44.4,40.1,44.6,40.2,1'],
    ['not numbers', 'a,b,c,d'],
    ['exponent notation', '1e1,40.1,44.6,40.2'],
    ['a longitude out of range', '-181,40.1,44.6,40.2'],
    ['a latitude out of range', '44.4,-91,44.6,40.2'],
    ['south not below north', '44.4,40.2,44.6,40.2'],
    ['west not left of east', '44.6,40.1,44.4,40.2'],
  ])('rejects %s', (_label, raw) => {
    expect(parseMapArea(raw)).toBeNull();
  });

  test('always writes the same area as the same string', () => {
    expect(
      formatMapArea({ west: 44.4, south: 40.1, east: 44.6, north: 40.25 }),
    ).toBe('44.40000,40.10000,44.60000,40.25000');
    expect(canonicalMapArea('44.4,40.1,44.6,40.25')).toBe(
      canonicalMapArea('44.400000,40.1000,44.60,40.250'),
    );
    expect(canonicalMapArea('garbage')).toBeUndefined();
  });

  test('a map zoomed out past the world edge still commits a valid area', () => {
    const area = mapAreaFromBounds(bounds(-250, -95, 260, 95));
    expect(area).toBe('-180.00000,-90.00000,180.00000,90.00000');
    expect(parseMapArea(area)).not.toBeNull();
  });
});

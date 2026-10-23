import { describe, test, expect } from 'vitest';
import { Wifi } from 'lucide-react';
import { resolveAmenityIcon, POPULAR_AMENITY_KEYS } from './amenityIcons.js';
import resolveAmenityGroupIcon from './amenityGroupIcons.js';
import {
  resolveAmenityFeatureGroups,
  resolvePopularAmenities,
} from './resolveAmenityFeatureGroups.js';

const t = (key, { defaultValue } = {}) => defaultValue ?? key;

describe('resolveAmenityIcon', () => {
  test('an amenity with a known key gets its own icon', () => {
    expect(resolveAmenityIcon('WIFI', 'INTERNET_WORK')).toBe(Wifi);
  });

  test('an amenity without a key, or with an unknown one, falls back to its group icon', () => {
    expect(resolveAmenityIcon(null, 'OUTDOOR')).toBe(
      resolveAmenityGroupIcon('OUTDOOR'),
    );
    expect(resolveAmenityIcon('NOT_IN_THE_MAP', 'OUTDOOR')).toBe(
      resolveAmenityGroupIcon('OUTDOOR'),
    );
  });

  test('every popular amenity has its own icon', () => {
    POPULAR_AMENITY_KEYS.forEach((key) => {
      expect(resolveAmenityIcon(key, 'UNKNOWN_GROUP')).not.toBe(
        resolveAmenityGroupIcon('UNKNOWN_GROUP'),
      );
    });
  });
});

describe('resolveAmenityFeatureGroups / resolvePopularAmenities', () => {
  const catalog = [
    {
      code: 'GENERAL',
      amenities: [
        { value: 1, key: 'ELEVATOR', code: 'Elevator' },
        { value: 2, key: 'POOL', code: 'Pool' },
      ],
    },
    {
      code: 'INTERNET_WORK',
      amenities: [{ value: 3, key: 'WIFI', code: 'Wi-Fi' }],
    },
    {
      code: 'OUTDOOR',
      amenities: [{ value: 4, key: 'GARDEN', code: 'Garden' }],
    },
  ];

  test('keeps only the listing amenities, grouped, with key, label and icon', () => {
    const groups = resolveAmenityFeatureGroups(catalog, [1, 3], t);
    expect(groups.map((group) => group.items.map((item) => item.key))).toEqual([
      ['ELEVATOR'],
      ['WIFI'],
    ]);
    expect(groups[1].items[0]).toMatchObject({ label: 'Wi-Fi', icon: Wifi });
  });

  test('popular amenities come in popularity order, capped, never invented', () => {
    const groups = resolveAmenityFeatureGroups(catalog, [1, 2, 3, 4], t);
    expect(resolvePopularAmenities(groups, 8).map((item) => item.key)).toEqual([
      'WIFI',
      'POOL',
      'GARDEN',
    ]);
    expect(resolvePopularAmenities(groups, 2).map((item) => item.key)).toEqual([
      'WIFI',
      'POOL',
    ]);
  });
});

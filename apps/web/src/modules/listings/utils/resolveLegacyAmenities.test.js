import { describe, test, expect } from 'vitest';
import { resolveLegacyAmenities } from './resolveLegacyAmenities.js';

const GROUPS = [
  { code: 'CONNECTIVITY', amenities: [{ value: 1, code: 'WiFi' }] },
  { code: 'WELLNESS', amenities: [{ value: 3, code: 'Pool' }] },
];
const CATALOG = [
  { value: 9, code: 'Jacuzzi' },
  { value: 3, code: 'Pool' },
  { value: 26, code: 'Live Music' },
  { value: 1, code: 'WiFi' },
];

describe('resolveLegacyAmenities (Step L6.1)', () => {
  test('returns only stored amenities the category does not offer, labelled from the catalog', () => {
    expect(resolveLegacyAmenities(GROUPS, CATALOG, [1, 26, 9, 3])).toEqual([
      { value: 9, code: 'Jacuzzi' },
      { value: 26, code: 'Live Music' },
    ]);
  });

  test('returns nothing when every stored amenity is offered', () => {
    expect(resolveLegacyAmenities(GROUPS, CATALOG, [1, 3])).toEqual([]);
  });

  test('never surfaces a raw id: an unlabelled stored id is left out', () => {
    expect(resolveLegacyAmenities(GROUPS, CATALOG, [404])).toEqual([]);
  });

  test('tolerates missing metadata fields', () => {
    expect(resolveLegacyAmenities(undefined, undefined, [9])).toEqual([]);
    expect(resolveLegacyAmenities(GROUPS, CATALOG, undefined)).toEqual([]);
  });
});

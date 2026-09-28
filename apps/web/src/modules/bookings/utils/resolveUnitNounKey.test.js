import { describe, test, expect } from 'vitest';
import { resolveUnitNounKey } from './resolveUnitNounKey.js';

describe('resolveUnitNounKey (Step L6.2B)', () => {
  test.each([
    'HOTEL_ROOM',
    'PROPERTY_UNIT',
    'RESTAURANT_TABLE',
    'TOUR_DEPARTURE',
    'VEHICLE',
  ])('%s is named by its own domain noun', (unitType) => {
    expect(resolveUnitNounKey(unitType, 'fallback.key')).toBe(
      `bookings.unitLabels.${unitType}`,
    );
  });

  test.each([undefined, null, 'SESSION'])(
    'an unknown unit type (%s) keeps the generic wording',
    (unitType) => {
      expect(resolveUnitNounKey(unitType, 'fallback.key')).toBe('fallback.key');
    },
  );
});

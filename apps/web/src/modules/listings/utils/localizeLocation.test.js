import { describe, test, expect } from 'vitest';
import { localizeLocation } from './localizeLocation.js';

const LOCATION = {
  city_name: 'Vanadzor',
  country_name: 'Armenia',
  latitude: 40.81,
  location_precision: 'exact',
  name_translations: [
    { language_code: 'hy', city_name: 'Վանաձոր', country_name: 'Հայաստան' },
    { language_code: 'ru', city_name: 'Ванадзор', country_name: null },
  ],
};

describe('localizeLocation', () => {
  test("the visitor's language when the place has it", () => {
    expect(localizeLocation(LOCATION, 'hy')).toMatchObject({
      city_name: 'Վանաձոր',
      country_name: 'Հայաստան',
    });
  });

  test('a missing name falls back to the stored base name', () => {
    expect(localizeLocation(LOCATION, 'ru')).toMatchObject({
      city_name: 'Ванадзор',
      country_name: 'Armenia',
    });
    expect(localizeLocation(LOCATION, 'en').city_name).toBe('Vanadzor');
  });

  test('never changes the point or its precision', () => {
    expect(localizeLocation(LOCATION, 'hy')).toMatchObject({
      latitude: 40.81,
      location_precision: 'exact',
    });
  });

  test('no location stays none', () => {
    expect(localizeLocation(null, 'hy')).toBeNull();
  });
});

import { describe, test, expect } from 'vitest';
import {
  resolveBookableUnitProfile,
  resolveUnitPriceBasis,
} from './resolveBookableUnitProfile.js';

describe('resolveBookableUnitProfile (Step L6.2B)', () => {
  test.each([
    [
      'HOTEL',
      'hotels',
      'PER_NIGHT',
      {
        unitType: 'HOTEL_ROOM',
        terms: 'hotel',
        priceBasis: 'perNight',
        stayRules: 'nights',
        advanceContext: 'checkIn',
        singleUnit: false,
      },
    ],
    [
      'PROPERTY',
      'guest-houses',
      'PER_NIGHT',
      {
        unitType: 'PROPERTY_UNIT',
        terms: 'guestHouse',
        priceBasis: 'perNight',
        stayRules: 'nights',
        advanceContext: 'checkIn',
        singleUnit: false,
      },
    ],
    [
      'RESTAURANT',
      'restaurants',
      'PER_PERSON',
      {
        unitType: 'RESTAURANT_TABLE',
        terms: 'restaurant',
        priceBasis: 'neutral',
        stayRules: null,
        advanceContext: 'reservation',
        singleUnit: false,
      },
    ],
    [
      'TOUR',
      'tours',
      'PER_PERSON',
      {
        unitType: 'TOUR_DEPARTURE',
        terms: 'tour',
        priceBasis: 'perPerson',
        stayRules: null,
        advanceContext: 'departure',
        singleUnit: false,
      },
    ],
    [
      'CAR_RENTAL',
      'car-rentals',
      'PER_DAY',
      {
        unitType: 'VEHICLE',
        terms: 'carRental',
        priceBasis: 'perDay',
        stayRules: 'days',
        advanceContext: 'pickup',
        singleUnit: true,
      },
    ],
    [
      'ATTRACTION',
      'entertainment-venues',
      'PER_HOUR',
      {
        unitType: 'TOUR_DEPARTURE',
        terms: 'entertainment',
        priceBasis: 'neutral',
        stayRules: null,
        advanceContext: 'visit',
        singleUnit: false,
      },
    ],
  ])('%s / %s / %s', (listingType, categorySlug, pricingModel, expected) => {
    expect(
      resolveBookableUnitProfile({ listingType, categorySlug, pricingModel }),
    ).toEqual(expected);
  });

  test('an unknown category still gets its listing type’s own words', () => {
    expect(
      resolveBookableUnitProfile({ listingType: 'PROPERTY' }),
    ).toMatchObject({ unitType: 'PROPERTY_UNIT', terms: 'apartment' });
  });

  test('a listing type with no unit model resolves to null', () => {
    expect(resolveBookableUnitProfile({ listingType: 'SPACESHIP' })).toBeNull();
  });
});

describe('resolveUnitPriceBasis (Step L6.2B)', () => {
  test.each([
    ['PER_NIGHT', 'HOTEL_ROOM', 'perNight'],
    ['PER_DAY', 'VEHICLE', 'perDay'],
    ['PER_PERSON', 'TOUR_DEPARTURE', 'perPerson'],
    // A restaurant booking is charged per reservation, not per person.
    ['PER_PERSON', 'RESTAURANT_TABLE', 'neutral'],
    // PER_HOUR is charged per day today — never labelled "per hour".
    ['PER_HOUR', 'TOUR_DEPARTURE', 'neutral'],
    [null, 'HOTEL_ROOM', 'neutral'],
  ])('%s on a %s unit -> %s', (pricingModel, unitType, expected) => {
    expect(resolveUnitPriceBasis(pricingModel, unitType)).toBe(expected);
  });
});

import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import { resolveListingKeyFacts, KEY_FACT_LIMIT } from './listingKeyFacts.js';

const t = i18n.getFixedT('en');

const integer = (code, unit) => ({ code, data_type: 'INTEGER', unit });
const enumOf = (code) => ({ code, data_type: 'ENUM', options: [] });

function facts(input) {
  return resolveListingKeyFacts(
    { metadata: { attributes: [], policies: [] }, ...input },
    t,
  );
}

const summary = (result) =>
  result.facts.map((fact) => [fact.key, fact.label, fact.value]);

describe('resolveListingKeyFacts', () => {
  test('returns nothing for an unknown category or before metadata loads', () => {
    expect(facts({ categoryVisualKey: 'unknown', listing: {} }).facts).toEqual(
      [],
    );
    expect(
      resolveListingKeyFacts(
        { categoryVisualKey: 'tours', metadata: undefined, listing: {} },
        t,
      ),
    ).toEqual({ facts: [], consumedAttributeCodes: [] });
  });

  test('a tour leads with its duration (as hours), group size and difficulty, consuming those attributes', () => {
    const result = facts({
      categoryVisualKey: 'tours',
      metadata: {
        attributes: [
          integer('duration_minutes'),
          integer('min_group_size'),
          integer('max_group_size'),
          enumOf('difficulty'),
        ],
        policies: [],
      },
      listing: {
        attribute_values: [
          { code: 'duration_minutes', value: '180' },
          { code: 'min_group_size', value: '2' },
          { code: 'max_group_size', value: '12' },
          { code: 'difficulty', option_codes: ['EASY'] },
        ],
      },
    });
    expect(summary(result)).toEqual([
      ['duration_minutes', 'Duration', '3h'],
      ['group_size', 'Group size', '2–12 people'],
      ['difficulty', 'Difficulty', expect.any(String)],
    ]);
    expect(result.consumedAttributeCodes).toEqual([
      'duration_minutes',
      'min_group_size',
      'max_group_size',
      'difficulty',
    ]);
  });

  test('a missing value is left out, never defaulted', () => {
    const result = facts({
      categoryVisualKey: 'tours',
      metadata: {
        attributes: [integer('duration_minutes'), integer('max_group_size')],
        policies: [],
      },
      listing: { attribute_values: [{ code: 'max_group_size', value: '8' }] },
    });
    expect(summary(result)).toEqual([
      ['group_size', 'Group size', 'Up to 8 people'],
    ]);
  });

  test('an attribute whose condition does not hold is not a fact', () => {
    const result = facts({
      categoryVisualKey: 'car-rentals',
      metadata: {
        attributes: [
          enumOf('mileage_policy'),
          {
            ...integer('daily_distance_limit_km'),
            depends_on: {
              attribute_code: 'mileage_policy',
              option_code: 'LIMITED',
            },
          },
        ],
        policies: [],
      },
      listing: {
        attribute_values: [
          { code: 'mileage_policy', option_codes: ['UNLIMITED'] },
          { code: 'daily_distance_limit_km', value: '200' },
        ],
      },
    });
    expect(result.facts.map((fact) => fact.key)).toEqual(['mileage']);
    expect(result.facts[0].value).not.toMatch(/km/);
  });

  test('a car reads its make, model and year as one vehicle fact and a limited mileage per day', () => {
    const result = facts({
      categoryVisualKey: 'car-rentals',
      metadata: {
        attributes: [
          { code: 'vehicle_make', data_type: 'STRING' },
          { code: 'vehicle_model', data_type: 'STRING' },
          integer('vehicle_year'),
          enumOf('mileage_policy'),
          integer('daily_distance_limit_km'),
        ],
        policies: [],
      },
      listing: {
        attribute_values: [
          { code: 'vehicle_make', value: 'Toyota' },
          { code: 'vehicle_model', value: 'RAV4' },
          { code: 'vehicle_year', value: '2023' },
          { code: 'mileage_policy', option_codes: ['LIMITED'] },
          { code: 'daily_distance_limit_km', value: '250' },
        ],
      },
    });
    expect(summary(result)).toEqual([
      ['vehicle', 'Vehicle', 'Toyota RAV4 2023'],
      ['mileage', 'Mileage', '250 km per day'],
    ]);
  });

  test('a hotel shows check-in/out from its policies and its number of room types', () => {
    const result = facts({
      categoryVisualKey: 'hotels',
      metadata: {
        attributes: [],
        policies: [
          { code: 'check_in_time', data_type: 'STRING' },
          { code: 'check_out_time', data_type: 'STRING' },
        ],
      },
      listing: {
        policy_values: [
          { code: 'check_in_time', value: '14:00' },
          { code: 'check_out_time', value: '12:00' },
        ],
      },
      units: [
        { bookable_unit_type: 'HOTEL_ROOM' },
        { bookable_unit_type: 'HOTEL_ROOM' },
      ],
    });
    expect(summary(result)).toEqual([
      ['check_in', 'Check-in', '14:00'],
      ['check_out', 'Check-out', '12:00'],
      ['room_types', 'Rooms', '2 room types'],
    ]);
    expect(result.consumedAttributeCodes).toEqual([]);
  });

  test("a restaurant shows today's Yerevan hours and free reservation only with a bookable table", () => {
    // Wednesday 2026-08-05, 23:30 in Yerevan (already Wednesday evening
    // there whatever the viewer's own timezone is).
    const now = new Date('2026-08-05T23:30:00+04:00');
    const weeklyHours = [
      {
        day_of_week: 3,
        opens_at: '11:00',
        closes_at: '23:00',
        is_closed: false,
      },
      { day_of_week: 4, opens_at: null, closes_at: null, is_closed: true },
    ];
    const withTable = facts({
      categoryVisualKey: 'restaurants',
      listing: {},
      units: [{ bookable_unit_type: 'RESTAURANT_TABLE' }],
      weeklyHours,
      now,
    });
    expect(summary(withTable)).toEqual([
      ['opening_today', 'Open today', '11:00 – 23:00'],
      ['reservation', 'Reservations', 'Free to reserve'],
    ]);

    const thursdayWithoutTable = facts({
      categoryVisualKey: 'restaurants',
      listing: {},
      weeklyHours,
      now: new Date('2026-08-06T09:00:00+04:00'),
    });
    expect(summary(thursdayWithoutTable)).toEqual([
      ['opening_today', 'Open today', 'Closed'],
    ]);
  });

  test(`keeps at most ${KEY_FACT_LIMIT} facts, and only the kept ones consume their attributes`, () => {
    const codes = [
      'space_type',
      'max_guests',
      'bedrooms',
      'beds',
      'bathrooms',
      'floor_area_sqm',
    ];
    const result = facts({
      categoryVisualKey: 'villas',
      metadata: {
        attributes: codes.map((code) => integer(code)),
        policies: [],
      },
      listing: {
        attribute_values: codes.map((code) => ({ code, value: '3' })),
      },
    });
    expect(result.facts).toHaveLength(KEY_FACT_LIMIT);
    expect(result.consumedAttributeCodes).toEqual(codes);

    const partial = facts({
      categoryVisualKey: 'villas',
      metadata: {
        attributes: [integer('bedrooms'), integer('pool_count')],
        policies: [],
      },
      listing: {
        attribute_values: [
          { code: 'bedrooms', value: '2' },
          { code: 'pool_count', value: '1' },
        ],
      },
    });
    expect(partial.consumedAttributeCodes).toEqual(['bedrooms']);
  });

  test('cancellation is never a key fact', () => {
    const result = facts({
      categoryVisualKey: 'hotels',
      metadata: {
        attributes: [],
        policies: [{ code: 'cancellation_policy', data_type: 'ENUM' }],
      },
      listing: {
        policy_values: [{ code: 'cancellation_policy', value: '1' }],
      },
    });
    expect(result.facts).toEqual([]);
  });
});

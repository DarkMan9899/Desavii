import { describe, test, expect } from 'vitest';
import { getActiveFilterChips } from './activeFilterChips.js';

// Mirrors i18next's t(key, defaultValue) signature well enough for these
// pure-logic tests — falls back to the default exactly like the real
// instance does for a key this suite never seeds a translation for.
const t = (key, defaultValueOrOptions) => {
  if (typeof defaultValueOrOptions === 'string') return defaultValueOrOptions;
  if (defaultValueOrOptions?.label !== undefined) {
    return `${key}:${defaultValueOrOptions.label}`;
  }
  if (defaultValueOrOptions?.value !== undefined) {
    return `${key}:${defaultValueOrOptions.value}`;
  }
  return Array.isArray(key) ? key[0] : key;
};

const BOOKING_GROUP = {
  code: 'BOOKING',
  definitions: [
    {
      code: 'pets_allowed',
      param: 'policy_pets_allowed',
      input_type: 'TOGGLE',
      value_source: 'POLICY',
      options: [],
    },
    {
      code: 'meal_plan',
      param: 'room_meal_plan',
      input_type: 'MULTI_SELECT',
      value_source: 'ROOM',
      options: [
        { value: 'BREAKFAST_INCLUDED', code: 'BREAKFAST_INCLUDED' },
        { value: 'HALF_BOARD', code: 'HALF_BOARD' },
      ],
    },
  ],
};

const RATING_GROUP = {
  code: 'RATING',
  definitions: [
    {
      code: 'guest_rating',
      param: 'ratingMin',
      input_type: 'SINGLE_SELECT',
      value_source: 'REVIEW',
      options: [{ value: '4', code: '4' }],
    },
  ],
};

const ROOMS_GROUP = {
  code: 'ROOMS',
  definitions: [
    {
      code: 'bedrooms',
      input_type: 'STEPPER',
      value_source: 'ATTRIBUTE',
      min: 0,
      max: 20,
      options: [],
    },
  ],
};

const EXPERIENCE_GROUP = {
  code: 'EXPERIENCE',
  definitions: [
    {
      code: 'duration_minutes',
      input_type: 'RANGE',
      value_source: 'ATTRIBUTE',
      min: 15,
      max: 720,
      options: [],
    },
    {
      code: 'difficulty',
      input_type: 'SINGLE_SELECT',
      value_source: 'ATTRIBUTE',
      options: [
        { value: 16, code: 'EASY' },
        { value: 17, code: 'MODERATE' },
      ],
    },
    {
      code: 'cuisine',
      input_type: 'MULTI_SELECT',
      value_source: 'ATTRIBUTE',
      options: [
        { value: 20, code: 'ARMENIAN' },
        { value: 21, code: 'ITALIAN' },
      ],
    },
  ],
};

const AMENITIES_GROUP = {
  code: 'AMENITIES',
  definitions: [
    {
      code: 'amenity_ids',
      input_type: 'MULTI_SELECT',
      value_source: 'AMENITY',
      options: [
        { value: 1, code: 'WiFi' },
        { value: 2, code: 'Parking' },
      ],
    },
  ],
};

describe('getActiveFilterChips (apps/web/src/modules/search/components/DynamicFilterPanel)', () => {
  test('returns nothing when no dynamic filters are set', () => {
    expect(getActiveFilterChips([ROOMS_GROUP], {}, t)).toEqual([]);
  });

  test('STEPPER produces a single "N+" chip clearing its one key', () => {
    const chips = getActiveFilterChips(
      [ROOMS_GROUP],
      { attr_bedrooms_min: '2' },
      t,
    );
    expect(chips).toEqual([
      {
        key: 'attr_bedrooms_min',
        keysToClear: ['attr_bedrooms_min'],
        label: expect.stringContaining('2+'),
      },
    ]);
  });

  test('RANGE with only one bound set falls back to the definition bound for the other', () => {
    const chips = getActiveFilterChips(
      [EXPERIENCE_GROUP],
      { attr_duration_minutes_min: '30' },
      t,
    );
    const rangeChip = chips.find((c) => c.key === 'attr_duration_minutes_min');
    expect(rangeChip.keysToClear).toEqual([
      'attr_duration_minutes_min',
      'attr_duration_minutes_max',
    ]);
    expect(rangeChip.label).toContain('30');
    expect(rangeChip.label).toContain('720');
  });

  test('SINGLE_SELECT resolves the option code, not the raw id', () => {
    const chips = getActiveFilterChips(
      [EXPERIENCE_GROUP],
      { attr_difficulty: '16' },
      t,
    );
    const chip = chips.find((c) => c.key === 'attr_difficulty');
    expect(chip.label).toContain('EASY');
  });

  test('MULTI_SELECT joins every resolved option label', () => {
    const chips = getActiveFilterChips(
      [EXPERIENCE_GROUP],
      { attr_cuisine: '20,21' },
      t,
    );
    const chip = chips.find((c) => c.key === 'attr_cuisine');
    expect(chip.label).toContain('ARMENIAN');
    expect(chip.label).toContain('ITALIAN');
  });

  test('AMENITY options are shown as-is, never passed through t()', () => {
    const chips = getActiveFilterChips(
      [AMENITIES_GROUP],
      { amenityIds: '1,2' },
      t,
    );
    const chip = chips.find((c) => c.key === 'amenityIds');
    expect(chip.label).toContain('WiFi');
    expect(chip.label).toContain('Parking');
  });

  test('a policy TOGGLE chip is just the policy name and clears its own param', () => {
    const [chip] = getActiveFilterChips(
      [BOOKING_GROUP],
      { policy_pets_allowed: 'true' },
      t,
    );
    expect(chip).toEqual({
      key: 'policy_pets_allowed',
      keysToClear: ['policy_pets_allowed'],
      label: 'pets_allowed',
    });
  });

  test('ROOM meal plans resolve through the meal-plan vocabulary', () => {
    const [chip] = getActiveFilterChips(
      [BOOKING_GROUP],
      { room_meal_plan: 'HALF_BOARD' },
      t,
    );
    expect(chip.key).toBe('room_meal_plan');
    expect(chip.label).toContain('HALF_BOARD');
  });

  test('the guest-rating chip formats its threshold in the visitor locale', () => {
    const [chip] = getActiveFilterChips(
      [RATING_GROUP],
      { ratingMin: '4' },
      t,
      'en',
    );
    expect(chip.key).toBe('ratingMin');
    expect(chip.label).toContain('search.dynamicFilters.ratingAtLeast:4');
  });

  test('a stale/unresolvable id mixed into a multi-select value is dropped, not rendered as "undefined"', () => {
    const chips = getActiveFilterChips(
      [EXPERIENCE_GROUP],
      { attr_cuisine: '20,999' },
      t,
    );
    const chip = chips.find((c) => c.key === 'attr_cuisine');
    expect(chip.label).toContain('ARMENIAN');
    expect(chip.label).not.toContain('undefined');
  });
});

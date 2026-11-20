import { describe, test, expect } from 'vitest';
import i18n from 'i18next';
import {
  resolveListingFactGroups,
  resolveStartTimes,
} from './listingFactGroups.js';

const en = i18n.getFixedT('en');
const ru = i18n.getFixedT('ru');

const enumOf = (code, dependsOn) => ({
  code,
  data_type: 'ENUM',
  options: [],
  ...(dependsOn ? { depends_on: dependsOn } : {}),
});
const multiOf = (code) => ({ code, data_type: 'MULTI_ENUM', options: [] });
const integer = (code, unit) => ({ code, data_type: 'INTEGER', unit });
const string = (code, dependsOn) => ({
  code,
  data_type: 'STRING',
  ...(dependsOn ? { depends_on: dependsOn } : {}),
});

const TOUR_ATTRIBUTES = [
  enumOf('tour_format'),
  enumOf('guide_type'),
  integer('duration_minutes', 'minutes'),
  multiOf('transport_modes'),
  multiOf('meals_included'),
  enumOf('weather_policy'),
  integer('min_age', 'years'),
  multiOf('languages_offered'),
  enumOf('meeting_point_type'),
  string('pickup_details', {
    attribute_code: 'meeting_point_type',
    option_code: 'HOTEL_PICKUP',
  }),
  enumOf('end_point_type'),
  string('end_point_details', {
    attribute_code: 'end_point_type',
    option_code: 'ENDS_ELSEWHERE',
  }),
];

function tour(values, extra = {}) {
  return resolveListingFactGroups(
    {
      categoryVisualKey: 'tours',
      locale: 'en',
      metadata: { attributes: TOUR_ATTRIBUTES },
      listing: { attribute_values: values },
      ...extra,
    },
    extra.t ?? en,
  );
}

const rows = (group) => group.rows.map((row) => [row.label, row.value]);

describe('resolveListingFactGroups — a tour', () => {
  const values = [
    { code: 'tour_format', option_codes: ['SHARED'] },
    { code: 'guide_type', option_codes: ['LIVE_GUIDE'] },
    { code: 'transport_modes', option_codes: ['MINIBUS', 'ON_FOOT'] },
    { code: 'meals_included', option_codes: ['LUNCH'] },
    { code: 'weather_policy', option_codes: ['ALL_WEATHER'] },
    { code: 'min_age', value: 8 },
    { code: 'languages_offered', option_codes: ['HY', 'EN', 'RU'] },
    { code: 'meeting_point_type', option_codes: ['HOTEL_PICKUP'] },
    { code: 'pickup_details', value: 'From any central Yerevan hotel' },
    { code: 'end_point_type', option_codes: ['ENDS_ELSEWHERE'] },
    { code: 'end_point_details', value: 'Republic Square' },
  ];
  const units = [
    { time_slot_start: '14:00' },
    { time_slot_start: '09:00' },
    { time_slot_start: '09:00' },
  ];

  test('reads as how it runs, who it is for, then meeting and pickup — its own section', () => {
    const groups = tour(values, { units });
    expect(groups.attributes.map((group) => group.heading)).toEqual([
      'How the tour runs',
      "Who it's for",
    ]);
    expect(rows(groups.attributes[0])).toEqual([
      ['Tour format', 'Small group'],
      ['Guide', 'Live guide'],
      ['Getting around', 'Minibus and On foot'],
      ['Food and drink included', 'Lunch'],
      ['Weather', 'Runs in any weather'],
    ]);
    // One group in the meeting section: the section heading names it.
    expect(groups.meeting).toHaveLength(1);
    expect(groups.meeting[0].heading).toBeNull();
    expect(rows(groups.meeting[0])).toEqual([
      ['Meeting point', 'Hotel pickup'],
      ['Pickup details', 'From any central Yerevan hotel'],
      ['Start times', '09:00 and 14:00'],
      ['Where it ends', 'A different place'],
      ['End point details', 'Republic Square'],
    ]);
  });

  test('lists follow the page language’s own grammar (RU joins the last item with «и»)', () => {
    const groups = tour(values, { t: ru, locale: 'ru' });
    const audience = groups.attributes.find(
      (group) => group.key === 'audience',
    );
    expect(
      audience.rows.find((row) => row.key === 'languages_offered').value,
    ).toMatch(/ и /);
  });

  test('a fact the key facts strip already shows is not repeated', () => {
    const groups = tour(values, {
      consumedCodes: ['tour_format', 'min_age', 'languages_offered'],
    });
    const keys = groups.attributes.flatMap((group) =>
      group.rows.map((row) => row.key),
    );
    expect(keys).not.toContain('tour_format');
    // "Who it's for" has nothing left, so the section has one group and no sub-heading.
    expect(groups.attributes).toHaveLength(1);
    expect(groups.attributes[0].heading).toBeNull();
  });

  test('a conditional detail shows only while its condition holds', () => {
    const groups = tour([
      { code: 'end_point_type', option_codes: ['RETURNS_TO_START'] },
      // A stale value from before the partner changed the answer.
      { code: 'end_point_details', value: 'Old end point' },
      { code: 'meeting_point_type', option_codes: ['FIXED_LOCATION'] },
      { code: 'pickup_details', value: 'Old pickup note' },
    ]);
    const meeting = rows(groups.meeting[0]);
    expect(meeting).toContainEqual([
      'Where it ends',
      'Back at the starting point',
    ]);
    expect(meeting.flat()).not.toContain('Old end point');
    expect(meeting.flat()).not.toContain('Old pickup note');
  });

  test('a fixed meeting point names the listing’s public place, not the word "Fixed location"', () => {
    const fixed = [
      { code: 'meeting_point_type', option_codes: ['FIXED_LOCATION'] },
    ];
    expect(
      rows(
        tour(fixed, {
          location: { address_line: '5 Abovyan St', city_name: 'Yerevan' },
        }).meeting[0],
      ),
    ).toEqual([['Meeting point', '5 Abovyan St, Yerevan']]);
    expect(
      rows(
        tour(fixed, { location: { address_line: null, city_name: 'Dilijan' } })
          .meeting[0],
      ),
    ).toEqual([['Meeting point', 'Dilijan']]);
  });

  test('a legacy listing with no facts has no fact sections at all', () => {
    expect(tour([])).toEqual({ attributes: [], meeting: [] });
    expect(
      resolveListingFactGroups(
        {
          categoryVisualKey: 'tours',
          locale: 'en',
          metadata: undefined,
          listing: {},
        },
        en,
      ),
    ).toEqual({ attributes: [], meeting: [] });
  });

  test('free text is passed on as plain text, never markup', () => {
    const groups = tour([
      { code: 'meeting_point_type', option_codes: ['HOTEL_PICKUP'] },
      { code: 'pickup_details', value: '<img src=x onerror=alert(1)>' },
    ]);
    expect(groups.meeting[0].rows[1].value).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('resolveListingFactGroups — other categories', () => {
  test('a car reads as the car, its engine and drive, then driver and mileage', () => {
    const groups = resolveListingFactGroups(
      {
        categoryVisualKey: 'car-rentals',
        locale: 'en',
        metadata: {
          attributes: [
            enumOf('body_type'),
            enumOf('drive_type'),
            integer('min_driver_age', 'years'),
          ],
        },
        listing: {
          attribute_values: [
            { code: 'body_type', option_codes: ['SUV'] },
            { code: 'drive_type', option_codes: ['ALL_WHEEL_DRIVE'] },
            { code: 'min_driver_age', value: 21 },
          ],
        },
      },
      en,
    );
    expect(groups.attributes.map((group) => group.heading)).toEqual([
      'Car',
      'Engine and drive',
      'Driver and mileage',
    ]);
    expect(groups.meeting).toEqual([]);
  });

  test('a venue lists its real session times; a session without a time adds nothing', () => {
    const resolve = (units) =>
      resolveListingFactGroups(
        {
          categoryVisualKey: 'entertainment-venues',
          locale: 'en',
          metadata: { attributes: [enumOf('venue_type')] },
          listing: {
            attribute_values: [
              { code: 'venue_type', option_codes: ['ESCAPE_ROOM'] },
            ],
          },
          units,
        },
        en,
      );
    expect(rows(resolve([{ time_slot_start: '18:00' }]).attributes[0])).toEqual(
      [
        ['Type of venue', 'Escape room'],
        ['Session times', '18:00'],
      ],
    );
    expect(
      rows(resolve([{ time_slot_start: null }]).attributes[0]),
    ).toHaveLength(1);
  });

  test('an attribute no group names (a newly seeded one) still shows, under "More details"', () => {
    const groups = resolveListingFactGroups(
      {
        categoryVisualKey: 'tours',
        locale: 'en',
        metadata: {
          attributes: [enumOf('guide_type'), string('brand_new_fact')],
        },
        listing: {
          attribute_values: [
            { code: 'guide_type', option_codes: ['AUDIO_GUIDE'] },
            { code: 'brand_new_fact', value: 'Shown' },
          ],
        },
      },
      en,
    );
    const more = groups.attributes.find((group) => group.key === 'more');
    expect(more.heading).toBe('More details');
    expect(more.rows[0].value).toBe('Shown');
  });

  test('a category without its own groups lists every fact in one group', () => {
    const groups = resolveListingFactGroups(
      {
        categoryVisualKey: 'hotels',
        locale: 'en',
        metadata: { attributes: [enumOf('property_style')] },
        listing: {
          attribute_values: [
            { code: 'property_style', option_codes: ['BOUTIQUE'] },
          ],
        },
      },
      en,
    );
    expect(groups.attributes).toHaveLength(1);
    expect(groups.attributes[0].heading).toBeNull();
  });
});

describe('resolveStartTimes', () => {
  test('distinct, in order, ignoring units without a time', () => {
    expect(
      resolveStartTimes([
        { time_slot_start: '14:00' },
        { time_slot_start: null },
        { time_slot_start: '09:00' },
        { time_slot_start: '14:00' },
      ]),
    ).toEqual(['09:00', '14:00']);
    expect(resolveStartTimes()).toEqual([]);
  });
});

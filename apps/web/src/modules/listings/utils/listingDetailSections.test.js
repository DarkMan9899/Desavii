import { describe, test, expect } from 'vitest';
import {
  buildListingDetailSections,
  SECTION_IDS,
} from './listingDetailSections.js';

const t = (key) => key;
const EMPTY_CONTENT = {
  highlights: [],
  itinerarySteps: [],
  includedItems: [],
  faqs: [],
  guestNotes: [],
};
const METADATA = {
  attributes: [{ code: 'star_rating' }],
  amenity_groups: [
    { code: 'GENERAL', amenities: [{ value: 7, code: 'Pool', key: 'POOL' }] },
  ],
  policies: [{ code: 'check_in_time' }],
};
// What the resolvers return for a listing with one stored fact and one rule
// (`listingFactGroups.js`, `listingRules.js`).
const row = { key: 'star_rating', label: 'Stars', value: '4' };
const FACT_GROUPS = {
  attributes: [{ key: 'all', heading: null, rows: [row] }],
  meeting: [],
};
const RULES = [{ code: 'check_in_time', title: 'Check-in' }];

function build(overrides = {}) {
  return buildListingDetailSections({
    listing: {
      amenity_ids: [7],
      location: { city_name: 'Yerevan' },
      company: { slug: 'ararat-stays' },
      ...overrides.listing,
    },
    metadata: METADATA,
    content: { ...EMPTY_CONTENT, ...overrides.content },
    description: 'A real description.',
    units: overrides.units ?? [],
    menus: overrides.menus ?? [],
    weeklyHours: overrides.weeklyHours ?? [],
    factGroups: overrides.factGroups ?? FACT_GROUPS,
    rules: overrides.rules ?? RULES,
    categoryVisualKey: overrides.categoryVisualKey ?? 'hotels',
    t,
  });
}

const ids = (sections) => sections.map((section) => section.id);

describe('buildListingDetailSections — content decides presence', () => {
  test('a section exists only when the listing has its content', () => {
    const { ordered } = build({
      listing: { amenity_ids: [], company: null, location: null },
    });
    expect(ids(ordered)).not.toContain(SECTION_IDS.AMENITIES);
    expect(ids(ordered)).not.toContain(SECTION_IDS.PARTNER);
    expect(ids(ordered)).not.toContain(SECTION_IDS.LOCATION);
    expect(ids(ordered)).not.toContain(SECTION_IDS.ROOMS);
    expect(ids(ordered)).not.toContain(SECTION_IDS.MENU);
  });

  test('details and rules exist only when they have something to show — never a link to an empty section', () => {
    const empty = build({
      factGroups: { attributes: [], meeting: [] },
      rules: [],
    });
    expect(ids(empty.navigable)).not.toContain(SECTION_IDS.ATTRIBUTES);
    expect(ids(empty.navigable)).not.toContain(SECTION_IDS.POLICIES);
    expect(ids(empty.navigable)).not.toContain(SECTION_IDS.MEETING);

    const full = build();
    expect(ids(full.navigable)).toContain(SECTION_IDS.ATTRIBUTES);
    expect(ids(full.navigable)).toContain(SECTION_IDS.POLICIES);
  });

  test('reviews are always there — with an honest empty state when needed', () => {
    const { ordered } = build({ listing: { company: null } });
    expect(ids(ordered)).toContain(SECTION_IDS.REVIEWS);
  });

  test('availability is a status, never a navigation destination', () => {
    const { ordered, navigable } = build();
    expect(ids(ordered)).toContain(SECTION_IDS.AVAILABILITY);
    expect(ids(navigable)).not.toContain(SECTION_IDS.AVAILABILITY);
  });

  test('a hotel shows rooms only with real room units', () => {
    expect(
      ids(build({ units: [{ bookable_unit_type: 'HOTEL_ROOM' }] }).ordered),
    ).toContain(SECTION_IDS.ROOMS);
    expect(
      ids(build({ units: [{ bookable_unit_type: 'TOUR_SLOT' }] }).ordered),
    ).not.toContain(SECTION_IDS.ROOMS);
  });

  test('a restaurant menu appears only when one is active', () => {
    expect(
      ids(
        build({
          categoryVisualKey: 'restaurants',
          menus: [{ is_active: false }],
        }).ordered,
      ),
    ).not.toContain(SECTION_IDS.MENU);
  });
});

describe('buildListingDetailSections — each category reads in its own order', () => {
  test('a hotel: rooms right after the description', () => {
    const order = ids(
      build({ units: [{ bookable_unit_type: 'HOTEL_ROOM' }] }).ordered,
    );
    expect(order.slice(0, 2)).toEqual([SECTION_IDS.ABOUT, SECTION_IDS.ROOMS]);
  });

  test('a restaurant: the menu and hours right after the description', () => {
    const order = ids(
      build({
        categoryVisualKey: 'restaurants',
        menus: [{ is_active: true }],
        weeklyHours: [{ day_of_week: 1 }],
      }).ordered,
    );
    expect(order.slice(0, 3)).toEqual([
      SECTION_IDS.ABOUT,
      SECTION_IDS.MENU,
      SECTION_IDS.OPENING_HOURS,
    ]);
  });

  test('a tour: the itinerary right after the description', () => {
    const order = ids(
      build({
        categoryVisualKey: 'tours',
        content: { itinerarySteps: [{ id: 1 }] },
      }).ordered,
    );
    expect(order.slice(0, 2)).toEqual([
      SECTION_IDS.ABOUT,
      SECTION_IDS.ITINERARY,
    ]);
  });

  test('a tour: what is included, then where it starts, then how it runs', () => {
    const order = ids(
      build({
        categoryVisualKey: 'tours',
        content: { itinerarySteps: [{ id: 1 }], includedItems: [{ id: 1 }] },
        factGroups: {
          ...FACT_GROUPS,
          meeting: [{ key: 'meeting', heading: null, rows: [row] }],
        },
      }).ordered,
    );
    expect(order.slice(0, 5)).toEqual([
      SECTION_IDS.ABOUT,
      SECTION_IDS.ITINERARY,
      SECTION_IDS.INCLUDED,
      SECTION_IDS.MEETING,
      SECTION_IDS.ATTRIBUTES,
    ]);
  });

  test('a car rental: the vehicle specifications right after the description', () => {
    const order = ids(build({ categoryVisualKey: 'car-rentals' }).ordered);
    expect(order.slice(0, 2)).toEqual([
      SECTION_IDS.ABOUT,
      SECTION_IDS.ATTRIBUTES,
    ]);
  });

  test('every category: reviews, then the place, then the company', () => {
    [
      'hotels',
      'apartments',
      'villas',
      'guest-houses',
      'restaurants',
      'tours',
      'car-rentals',
      'attractions',
      'entertainment-venues',
    ].forEach((categoryVisualKey) => {
      const order = ids(build({ categoryVisualKey }).ordered);
      expect(order.indexOf(SECTION_IDS.REVIEWS)).toBeLessThan(
        order.indexOf(SECTION_IDS.LOCATION),
      );
      expect(order.indexOf(SECTION_IDS.LOCATION)).toBeLessThan(
        order.indexOf(SECTION_IDS.PARTNER),
      );
    });
  });
});

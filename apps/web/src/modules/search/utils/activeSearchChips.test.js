import { describe, test, expect } from 'vitest';
import i18n from '../../../translations/i18n.js';
import {
  buildActiveSearchChips,
  formatSearchDates,
} from './activeSearchChips.js';

const CATEGORIES = [{ id: 1, slug: 'hotels', name: 'Hotels' }];
const DESTINATIONS = [{ id: 2, name: 'Gyumri', listing_count: 5 }];
const GROUPS = [
  {
    code: 'RATING',
    definitions: [
      {
        code: 'star_rating',
        input_type: 'SINGLE_SELECT',
        value_source: 'ATTRIBUTE',
        options: [{ value: 4, code: '4' }],
      },
    ],
  },
];

function chipsFor(filters, overrides = {}) {
  return buildActiveSearchChips({
    filters: {
      destination: '',
      sort: 'newest',
      dynamicFilters: {},
      ...filters,
    },
    categories: CATEGORIES,
    destinations: DESTINATIONS,
    groups: GROUPS,
    party: 'guests',
    t: i18n.getFixedT('en'),
    locale: 'en',
    ...overrides,
  });
}

describe('activeSearchChips (apps/web/src/modules/search)', () => {
  test('formats calendar dates without a timezone shift', () => {
    expect(formatSearchDates('2026-11-01', '2026-11-01', 'en')).toBe('Nov 1');
    // Intl puts thin spaces around the range dash.
    expect(formatSearchDates('2026-11-01', '2026-11-04', 'en')).toMatch(
      /^Nov 1\s–\s4$/u,
    );
  });

  test('one chip per applied filter, in form order, each knowing how to remove itself', () => {
    const chips = chipsFor({
      destination: 'spa',
      cityId: 2,
      categoryId: 1,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-04',
      guests: 1,
      priceMin: 10000,
      priceMax: 20000,
      dynamicFilters: { attr_star_rating: '4' },
    });
    expect(chips.map((chip) => chip.label.replace(/\s/gu, ' '))).toEqual([
      '“spa”',
      'Gyumri',
      'Hotels',
      'Nov 1 – 4',
      '1 guest',
      '֏10,000 – ֏20,000',
      'Star rating: 4 stars',
    ]);
    expect(chips.find((chip) => chip.key === 'dates').patch).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
    });
    expect(chips.at(-1).dynamicKeys).toEqual(['attr_star_rating']);
  });

  test('a one-sided price range says "from" / "up to"', () => {
    expect(chipsFor({ priceMin: 5000 })[0].label).toBe('From ֏5,000');
    expect(chipsFor({ priceMax: 5000 })[0].label).toBe('Up to ֏5,000');
  });

  test('a party size is shown only where the category has a party field', () => {
    expect(chipsFor({ guests: 3 }, { party: null })).toEqual([]);
    expect(chipsFor({ guests: 3 }, { party: 'travelers' })[0].label).toBe(
      '3 travelers',
    );
  });

  test('no filters, no chips', () => {
    expect(chipsFor({})).toEqual([]);
  });
});

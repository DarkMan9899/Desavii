import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useSearchFilters } from './useSearchFilters.js';
import { useRenderableFilterGroups } from './useRenderableFilterGroups.js';

vi.mock('./useRenderableFilterGroups.js', () => ({
  useRenderableFilterGroups: vi.fn(),
  default: vi.fn(),
}));

// The filter catalog each category declares (`GET /search/filters`),
// reduced to the params that matter here: Hotels offers bedrooms,
// amenities and guest rating; every other category only guest rating.
const definition = (param, inputType) => ({
  code: param,
  param,
  input_type: inputType,
  value_source: 'ATTRIBUTE',
  options: [{ value: 1, code: '1', count: 1 }],
});
const RATING = definition('ratingMin', 'SINGLE_SELECT');
const CATALOG_BY_CATEGORY = {
  1: [
    definition('attr_bedrooms', 'STEPPER'),
    definition('amenityIds', 'MULTI_SELECT'),
    RATING,
  ],
};
const catalog = { isPending: false };

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels' },
  { id: 6, slug: 'tours', name: 'Tours' },
  { id: 7, slug: 'car-rentals', name: 'Car Rentals' },
];
const DESTINATIONS = [{ id: 1, name: 'Yerevan', listing_count: 20 }];
const AREA = '44.40000,40.10000,44.60000,40.25000';
const OTHER_AREA = '43.80000,40.70000,43.90000,40.85000';

// A minimal harness rather than `renderHook` — exercises the hook the way
// the Search page does, through real DOM events driving real URL changes.
function Harness({ catalogs }) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    filters,
    isResolved,
    updateFilters,
    updateDynamicFilter,
    clearFilters,
    activeFilterCount,
  } = useSearchFilters(catalogs);
  const actions = {
    'set destination': () => updateFilters({ destination: 'yerevan' }),
    'set hotels': () => updateFilters({ categoryId: 1 }),
    'set tours': () => updateFilters({ categoryId: 6 }),
    'set car rentals': () => updateFilters({ categoryId: 7 }),
    'set relevance': () => updateFilters({ sort: 'relevance' }),
    'clear destination': () => updateFilters({ destination: '' }),
    'clear all': clearFilters,
    'set bedrooms': () => updateDynamicFilter({ attr_bedrooms_min: '2' }),
    'set amenities': () => updateDynamicFilter({ amenityIds: '1,2' }),
    'clear bedrooms': () => updateDynamicFilter({ attr_bedrooms_min: '' }),
    'set rating': () => updateDynamicFilter({ ratingMin: '4' }),
    'apply nothing new': () => updateFilters({}),
    'set city': () => updateFilters({ cityId: 1 }),
    'set area': () => updateFilters({ bbox: AREA }),
    'set other area': () => updateFilters({ bbox: OTHER_AREA }),
    'clear area': () => updateFilters({ bbox: undefined }),
    'show map': () => updateFilters({ view: 'map' }),
    'show list': () => updateFilters({ view: 'list' }),
    back: () => navigate(-1),
  };
  return (
    <div>
      <p data-testid="url">{location.search}</p>
      <p data-testid="historyKey">{location.key}</p>
      <p data-testid="filters">{JSON.stringify(filters)}</p>
      <p data-testid="isResolved">{String(isResolved)}</p>
      <p data-testid="count">{activeFilterCount}</p>
      {Object.entries(actions).map(([label, onClick]) => (
        <button key={label} type="button" onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
  );
}
Harness.propTypes = {
  catalogs: PropTypes.shape({
    categories: PropTypes.arrayOf(PropTypes.shape({})),
    destinations: PropTypes.arrayOf(PropTypes.shape({})),
  }).isRequired,
};

const LOADED_CATALOGS = { categories: CATEGORIES, destinations: DESTINATIONS };

function renderHarness(
  initialEntry = '/en/search',
  catalogs = LOADED_CATALOGS,
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/:locale/search"
          element={<Harness catalogs={catalogs} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

const readFilters = () => JSON.parse(screen.getByTestId('filters').textContent);
const readUrl = () => screen.getByTestId('url').textContent;

describe('useSearchFilters (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    catalog.isPending = false;
    useRenderableFilterGroups.mockImplementation((categoryId) => ({
      isPending: catalog.isPending,
      groups: catalog.isPending
        ? []
        : [
            {
              code: 'ALL',
              definitions: CATALOG_BY_CATEGORY[categoryId] ?? [RATING],
            },
          ],
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('defaults to no active filters', () => {
    renderHarness();
    expect(readFilters()).toMatchObject({ destination: '', sort: 'newest' });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('isResolved')).toHaveTextContent('true');
  });

  test('a deep link waits for the catalogs it depends on before it counts as resolved', () => {
    renderHarness('/en/search?categoryId=1', {});
    expect(screen.getByTestId('isResolved')).toHaveTextContent('false');
  });

  test('a nav ?category=<slug> link resolves to the real id and the URL settles on its canonical form', () => {
    renderHarness('/en/search?category=hotels&utm_source=nav');
    expect(readFilters().categoryId).toBe(1);
    expect(readUrl()).toBe('?categoryId=1');
  });

  test('an unknown category or city id is dropped, not searched for', () => {
    renderHarness('/en/search?categoryId=999&cityId=42');
    expect(readFilters().categoryId).toBeUndefined();
    expect(readFilters().cityId).toBeUndefined();
    expect(readUrl()).toBe('');
  });

  test('a single-day category keeps only the first date of a range', () => {
    renderHarness(
      '/en/search?categoryId=6&dateFrom=2026-11-03&dateTo=2026-11-07',
    );
    expect(readFilters()).toMatchObject({
      dateFrom: '2026-11-03',
      dateTo: '2026-11-03',
    });
    expect(readUrl()).toBe(
      '?categoryId=6&dateFrom=2026-11-03&dateTo=2026-11-03',
    );
  });

  test('a category without a party field drops a guests value', () => {
    renderHarness('/en/search?categoryId=7&guests=3');
    expect(readFilters().guests).toBeUndefined();
    expect(readUrl()).toBe('?categoryId=7');
  });

  test('updateFilters writes one history entry that Back undoes', async () => {
    const user = userEvent.setup();
    renderHarness();
    await user.click(screen.getByRole('button', { name: 'set destination' }));
    expect(readUrl()).toBe('?destination=yerevan');
    await user.click(screen.getByRole('button', { name: 'back' }));
    expect(readUrl()).toBe('');
  });

  test('downgrades "relevance" sort back to the default once the keyword is cleared', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?destination=yerevan&sort=relevance');
    expect(readFilters().sort).toBe('relevance');

    await user.click(screen.getByRole('button', { name: 'clear destination' }));
    expect(readFilters()).toMatchObject({ destination: '', sort: 'newest' });
  });

  test('clearFilters removes every filter but keeps the chosen sort', async () => {
    const user = userEvent.setup();
    renderHarness(
      '/en/search?destination=yerevan&categoryId=1&cityId=1&sort=oldest&priceMax=5000&attr_bedrooms_min=2',
    );
    await user.click(screen.getByRole('button', { name: 'clear all' }));
    expect(readUrl()).toBe('?sort=oldest');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  test('updateDynamicFilter merges keys and an empty value removes one', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?categoryId=1');
    await user.click(screen.getByRole('button', { name: 'set bedrooms' }));
    await user.click(screen.getByRole('button', { name: 'set amenities' }));
    expect(readFilters().dynamicFilters).toEqual({
      attr_bedrooms_min: '2',
      amenityIds: '1,2',
    });
    await user.click(screen.getByRole('button', { name: 'clear bedrooms' }));
    expect(readFilters().dynamicFilters).toEqual({ amenityIds: '1,2' });
  });

  test('changing category clears the old category filters and applies the new one rules', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?categoryId=1&guests=3');
    await user.click(screen.getByRole('button', { name: 'set bedrooms' }));
    await user.click(screen.getByRole('button', { name: 'set car rentals' }));
    expect(readFilters()).toMatchObject({ categoryId: 7, dynamicFilters: {} });
    expect(readFilters().guests).toBeUndefined();
  });

  test('re-selecting the same category keeps its filters', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?categoryId=1');
    await user.click(screen.getByRole('button', { name: 'set bedrooms' }));
    await user.click(screen.getByRole('button', { name: 'set hotels' }));
    expect(readFilters().dynamicFilters).toEqual({ attr_bedrooms_min: '2' });
  });

  test('a category filter the category does not offer is dropped from the URL', () => {
    renderHarness('/en/search?categoryId=7&attr_bedrooms_min=2&ratingMin=4');
    expect(readFilters().dynamicFilters).toEqual({ ratingMin: '4' });
    expect(readUrl()).toBe('?categoryId=7&ratingMin=4');
  });

  test('category filters wait for their catalog before the search counts as resolved', () => {
    catalog.isPending = true;
    const { unmount } = renderHarness('/en/search?categoryId=1&amenityIds=2');
    expect(screen.getByTestId('isResolved')).toHaveTextContent('false');
    unmount();
    renderHarness('/en/search?categoryId=1');
    expect(screen.getByTestId('isResolved')).toHaveTextContent('true');
  });

  test('changing category keeps the guest rating (it applies to every category)', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?categoryId=1&attr_bedrooms_min=2');
    await user.click(screen.getByRole('button', { name: 'set rating' }));
    await user.click(screen.getByRole('button', { name: 'set car rentals' }));
    expect(readFilters()).toMatchObject({
      categoryId: 7,
      dynamicFilters: { ratingMin: '4' },
    });
  });

  test('a write that changes nothing adds no history entry (and so no request)', async () => {
    const user = userEvent.setup();
    renderHarness('/en/search?categoryId=1');
    const before = screen.getByTestId('historyKey').textContent;
    await user.click(screen.getByRole('button', { name: 'apply nothing new' }));
    expect(screen.getByTestId('historyKey')).toHaveTextContent(before);
  });

  test('counts each applied filter once (a price range is one filter)', () => {
    renderHarness(
      '/en/search?destination=a&categoryId=1&cityId=1&dateFrom=2026-11-01&dateTo=2026-11-03&guests=2&priceMin=1&priceMax=9&amenityIds=1',
    );
    expect(screen.getByTestId('count')).toHaveTextContent('7');
  });

  describe('map state (view and bbox)', () => {
    test('the List/Map view and a committed area are URL state, view=list never written', async () => {
      const user = userEvent.setup();
      renderHarness('/en/search?categoryId=1');
      await user.click(screen.getByRole('button', { name: 'show map' }));
      await user.click(screen.getByRole('button', { name: 'set area' }));
      expect(readUrl()).toBe(
        `?categoryId=1&bbox=${encodeURIComponent(AREA)}&view=map`,
      );
      await user.click(screen.getByRole('button', { name: 'show list' }));
      expect(readUrl()).toBe(`?categoryId=1&bbox=${encodeURIComponent(AREA)}`);
    });

    test('Back restores the previous area; clearing the area removes bbox', async () => {
      const user = userEvent.setup();
      renderHarness('/en/search?categoryId=1&view=map');
      await user.click(screen.getByRole('button', { name: 'set area' }));
      await user.click(screen.getByRole('button', { name: 'set other area' }));
      expect(readFilters().bbox).toBe(OTHER_AREA);
      await user.click(screen.getByRole('button', { name: 'back' }));
      expect(readFilters().bbox).toBe(AREA);
      await user.click(screen.getByRole('button', { name: 'clear area' }));
      expect(readFilters().bbox).toBeUndefined();
      expect(readUrl()).toBe('?categoryId=1&view=map');
    });

    test('a new category keeps the area; a new destination clears it', async () => {
      const user = userEvent.setup();
      renderHarness(`/en/search?categoryId=1&bbox=${AREA}`);
      await user.click(screen.getByRole('button', { name: 'set car rentals' }));
      expect(readFilters()).toMatchObject({ categoryId: 7, bbox: AREA });
      await user.click(screen.getByRole('button', { name: 'set city' }));
      expect(readFilters().cityId).toBe(1);
      expect(readFilters().bbox).toBeUndefined();
    });

    test('Clear filters drops the area (a filter) but keeps the Map view', async () => {
      const user = userEvent.setup();
      renderHarness(`/en/search?categoryId=1&bbox=${AREA}&view=map`);
      await user.click(screen.getByRole('button', { name: 'clear all' }));
      expect(readUrl()).toBe('?view=map');
    });

    test('an area counts as an active filter; the view does not', () => {
      renderHarness(`/en/search?bbox=${AREA}&view=map`);
      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });
  });
});

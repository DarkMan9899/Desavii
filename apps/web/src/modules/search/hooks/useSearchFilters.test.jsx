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

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels' },
  { id: 6, slug: 'tours', name: 'Tours' },
  { id: 7, slug: 'car-rentals', name: 'Car Rentals' },
];
const DESTINATIONS = [{ id: 1, name: 'Yerevan', listing_count: 20 }];

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
    back: () => navigate(-1),
  };
  return (
    <div>
      <p data-testid="url">{location.search}</p>
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
    renderHarness();
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

  test('counts each applied filter once (a price range is one filter)', () => {
    renderHarness(
      '/en/search?destination=a&categoryId=1&cityId=1&dateFrom=2026-11-01&dateTo=2026-11-03&guests=2&priceMin=1&priceMax=9&amenityIds=1',
    );
    expect(screen.getByTestId('count')).toHaveTextContent('7');
  });
});

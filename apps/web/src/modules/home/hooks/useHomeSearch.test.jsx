import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import PropTypes from 'prop-types';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import useHomeSearch from './useHomeSearch.js';
import {
  useCategoriesQuery,
  useDestinationsQuery,
} from '../../search/index.js';

vi.mock('../../search/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useCategoriesQuery: vi.fn(),
  useDestinationsQuery: vi.fn(),
}));

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels' },
  { id: 5, slug: 'restaurants', name: 'Restaurants' },
  { id: 7, slug: 'car-rentals', name: 'Car rentals' },
];
const DESTINATIONS = [{ id: 11, slug: 'dilijan', name: 'Dilijan' }];

let location;
function LocationProbe() {
  location = useLocation();
  return null;
}

function Wrapper({ children }) {
  return (
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route
          path="/:locale"
          element={
            <>
              {children}
              <LocationProbe />
            </>
          }
        />
        <Route path="/:locale/search" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

Wrapper.propTypes = { children: PropTypes.node.isRequired };

const renderSearch = () =>
  renderHook(() => useHomeSearch(), { wrapper: Wrapper });
const navigatedTo = () => `${location.pathname}${location.search}`;

describe('useHomeSearch — the Search page’s own rules on Home', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES });
    useDestinationsQuery.mockReturnValue({ data: DESTINATIONS });
  });

  test('starts from exactly what /search reads from an empty URL', () => {
    const { result } = renderSearch();
    expect(result.current.filters).toMatchObject({
      destination: '',
      sort: 'newest',
      dynamicFilters: {},
    });
  });

  test('Search with nothing chosen opens /search with no params', () => {
    const { result } = renderSearch();
    act(() => {
      result.current.submit();
    });
    expect(navigatedTo()).toBe('/en/search');
  });

  test('a real destination is sent as cityId, with the category and party size, in canonical order', () => {
    const { result } = renderSearch();
    act(() => result.current.onApply({ cityId: 11 }));
    act(() => result.current.onApply({ categoryId: 1 }));
    act(() => result.current.onApply({ guests: 3 }));
    act(() => {
      result.current.submit();
    });
    expect(navigatedTo()).toBe('/en/search?categoryId=1&cityId=11&guests=3');
  });

  test('switching to a category without a party size drops it, as /search does', () => {
    const { result } = renderSearch();
    act(() => result.current.onApply({ categoryId: 1, guests: 2 }));
    act(() => result.current.onApply({ categoryId: 7 }));
    expect(result.current.filters.guests).toBeUndefined();
  });

  test('a single-day category reads a stay range as its first day, as /search does', () => {
    const { result } = renderSearch();
    act(() =>
      result.current.onApply({
        categoryId: 1,
        dateFrom: '2030-05-10',
        dateTo: '2030-05-14',
      }),
    );
    act(() => result.current.onApply({ categoryId: 5 }));
    expect(result.current.filters).toMatchObject({
      dateFrom: '2030-05-10',
      dateTo: '2030-05-10',
    });
  });

  test('text still being typed is included when Search is pressed', () => {
    const { result } = renderSearch();
    act(() => result.current.draft.setKeyword('wine tour'));
    act(() => {
      result.current.submit();
    });
    expect(navigatedTo()).toBe('/en/search?destination=wine+tour');
  });

  test('a date range missing its end keeps the visitor on Home', () => {
    const { result } = renderSearch();
    act(() => result.current.onApply({ categoryId: 1 }));
    act(() =>
      result.current.draft.setDates({ start: '2030-05-10', end: null }),
    );
    let submitted;
    act(() => {
      submitted = result.current.submit();
    });
    expect(submitted).toBe(false);
    expect(location.pathname).toBe('/en');
    expect(result.current.draft.dateError).toBe('endRequired');
  });

  test('a choice made while the catalogs are still loading is kept, not dropped', () => {
    useCategoriesQuery.mockReturnValue({ data: undefined });
    useDestinationsQuery.mockReturnValue({ data: undefined });
    const { result } = renderSearch();
    act(() => result.current.onApply({ cityId: 11, categoryId: 1 }));
    expect(result.current.filters).toMatchObject({ cityId: 11, categoryId: 1 });
  });

  // Ask Desavii: an interpreted request starts the choices over and lands
  // on exactly the URL /search would build for it.
  test('an interpreted request opens /search with its real ids, in canonical order', () => {
    const { result } = renderSearch();
    act(() => result.current.onApply({ guests: 3 }));
    act(() =>
      result.current.searchWith({
        destination: 'quiet stay',
        categoryId: 1,
        cityId: 11,
        dynamicFilters: { amenityIds: '7,9' },
      }),
    );
    expect(navigatedTo()).toBe(
      '/en/search?destination=quiet+stay&categoryId=1&cityId=11&amenityIds=7%2C9',
    );
  });

  test('refining an interpreted request puts it into the fields without leaving Home', () => {
    const { result } = renderSearch();
    act(() => result.current.replaceWith({ destination: 'Garni', cityId: 11 }));
    expect(location.pathname).toBe('/en');
    expect(result.current.filters).toMatchObject({
      destination: 'Garni',
      cityId: 11,
    });
    expect(result.current.draft.keyword).toBe('Garni');
  });
});

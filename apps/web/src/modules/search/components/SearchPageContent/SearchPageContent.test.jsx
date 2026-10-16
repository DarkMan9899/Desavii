import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import SearchPageContent from './SearchPageContent.jsx';
import { useSearchListingsQuery } from '../../queries/useSearchListingsQuery.js';
import { useCategoriesQuery } from '../../queries/useCategoriesQuery.js';
import { useDestinationsQuery } from '../../queries/useDestinationsQuery.js';
import { useSearchFilterDefinitionsQuery } from '../../queries/useSearchFilterDefinitionsQuery.js';
import { useParseSearchQueryMutation } from '../../../ai/mutations/useParseSearchQueryMutation.js';
import hy from '../../../../../public/locales/hy/common.json';

// Only data-fetching hooks are mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern); the URL state hook and every component render for
// real, exercising the page as one composition.
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({ default: () => null }),
);
vi.mock('../../queries/useSearchListingsQuery.js', () => ({
  useSearchListingsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useCategoriesQuery.js', () => ({
  useCategoriesQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useDestinationsQuery.js', () => ({
  useDestinationsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useSearchFilterDefinitionsQuery.js', () => ({
  useSearchFilterDefinitionsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../ai/mutations/useParseSearchQueryMutation.js', () => ({
  useParseSearchQueryMutation: vi.fn(),
  default: vi.fn(),
}));

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search;
const CATEGORIES = [{ id: 1, slug: 'hotels', name: 'Hotels' }];
const DESTINATIONS = [{ id: 1, name: 'Yerevan', listing_count: 20 }];

function resultsPage(results, meta = {}) {
  return {
    data: { pages: [{ results, meta: { total: results.length, ...meta } }] },
    isPending: false,
    isError: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  };
}

function LocationProbe() {
  const { search } = useLocation();
  return <p data-testid="url">{search}</p>;
}

function renderPage(entry = '/hy/search') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/:locale/search"
          element={
            <>
              <SearchPageContent />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const lastQueryCall = () => useSearchListingsQuery.mock.calls.at(-1);

describe('SearchPageContent (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    useCategoriesQuery.mockReturnValue({ data: CATEGORIES });
    useDestinationsQuery.mockReturnValue({ data: DESTINATIONS });
    useSearchFilterDefinitionsQuery.mockReturnValue({ data: [] });
    useParseSearchQueryMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
    useSearchListingsQuery.mockReturnValue(resultsPage([]));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('reads title, search panel, count and results in that order', () => {
    useSearchListingsQuery.mockReturnValue(
      resultsPage([{ id: 1, listing_type: 'HOTEL', title: 'First' }], {
        total: 45,
      }),
    );
    renderPage();
    expect(
      screen.getByRole('heading', { name: hy.pages.search.title, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('45 արդյունք');
    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
  });

  test('a deep link waits for the catalogs before searching, then searches once with what it means', () => {
    useCategoriesQuery.mockReturnValue({ data: undefined });
    const { rerender } = renderPage('/hy/search?category=hotels');
    expect(lastQueryCall()[1]).toMatchObject({ enabled: false });
    expect(screen.getByRole('status')).toHaveTextContent(T.results.loading);

    useCategoriesQuery.mockReturnValue({ data: CATEGORIES });
    rerender(
      <MemoryRouter initialEntries={['/hy/search?category=hotels']}>
        <Routes>
          <Route
            path="/:locale/search"
            element={
              <>
                <SearchPageContent />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(lastQueryCall()[0]).toMatchObject({ categoryId: 1 });
    expect(lastQueryCall()[1]).toMatchObject({
      enabled: true,
      keepPreviousResults: true,
    });
  });

  test('applied filters show as chips, and removing one updates the URL and the search', async () => {
    const user = userEvent.setup();
    renderPage('/hy/search?categoryId=1&cityId=1&priceMax=20000');
    expect(
      screen.getByRole('group', { name: T.filters.activeFilters }),
    ).toHaveTextContent('Yerevan');

    await user.click(
      screen.getByRole('button', {
        name: T.filters.removeFilter.replace('{{label}}', 'Yerevan'),
      }),
    );
    expect(screen.getByTestId('url')).toHaveTextContent(
      '?categoryId=1&priceMax=20000',
    );
    expect(lastQueryCall()[0]).toMatchObject({
      categoryId: 1,
      cityId: undefined,
      priceMax: 20000,
    });
  });

  test('a dated search with no results explains it and offers to clear filters', async () => {
    const user = userEvent.setup();
    renderPage('/hy/search?dateFrom=2026-11-01&dateTo=2026-11-03&sort=oldest');
    expect(screen.getByText(T.results.empty.withDates)).toBeInTheDocument();

    const [, emptyStateClear] = screen.getAllByRole('button', {
      name: T.filters.clearAll,
    });
    await user.click(emptyStateClear);
    expect(screen.getByTestId('url')).toHaveTextContent('?sort=oldest');
  });

  test('sorting applies at once and keeps the filters', async () => {
    const user = userEvent.setup();
    renderPage('/hy/search?categoryId=1');
    await user.click(
      screen.getByRole('combobox', { name: T.filters.sortLabel }),
    );
    await user.click(
      screen.getByRole('option', { name: T.filters.sort.price_desc }),
    );
    expect(screen.getByTestId('url')).toHaveTextContent(
      '?categoryId=1&sort=price_desc',
    );
  });

  test('"Load more" fetches the next cursor page', async () => {
    const page = resultsPage([
      { id: 1, listing_type: 'HOTEL', title: 'First' },
    ]);
    useSearchListingsQuery.mockReturnValue({ ...page, hasNextPage: true });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: T.results.loadMore }));
    expect(page.fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

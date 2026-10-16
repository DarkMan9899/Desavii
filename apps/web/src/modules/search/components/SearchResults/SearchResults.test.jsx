import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SearchResults from './SearchResults.jsx';

vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => null,
  }),
);

const RESULTS = [
  { id: 1, listing_type: 'HOTEL', title: 'Hotel One' },
  { id: 2, listing_type: 'TOUR', title: 'Tour Two' },
];

function renderResults(props) {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route
          path="/:locale"
          element={
            <SearchResults
              results={[]}
              isPending={false}
              isError={false}
              onRetry={vi.fn()}
              hasNextPage={false}
              isFetchingNextPage={false}
              onLoadMore={vi.fn()}
              // eslint-disable-next-line react/jsx-props-no-spreading
              {...props}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SearchResults (apps/web/src/modules/search)', () => {
  test('renders skeleton placeholders while pending, not results or empty/error state', () => {
    renderResults({ isPending: true });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('renders an error state with a working retry action', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderResults({ isError: true, onRetry });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // The test harness's i18n instance defaults to Armenian (tests/setup.js)
  // — asserts against the real translation content, not English.
  test('renders an empty state when there are no results', () => {
    renderResults({ results: [] });
    expect(
      screen.getByRole('heading', { name: 'Արդյունքներ չեն գտնվել' }),
    ).toBeInTheDocument();
  });

  test('renders one card per result, each linking to its listing detail route', () => {
    renderResults({ results: RESULTS });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/en/listings/1');
  });

  // Search & Discovery rebuild: the count lives in SearchToolbar (the whole
  // filtered total). While a changed search loads, the previous cards stay
  // on screen and are marked busy instead of collapsing to skeletons.
  test('keeps the previous cards on screen, marked busy, while a changed search loads', () => {
    const { container } = renderResults({ results: RESULTS, isUpdating: true });
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  test('the empty state shows the caller description and its one way out', async () => {
    const onEmptyAction = vi.fn();
    const user = userEvent.setup();
    renderResults({
      results: [],
      emptyDescription: 'Nothing on these dates.',
      emptyActionLabel: 'Clear filters',
      onEmptyAction,
    });
    expect(screen.getByText('Nothing on these dates.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });

  test('renders a "load more" control only when hasNextPage is true', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/en']}>
        <Routes>
          <Route
            path="/:locale"
            element={
              <SearchResults
                results={RESULTS}
                isPending={false}
                isError={false}
                onRetry={vi.fn()}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/en']}>
        <Routes>
          <Route
            path="/:locale"
            element={
              <SearchResults
                results={RESULTS}
                isPending={false}
                isError={false}
                onRetry={vi.fn()}
                hasNextPage
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('calls onLoadMore when the load-more button is clicked', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    renderResults({ results: RESULTS, hasNextPage: true, onLoadMore });
    await user.click(screen.getByRole('button'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});

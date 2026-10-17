import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchListingsQuery } from './useSearchListingsQuery.js';
import { searchListings } from '../../../api/search.js';

vi.mock('../../../api/search.js', () => ({
  searchListings: vi.fn(),
}));

function queryStatus(isPending, isError) {
  if (isPending) return 'pending';
  if (isError) return 'error';
  return 'success';
}

// A minimal harness rather than `renderHook` — exercises the hook the
// same way its real consumer (SearchPageContent) does.
function Harness({ filters }) {
  const { data, isPending, isError, hasNextPage, fetchNextPage } =
    useSearchListingsQuery(filters, { locale: 'en' });
  const results = data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <div>
      <p data-testid="status">{queryStatus(isPending, isError)}</p>
      <p data-testid="count">{results.length}</p>
      <p data-testid="hasNextPage">{String(Boolean(hasNextPage))}</p>
      <button type="button" onClick={() => fetchNextPage()}>
        load more
      </button>
    </div>
  );
}

Harness.propTypes = {
  filters: PropTypes.shape({
    destination: PropTypes.string,
    categoryId: PropTypes.number,
    sort: PropTypes.string,
  }).isRequired,
};

function renderHarness(filters = { destination: '', sort: 'newest' }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness filters={filters} />
    </QueryClientProvider>,
  );
}

describe('useSearchListingsQuery (apps/web/src/modules/search)', () => {
  beforeEach(() => {
    searchListings.mockReset();
  });

  test('resolves the first page of real results', async () => {
    searchListings.mockResolvedValue({
      data: [{ id: 1, title: 'Yerevan Grand Hotel' }],
      meta: { next_cursor: null, has_more: false, limit: 12 },
    });
    renderHarness();

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('hasNextPage')).toHaveTextContent('false');
    // The second argument carries React Query's AbortSignal, so a
    // superseded search is cancelled rather than landing late.
    expect(searchListings).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'newest', locale: 'en', limit: 12 }),
      { signal: expect.any(AbortSignal) },
    );
  });

  test('surfaces a query error rather than throwing', async () => {
    searchListings.mockRejectedValue(new Error('network down'));
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    );
  });

  test('fetchNextPage appends the next cursor page onto the accumulated results', async () => {
    const user = userEvent.setup();
    searchListings
      .mockResolvedValueOnce({
        data: [{ id: 1, title: 'First' }],
        meta: { next_cursor: 'cursor-1', has_more: true, limit: 12 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 2, title: 'Second' }],
        meta: { next_cursor: null, has_more: false, limit: 12 },
      });
    renderHarness();

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('1'),
    );
    expect(screen.getByTestId('hasNextPage')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'load more' }));

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );
    expect(screen.getByTestId('hasNextPage')).toHaveTextContent('false');
    expect(searchListings).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-1' }),
      { signal: expect.any(AbortSignal) },
    );
  });

  test('2026 SEO/performance audit: enabled:false skips the fetch entirely — no wasted unfiltered request while a caller is still waiting on a real filter value', async () => {
    function DisabledHarness() {
      const { isPending } = useSearchListingsQuery(
        { categoryId: undefined },
        { locale: 'en', enabled: false },
      );
      return <p data-testid="status">{queryStatus(isPending, false)}</p>;
    }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <DisabledHarness />
      </QueryClientProvider>,
    );

    // Give any (incorrect) eager fetch a chance to fire before asserting
    // it never did — a real regression here would show up as a call.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(searchListings).not.toHaveBeenCalled();
  });

  test('translates destination/categoryId filter state into the real backend param names', async () => {
    searchListings.mockResolvedValue({
      data: [],
      meta: { next_cursor: null, has_more: false, limit: 12 },
    });
    renderHarness({ destination: 'yerevan', categoryId: 3, sort: 'newest' });

    await waitFor(() => expect(searchListings).toHaveBeenCalled());
    expect(searchListings).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: 'yerevan', categoryId: 3 }),
      { signal: expect.any(AbortSignal) },
    );
  });
});

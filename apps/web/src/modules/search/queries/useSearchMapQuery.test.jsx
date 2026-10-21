import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearchMapQuery } from './useSearchMapQuery.js';
import { searchMap } from '../../../api/search.js';

vi.mock('../../../api/search.js', () => ({
  searchMap: vi.fn(),
}));

// A minimal harness rather than `renderHook` — exercises the hook the
// same way its real consumer (SearchMapPanel) does.
function Harness({ filters, enabled }) {
  const { data, isPlaceholderData } = useSearchMapQuery(filters, {
    locale: 'hy',
    enabled,
  });
  return (
    <div>
      <p data-testid="count">{data ? data.data.length : 'none'}</p>
      <p data-testid="placeholder">{String(isPlaceholderData)}</p>
    </div>
  );
}
Harness.propTypes = {
  filters: PropTypes.shape({ bbox: PropTypes.string }).isRequired,
  enabled: PropTypes.bool.isRequired,
};

function ui(filters, enabled = true, client = undefined) {
  return (
    <QueryClientProvider client={client}>
      <Harness filters={filters} enabled={enabled} />
    </QueryClientProvider>
  );
}

const FILTERS = {
  destination: '',
  sort: 'newest',
  categoryId: 1,
  dynamicFilters: {},
  bbox: '44.40000,40.10000,44.60000,40.25000',
  view: 'map',
};

describe('useSearchMapQuery (apps/web/src/modules/search)', () => {
  let client;
  beforeEach(() => {
    searchMap.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  test('requests the same search as the List, with the map area and never the view', async () => {
    searchMap.mockResolvedValue({ data: [{ id: 1 }], meta: {} });
    render(ui(FILTERS, true, client));
    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('1'),
    );
    const [params, options] = searchMap.mock.calls[0];
    expect(params).toMatchObject({
      categoryId: 1,
      bbox: FILTERS.bbox,
      locale: 'hy',
    });
    expect(params).not.toHaveProperty('view');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('sends nothing while disabled (the List is shown)', () => {
    render(ui(FILTERS, false, client));
    expect(searchMap).not.toHaveBeenCalled();
  });

  test('a changed search keeps the previous answer only as placeholder data', async () => {
    searchMap.mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], meta: {} });
    const { rerender } = render(ui(FILTERS, true, client));
    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('2'),
    );

    let resolveNext;
    searchMap.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      }),
    );
    rerender(ui({ ...FILTERS, categoryId: 2 }, true, client));
    expect(screen.getByTestId('placeholder')).toHaveTextContent('true');

    resolveNext({ data: [{ id: 3 }], meta: {} });
    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('1'),
    );
    expect(screen.getByTestId('placeholder')).toHaveTextContent('false');
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePartnerListingsQuery } from './usePartnerListingsQuery.js';
import { getPartnerListings } from '../../../api/partners.js';

vi.mock('../../../api/partners.js', () => ({
  getPartnerListings: vi.fn(),
}));

function queryStatus(isPending, isError) {
  if (isPending) return 'pending';
  if (isError) return 'error';
  return 'success';
}

function Harness({ slug, locale = undefined }) {
  const { data, isPending, isError } = usePartnerListingsQuery(slug, locale);
  const results = data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <div>
      <p data-testid="status">{queryStatus(isPending, isError)}</p>
      <p data-testid="count">{results.length}</p>
    </div>
  );
}

Harness.propTypes = {
  slug: PropTypes.string.isRequired,
  locale: PropTypes.string,
};

function renderHarness(slug = 'yerevan-boutique-hospitality', locale = 'en') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness slug={slug} locale={locale} />
    </QueryClientProvider>,
  );
}

describe('usePartnerListingsQuery (Step A4: locale-aware company listings)', () => {
  beforeEach(() => {
    getPartnerListings.mockReset();
  });

  test('forwards the given locale to GET /partners/:slug/listings', async () => {
    getPartnerListings.mockResolvedValue({
      data: [{ id: 1, title: 'Hy Title' }],
      meta: { next_cursor: null, has_more: false, limit: 12 },
    });
    renderHarness('yerevan-boutique-hospitality', 'hy');

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('success'),
    );
    expect(getPartnerListings).toHaveBeenCalledWith(
      'yerevan-boutique-hospitality',
      expect.objectContaining({ locale: 'hy' }),
    );
  });

  test('resolves the first page of real results', async () => {
    getPartnerListings.mockResolvedValue({
      data: [{ id: 1, title: 'Ararat Valley Fleet' }],
      meta: { next_cursor: null, has_more: false, limit: 12 },
    });
    renderHarness();

    await waitFor(() =>
      expect(screen.getByTestId('count')).toHaveTextContent('1'),
    );
  });
});

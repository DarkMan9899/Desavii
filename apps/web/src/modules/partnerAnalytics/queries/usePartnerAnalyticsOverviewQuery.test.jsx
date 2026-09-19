import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePartnerAnalyticsOverviewQuery } from './usePartnerAnalyticsOverviewQuery.js';
import { getPartnerAnalyticsOverview } from '../api/partnerAnalytics.js';

vi.mock('../api/partnerAnalytics.js', () => ({
  getPartnerAnalyticsOverview: vi.fn(),
}));

function Harness({ partnerId = null, rangeDays }) {
  const { data, isPending } = usePartnerAnalyticsOverviewQuery({
    partnerId,
    rangeDays,
  });
  return (
    <p data-testid="views">
      {isPending ? 'pending' : (data?.listing_views ?? 'none')}
    </p>
  );
}
Harness.propTypes = {
  partnerId: PropTypes.number,
  rangeDays: PropTypes.number.isRequired,
};

function renderHarness(partnerId, rangeDays) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <Harness partnerId={partnerId} rangeDays={rangeDays} />
      </QueryClientProvider>,
    ),
  };
}

describe('usePartnerAnalyticsOverviewQuery (apps/web/src/modules/partnerAnalytics) — brief §39/§60', () => {
  beforeEach(() => {
    getPartnerAnalyticsOverview.mockReset();
  });

  test('does not call the API while partnerId is null (brief §5/§37: never fired for an unauthorized/no-workspace state)', () => {
    renderHarness(null, 30);
    expect(getPartnerAnalyticsOverview).not.toHaveBeenCalled();
  });

  test('resolves the overview payload from the response envelope, scoped to the given partnerId + range', async () => {
    getPartnerAnalyticsOverview.mockResolvedValue({
      data: { listing_views: 123 },
    });
    renderHarness(7, 30);

    await waitFor(() =>
      expect(screen.getByTestId('views')).toHaveTextContent('123'),
    );
    expect(getPartnerAnalyticsOverview).toHaveBeenCalledWith({
      partnerId: 7,
      range: 30,
    });
  });

  test('switching to a different partnerId never resolves to the previous partner cached value (brief §38/§39 — no cache bleed)', async () => {
    getPartnerAnalyticsOverview.mockImplementation(({ partnerId }) =>
      Promise.resolve({
        data: { listing_views: partnerId === 1 ? 10 : 99 },
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Harness partnerId={1} rangeDays={30} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('views')).toHaveTextContent('10'),
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <Harness partnerId={2} rangeDays={30} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('views')).toHaveTextContent('99'),
    );
  });
});

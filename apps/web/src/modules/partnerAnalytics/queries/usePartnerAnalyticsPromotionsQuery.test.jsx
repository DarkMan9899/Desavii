import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePartnerAnalyticsPromotionsQuery } from './usePartnerAnalyticsPromotionsQuery.js';
import { listPartnerAnalyticsPromotions } from '../api/partnerAnalytics.js';

vi.mock('../api/partnerAnalytics.js', () => ({
  listPartnerAnalyticsPromotions: vi.fn(),
}));

function Harness({ partnerId = null, rangeDays }) {
  const { data, isPending } = usePartnerAnalyticsPromotionsQuery({
    partnerId,
    rangeDays,
  });
  const rows = data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <p data-testid="rows">
      {isPending ? 'pending' : rows.map((row) => row.promotion_id).join(',')}
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
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness partnerId={partnerId} rangeDays={rangeDays} />
    </QueryClientProvider>,
  );
}

describe('usePartnerAnalyticsPromotionsQuery (apps/web/src/modules/partnerAnalytics) — Step A6.1', () => {
  beforeEach(() => {
    listPartnerAnalyticsPromotions.mockReset();
  });

  test('does not call the API while partnerId is null', () => {
    renderHarness(null, 30);
    expect(listPartnerAnalyticsPromotions).not.toHaveBeenCalled();
  });

  test('requests the exact partnerId/range/limit, resolving the envelope’s data/meta', async () => {
    listPartnerAnalyticsPromotions.mockResolvedValue({
      data: [{ promotion_id: 1 }, { promotion_id: 2 }],
      meta: { has_more: false, next_cursor: null },
    });
    renderHarness(7, 30);

    await waitFor(() =>
      expect(screen.getByTestId('rows')).toHaveTextContent('1,2'),
    );
    expect(listPartnerAnalyticsPromotions).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: 7, range: 30, cursor: undefined }),
    );
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerAnalyticsPageContent from './PartnerAnalyticsPageContent.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import { usePartnerCapability } from '../../../availability/index.js';
import {
  usePartnerAnalyticsOverviewQuery,
  usePartnerAnalyticsListingsQuery,
  usePartnerAnalyticsPromotionsQuery,
  useAnalyticsRangeParam,
} from '../../../partnerAnalytics/index.js';

vi.mock('../../../../contexts/PartnerContext.jsx', () => ({
  usePartnerContext: vi.fn(),
}));

vi.mock('../../../availability/index.js', async () => {
  const actual = await vi.importActual('../../../availability/index.js');
  return { ...actual, usePartnerCapability: vi.fn() };
});

vi.mock('../../../partnerAnalytics/index.js', async () => {
  const actual = await vi.importActual('../../../partnerAnalytics/index.js');
  return {
    ...actual,
    usePartnerAnalyticsOverviewQuery: vi.fn(),
    usePartnerAnalyticsListingsQuery: vi.fn(),
    usePartnerAnalyticsPromotionsQuery: vi.fn(),
    useAnalyticsRangeParam: vi.fn(),
  };
});

const OVERVIEW_FIXTURE = {
  partner_id: 7,
  range_days: 30,
  from_day: '2026-08-01',
  to_day: '2026-08-30',
  timezone: 'Asia/Yerevan',
  listing_impressions: 500,
  listing_views: 200,
  // Deliberately different from any sum of `daily[].daily_unique_visitors`
  // below (2 + 3 = 5) — brief §14: the headline must read this exact
  // field, never a client-side sum of the daily series.
  exact_unique_visitors: 42,
  net_saves: 8,
  favorite_adds: 10,
  favorite_removes: 2,
  contact_clicks: 6,
  booking_starts: 20,
  booking_requests: 15,
  confirmed_bookings: 5,
  view_to_request_conversion: 0.075,
  search_impressions: 300,
  search_clicks: 60,
  search_ctr: 0.2,
  promotion_impressions: 100,
  promotion_clicks: 10,
  promotion_ctr: 0.1,
  company_profile_views: 40,
  company_listing_clicks: 12,
  daily: [
    { day: '2026-08-29', impressions: 10, views: 5, daily_unique_visitors: 2 },
    { day: '2026-08-30', impressions: 12, views: 6, daily_unique_visitors: 3 },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/partner/analytics']}>
        <Routes>
          <Route
            path="/:locale/partner/analytics"
            element={<PartnerAnalyticsPageContent />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PartnerAnalyticsPageContent (apps/web/src/modules/partner) — brief §5/§14/§15/§22', () => {
  beforeEach(() => {
    usePartnerContext.mockReturnValue({ activePartnerId: 7 });
    useAnalyticsRangeParam.mockReturnValue([30, vi.fn()]);
    usePartnerAnalyticsListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    usePartnerAnalyticsPromotionsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  test('a role without VIEW_ANALYTICS sees a restricted state and never fires the overview/listings/promotions queries', () => {
    usePartnerCapability.mockReturnValue(false);
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
    });
    renderPage();

    expect(
      screen.getByText('Դուք չունեք մուտք Վերլուծություն բաժին'),
    ).toBeInTheDocument();
    expect(usePartnerAnalyticsOverviewQuery).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: null }),
    );
    expect(usePartnerAnalyticsListingsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: null }),
    );
    expect(usePartnerAnalyticsPromotionsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ partnerId: null }),
    );
  });

  test('renders the exact_unique_visitors field verbatim as the headline, never a sum of the daily series', () => {
    usePartnerCapability.mockReturnValue(true);
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: OVERVIEW_FIXTURE,
      refetch: vi.fn(),
    });
    renderPage();

    // The daily points sum to 2 + 3 = 5 — the StatCard's accessible name
    // must read the overview's own `exact_unique_visitors` field (42),
    // never that client-side sum.
    expect(screen.getByLabelText('Եզակի այցելուներ: 42')).toBeInTheDocument();
  });

  test('labels current saves as a live snapshot, not a range total', () => {
    usePartnerCapability.mockReturnValue(true);
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: OVERVIEW_FIXTURE,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.getByText(
        'Ընթացիկ պահպանումները ընթացիկ ընդհանուր թիվ են՝ դրանք կապված չեն ընտրված ժամանակահատվածի հետ։',
      ),
    ).toBeInTheDocument();
  });

  test('formats ratio fields as a percentage with at most 2 decimals, never a raw 0..1 fraction', () => {
    usePartnerCapability.mockReturnValue(true);
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: OVERVIEW_FIXTURE,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText('20%')).toBeInTheDocument(); // search_ctr
    expect(screen.getByText('10%')).toBeInTheDocument(); // promotion_ctr
    // Armenian ('hy') Intl formatting uses a comma decimal separator.
    expect(screen.getByText('7,5%')).toBeInTheDocument(); // view_to_request_conversion
    expect(screen.queryByText('0.2')).not.toBeInTheDocument();
  });

  test('never renders a fabricated previous-period delta (brief §22: A5 has no comparison data)', () => {
    usePartnerCapability.mockReturnValue(true);
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: OVERVIEW_FIXTURE,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.queryByText(/vs previous/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^[+-]\d+%$/)).not.toBeInTheDocument();
  });

  test('an overview load failure renders a retryable error state, never a raw stack trace', () => {
    usePartnerCapability.mockReturnValue(true);
    const refetch = vi.fn();
    usePartnerAnalyticsOverviewQuery.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      refetch,
    });
    renderPage();

    expect(
      screen.getByText('Չհաջողվեց բեռնել ձեր վերլուծությունը։'),
    ).toBeInTheDocument();
  });
});

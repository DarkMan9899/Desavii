import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PartnerAnalyticsPromotionsTable from './PartnerAnalyticsPromotionsTable.jsx';

const ROW = {
  promotion_id: 42,
  listing_id: 5,
  title: 'Villa Yerevan',
  placement: 'HOMEPAGE_SECTION',
  status: 'ACTIVE',
  start_date: '2026-08-01',
  end_date: '2026-08-30',
  impressions: 200,
  clicks: 30,
  ctr: 0.15,
};

function renderTable({
  rows,
  isPending,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}) {
  return render(
    <MemoryRouter initialEntries={['/hy/partner/analytics']}>
      <Routes>
        <Route
          path="/:locale/partner/analytics"
          element={
            <PartnerAnalyticsPromotionsTable
              rows={rows}
              isPending={isPending}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={onLoadMore}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PartnerAnalyticsPromotionsTable (apps/web/src/modules/partner) — Step A6.1, brief §13', () => {
  test('renders server-provided rows with status badge, placement, and ctr formatted as a percentage', () => {
    renderTable({
      rows: [ROW],
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.getByText('Villa Yerevan')).toBeInTheDocument();
    expect(screen.getByText('Ակտիվ')).toBeInTheDocument();
    expect(screen.getByText('Գլխավոր էջ')).toBeInTheDocument();
    expect(screen.getByText('15%')).toBeInTheDocument();
  });

  test('a promotion with a null title (soft-deleted listing) shows the neutral fallback label, never dropped', () => {
    renderTable({
      rows: [{ ...ROW, title: null }],
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(
      screen.getByText('Հայտարարությունն անհասանելի է'),
    ).toBeInTheDocument();
  });

  test('"Load more" calls onLoadMore when more cursor pages exist', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    renderTable({
      rows: [ROW],
      isPending: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      onLoadMore,
    });
    await user.click(screen.getByRole('button', { name: 'Բեռնել ավելին' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  test('renders an empty state with no rows and no crash', () => {
    renderTable({
      rows: [],
      isPending: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.getByText('Դեռ առաջխաղացումներ չկան')).toBeInTheDocument();
  });

  test('row click navigates to the promotion detail route', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/hy/partner/analytics']}>
        <Routes>
          <Route
            path="/:locale/partner/analytics"
            element={
              <PartnerAnalyticsPromotionsTable
                rows={[ROW]}
                isPending={false}
                hasNextPage={false}
                isFetchingNextPage={false}
                onLoadMore={vi.fn()}
              />
            }
          />
          <Route
            path="/:locale/partner/analytics/promotions/:promotionId"
            element={<p>promotion detail page</p>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByText('Villa Yerevan'));
    expect(screen.getByText('promotion detail page')).toBeInTheDocument();
  });
});

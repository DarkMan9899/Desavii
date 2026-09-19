import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PartnerAnalyticsListingsTable from './PartnerAnalyticsListingsTable.jsx';

const ROW = {
  listing_id: 42,
  title: 'Villa Yerevan',
  listing_type: 'HOTEL',
  impressions: 500,
  views: 200,
  exact_unique_visitors: 42,
  net_saves: 8,
  booking_requests: 15,
  search_ctr: 0.2,
  promotion_clicks: 10,
};

function renderTable({
  rows,
  isPending,
  sort,
  onSortChange,
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
            <PartnerAnalyticsListingsTable
              rows={rows}
              isPending={isPending}
              sort={sort}
              onSortChange={onSortChange}
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

describe('PartnerAnalyticsListingsTable (apps/web/src/modules/partner) — brief §23/§26/§27/§61', () => {
  test('renders server-provided rows with no client-side re-sort/re-page', () => {
    renderTable({
      rows: [ROW],
      isPending: false,
      sort: 'views',
      onSortChange: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.getByText('Villa Yerevan')).toBeInTheDocument();
  });

  test('changing sort calls onSortChange with the selected backend-supported value', async () => {
    const onSortChange = vi.fn();
    const user = userEvent.setup();
    renderTable({
      rows: [ROW],
      isPending: false,
      sort: 'views',
      onSortChange,
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });

    const [trigger] = screen.getAllByRole('button');
    await user.click(trigger);
    await user.click(
      screen.getByRole('option', { name: 'Առաջխաղացման սեղմումներ' }),
    );

    expect(onSortChange).toHaveBeenCalledWith('promotion_clicks');
  });

  test('"Load more" calls onLoadMore when more cursor pages exist', async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    renderTable({
      rows: [ROW],
      isPending: false,
      sort: 'views',
      onSortChange: vi.fn(),
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
      sort: 'views',
      onSortChange: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.getByText('Դեռ ակտիվություն չկա')).toBeInTheDocument();
  });

  test('never renders a contact-clicks column (brief §28: contact clicks are company-scoped, not per listing)', () => {
    renderTable({
      rows: [ROW],
      isPending: false,
      sort: 'views',
      onSortChange: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      onLoadMore: vi.fn(),
    });
    expect(screen.queryByText(/contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/կոնտակտ/i)).not.toBeInTheDocument();
  });
});

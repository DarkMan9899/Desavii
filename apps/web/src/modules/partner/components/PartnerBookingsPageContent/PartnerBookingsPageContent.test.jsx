import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerBookingsPageContent from './PartnerBookingsPageContent.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import { usePartnerBookingsQuery } from '../../../bookings/index.js';
import { getListing } from '../../../../api/listings.js';

vi.mock('../../../../contexts/PartnerContext.jsx', () => ({
  usePartnerContext: vi.fn(),
}));

vi.mock('../../../bookings/index.js', async () => {
  const actual = await vi.importActual('../../../bookings/index.js');
  return { ...actual, usePartnerBookingsQuery: vi.fn() };
});

vi.mock('../../../../api/listings.js', () => ({
  getListing: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/partner/bookings']}>
        <Routes>
          <Route
            path="/:locale/partner/bookings"
            element={<PartnerBookingsPageContent />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PartnerBookingsPageContent (apps/web/src/modules/partner)', () => {
  beforeEach(() => {
    getListing.mockResolvedValue({
      data: { id: 1, slug: 'villa', translations: [], media: [] },
    });
    usePartnerContext.mockReturnValue({ activePartnerId: 3 });
    usePartnerBookingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  test('renders the heading and requests the active partner id with no status filter by default', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Ամրագրումներ' }),
    ).toBeInTheDocument();
    expect(usePartnerBookingsQuery).toHaveBeenCalledWith({
      partnerId: 3,
      status: '',
    });
  });

  test('selecting a status option requests the query with that status', async () => {
    const user = userEvent.setup();
    renderPage();

    const [trigger] = screen.getAllByRole('combobox');
    await user.click(trigger);
    await user.click(screen.getByText('Հաստատված'));

    expect(usePartnerBookingsQuery).toHaveBeenLastCalledWith({
      partnerId: 3,
      status: 'CONFIRMED',
    });
  });
});

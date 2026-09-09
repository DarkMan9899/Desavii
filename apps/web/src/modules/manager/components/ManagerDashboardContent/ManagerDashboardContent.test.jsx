import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ManagerDashboardContent from './ManagerDashboardContent.jsx';
import { useMyManagerDashboardQuery } from '../../../managers/index.js';

vi.mock('../../../managers/index.js', () => ({
  useMyManagerDashboardQuery: vi.fn(),
}));

const DASHBOARD = {
  counts: {
    companies: 2,
    listings: 5,
    publishedListings: 4,
    bookings: 10,
    completedBookings: 3,
    cancelledBookings: 1,
  },
  booking_value_by_currency: [{ currency_code: 'AMD', total: 50000 }],
  bookings_by_day: [{ day: '2026-09-01', total: 2 }],
  by_company: [
    {
      partner_id: 1,
      display_name: 'Yerevan Boutique Hospitality',
      booking_count: 6,
    },
    { partner_id: 2, display_name: 'Ararat Grand Hotels', booking_count: 4 },
  ],
  listings_created_count: 3,
};

describe('ManagerDashboardContent (Sprint F — Manager Workspace)', () => {
  test('renders KPI stats and the per-company breakdown from real dashboard data', () => {
    useMyManagerDashboardQuery.mockReturnValue({
      data: DASHBOARD,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ManagerDashboardContent />);

    expect(
      screen.getByText('Yerevan Boutique Hospitality'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ararat Grand Hotels')).toBeInTheDocument();
    expect(screen.getByText('AMD')).toBeInTheDocument();
  });

  test('renders an empty state instead of KPI cards when zero companies are assigned', () => {
    useMyManagerDashboardQuery.mockReturnValue({
      data: {
        counts: {
          companies: 0,
          listings: 0,
          publishedListings: 0,
          bookings: 0,
          completedBookings: 0,
          cancelledBookings: 0,
        },
        booking_value_by_currency: [],
        bookings_by_day: [],
        by_company: [],
        listings_created_count: 0,
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ManagerDashboardContent />);

    expect(
      screen.getByText('Դեռ ընկերություններ հանձնարարված չեն'),
    ).toBeInTheDocument();
  });

  test('renders a retryable error state when the dashboard query fails', () => {
    const refetch = vi.fn();
    useMyManagerDashboardQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    render(<ManagerDashboardContent />);

    expect(screen.getByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
  });
});

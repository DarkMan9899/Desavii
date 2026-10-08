/**
 * Step L6.3B — booking a hotel room by the hour from the reservation widget.
 * A nightly-only room never shows a mode choice; an hourly-enabled room
 * defaults to "Stay overnight" and, in "Book by hour", sends exactly one
 * hourly stay (date, whole-hour start/end, rooms) — never the overnight
 * picker's dates.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import ToastProvider from '../../../../../providers/ToastProvider.jsx';
import CurrencyProvider from '../../../../../providers/CurrencyProvider.jsx';
import ListingReservationWidget from './ListingReservationWidget.jsx';
import { useAuth } from '../../../../../contexts/AuthContext.jsx';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';
import { useListingCalendarQuery } from '../../../queries/useListingCalendarQuery.js';
import { useListingDayStatusQuery } from '../../../queries/useListingDayStatusQuery.js';
import { useListingHourlyAvailabilityQuery } from '../../../queries/useListingHourlyAvailabilityQuery.js';
import { useCreateBookingHoldMutation } from '../../../../bookings/mutations/useCreateBookingHoldMutation.js';

vi.mock('../../../../../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));
vi.mock('../../../queries/useListingBookableUnitsQuery.js', () => ({
  useListingBookableUnitsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../queries/useListingCalendarQuery.js', () => ({
  useListingCalendarQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../queries/useListingDayStatusQuery.js', () => ({
  useListingDayStatusQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../queries/useListingHourlyAvailabilityQuery.js', () => ({
  useListingHourlyAvailabilityQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock(
  '../../../../bookings/mutations/useCreateBookingHoldMutation.js',
  () => ({
    useCreateBookingHoldMutation: vi.fn(),
    default: vi.fn(),
  }),
);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// The calendar grid is covered by DatePicker's own tests — this drives
// only the onChange contract (single date / range).
vi.mock('@desavii/ui/components/form-controls', async () => {
  const actual = await vi.importActual('@desavii/ui/components/form-controls');
  function MockDatePicker({ mode = 'range', onChange }) {
    return (
      <button
        type="button"
        onClick={() =>
          mode === 'single'
            ? onChange('2027-08-01')
            : onChange({ start: '2027-08-01', end: '2027-08-02' })
        }
      >
        {mode === 'single' ? 'pick day' : 'pick nights'}
      </button>
    );
  }
  MockDatePicker.propTypes = {
    mode: PropTypes.string,
    onChange: PropTypes.func.isRequired,
  };
  return { ...actual, DatePicker: MockDatePicker };
});

const NIGHTLY_ROOM = {
  id: 1,
  bookable_unit_type: 'HOTEL_ROOM',
  capacity: 3,
  unit_label: 'Standard Room',
  max_guests: 2,
  base_price_amount: '30000.00',
  base_price_currency: 'AMD',
  hourly_enabled: false,
};
const HOURLY_ROOM = {
  id: 2,
  bookable_unit_type: 'HOTEL_ROOM',
  capacity: 3,
  unit_label: 'Day Room',
  max_guests: 2,
  base_price_amount: '42000.00',
  base_price_currency: 'AMD',
  hourly_enabled: true,
  hourly_price_amount: '8000.00',
  hourly_price_currency: 'AMD',
  hourly_min_duration_hours: 2,
  hourly_max_duration_hours: 6,
  hourly_available_from: '10:00',
  hourly_available_until: '20:00',
};
const SLOTS = Array.from({ length: 10 }, (_, index) => {
  const hour = 10 + index;
  const pad = (h) => `${String(h).padStart(2, '0')}:00`;
  return {
    start_time: pad(hour),
    end_time: pad(hour + 1),
    status: hour === 11 ? 'SOLD_OUT' : 'AVAILABLE',
    remaining_count: null,
  };
});

const OVERNIGHT = 'Գիշերակաց';
const BY_HOUR = 'Ամրագրել ժամերով';
const START = 'Սկիզբ';
const END = 'Ավարտ';
const CTA = 'Ուղարկել ամրագրման հայտ';

function RouteScopedWidget(props) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <ListingReservationWidget
        listingId={10}
        listingType="HOTEL"
        pricing={{
          amount: '30000.00',
          currency: 'AMD',
          pricing_model: 'PER_NIGHT',
        }}
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
      />
    </CurrencyProvider>
  );
}

function renderWidget(selectedUnitId) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/listings/10']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/listings/:id"
              element={
                <RouteScopedWidget
                  selectedUnitId={selectedUnitId}
                  onSelectUnit={vi.fn()}
                />
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListingReservationWidget — optional hourly hotel stays (Step L6.3B)', () => {
  let mutateAsync;

  beforeEach(() => {
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockReturnValue({
      data: [NIGHTLY_ROOM, HOURLY_ROOM],
      isPending: false,
      isError: false,
    });
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingHourlyAvailabilityQuery.mockReturnValue({
      data: { bookable_unit_id: 2, date: '2027-08-01', slots: SLOTS },
      isPending: false,
      refetch: vi.fn(),
    });
    mutateAsync = vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            bookable_unit_id: 2,
            booking_mode: 'HOURLY',
            date_from: '2027-08-01',
            date_to: '2027-08-01',
            start_time: '14:00',
            end_time: '18:00',
            quantity: 1,
            hold_ids: [7],
            quote: {
              unit_price_amount: '32000.00',
              total_amount: '32000.00',
              currency: 'AMD',
            },
          },
        ],
        expires_at: '2027-08-01T10:15:00.000Z',
      },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  test('a nightly-only room never shows a mode choice', () => {
    renderWidget(1);
    expect(
      screen.queryByRole('radio', { name: BY_HOUR }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'pick nights' }),
    ).toBeInTheDocument();
  });

  test('an hourly-enabled room offers both modes, overnight first and chosen', () => {
    renderWidget(2);
    expect(screen.getByRole('radio', { name: OVERNIGHT })).toBeChecked();
    expect(screen.getByRole('radio', { name: BY_HOUR })).not.toBeChecked();
    expect(
      screen.getByRole('button', { name: 'pick nights' }),
    ).toBeInTheDocument();
  });

  test('booking by the hour sends one hourly stay — date, whole hours, rooms — and no overnight dates', async () => {
    const user = userEvent.setup();
    renderWidget(2);
    await user.click(screen.getByRole('radio', { name: BY_HOUR }));
    expect(
      screen.queryByRole('button', { name: 'pick nights' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick day' }));
    await user.click(screen.getByRole('button', { name: START }));
    await user.click(screen.getByRole('option', { name: '14:00' }));
    await user.click(screen.getByRole('button', { name: END }));
    await user.click(screen.getByRole('option', { name: '18:00' }));
    expect(screen.getByText('Տևողությունը՝ 4 ժամ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: CTA }));
    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 2,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-01',
        startTime: '14:00',
        endTime: '18:00',
        quantity: 1,
        bookingMode: 'HOURLY',
      },
    ]);
    expect(mockNavigate.mock.calls[0][1].state.bookingMode).toBe('HOURLY');
  });

  test('a sold-out hour cannot start a stay, and an end time never spans it', async () => {
    const user = userEvent.setup();
    renderWidget(2);
    await user.click(screen.getByRole('radio', { name: BY_HOUR }));
    await user.click(screen.getByRole('button', { name: 'pick day' }));
    await user.click(screen.getByRole('button', { name: START }));
    expect(screen.getByRole('option', { name: '11:00' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('option', { name: '10:00' }));
    await user.click(screen.getByRole('button', { name: END }));
    expect(screen.getByRole('option', { name: '12:00' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import CurrencyProvider from '../../../../providers/CurrencyProvider.jsx';
import BookingCheckoutPageContent from './BookingCheckoutPageContent.jsx';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useListingQuery } from '../../../listings/queries/useListingQuery.js';
import { useCreateBookingMutation } from '../../mutations/useCreateBookingMutation.js';
import { useReleaseBookingHoldMutation } from '../../mutations/useReleaseBookingHoldMutation.js';

vi.mock('../../../../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000', RUB: '4.50000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));
vi.mock('../../../listings/queries/useListingQuery.js', () => ({
  useListingQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../mutations/useCreateBookingMutation.js', () => ({
  useCreateBookingMutation: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../mutations/useReleaseBookingHoldMutation.js', () => ({
  useReleaseBookingHoldMutation: vi.fn(),
  default: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const HOLD_STATE = {
  listingId: 10,
  holdBatch: {
    items: [
      {
        bookable_unit_id: 1,
        date_from: '2026-08-01',
        date_to: '2026-08-02',
        quantity: 1,
        hold_ids: [55],
      },
    ],
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  },
};

function renderPage(state = HOLD_STATE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{ pathname: '/en/booking/checkout', state }]}
      >
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/booking/checkout"
              element={
                <CurrencyProvider locale="en">
                  <BookingCheckoutPageContent />
                </CurrencyProvider>
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BookingCheckoutPageContent (apps/web/src/modules/bookings)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    useAuth.mockReturnValue({
      user: {
        first_name: 'Ana',
        last_name: 'Smith',
        email: 'ana@example.com',
        phone: '+37411000000',
      },
    });
    useListingQuery.mockReturnValue({
      data: {
        id: 10,
        slug: 'sunset-ridge-villa',
        translations: [{ language_id: 1, title: 'Sunset Ridge Villa' }],
      },
    });
    useCreateBookingMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useReleaseBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('shows an honest empty state when there is no active hold (e.g. a page refresh)', () => {
    renderPage(null);
    expect(
      screen.getByRole('heading', { name: 'Ակտիվ ամրագրում չկա' }),
    ).toBeInTheDocument();
  });

  test('P2.2E: the no-active-hold state offers a way back to My bookings, not just home', async () => {
    renderPage(null);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: 'Դիտել իմ ամրագրումները' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/en/account/bookings');
  });

  test('P2.2E: omits the "View my bookings" action when there is no authenticated user', () => {
    useAuth.mockReturnValue({ user: null });
    renderPage(null);
    expect(
      screen.queryByRole('button', { name: 'Դիտել իմ ամրագրումները' }),
    ).not.toBeInTheDocument();
  });

  test('renders the listing title and prefills the contact form from the authenticated user', () => {
    renderPage();
    expect(screen.getByText('Sunset Ridge Villa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ana Smith')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ana@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+37411000000')).toBeInTheDocument();
  });

  test('P2.2B: shows the selected room/unit label and guest count when the reservation widget passed them through', () => {
    renderPage({
      ...HOLD_STATE,
      unitLabel: 'Deluxe Suite',
      guestCount: 3,
    });
    expect(screen.getByText('Deluxe Suite')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('P2.2B: omits the room type / guests rows entirely when the hand-off never carried them (e.g. a very old client)', () => {
    renderPage();
    expect(screen.queryByText('Սենյակի/միավորի տեսակ')).not.toBeInTheDocument();
    expect(screen.queryByText('Հյուրեր')).not.toBeInTheDocument();
  });

  test('submitting the form creates a booking and navigates to its detail page with a success toast', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 42 } });
    useCreateBookingMutation.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      items: [{ holdIds: [55], guests: [] }],
      guestContactSnapshot: {
        fullName: 'Ana Smith',
        email: 'ana@example.com',
        phone: '+37411000000',
      },
      customerNotes: undefined,
      // 'en' locale's own default display currency (currencyPolicy.js) —
      // no explicit override was set in this test.
      displayCurrencyCode: 'USD',
    });
    expect(mockNavigate).toHaveBeenCalledWith('/en/account/bookings/42');
    expect(
      await screen.findByText(
        'Ձեր ամրագրման հայտն ուղարկվել է հյուրընկալողին։',
      ),
    ).toBeInTheDocument();
  });

  test('P2.2B: forwards the guest count entered on the reservation widget through to POST /bookings', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 42 } });
    useCreateBookingMutation.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderPage({ ...HOLD_STATE, guestCount: 2 });

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ holdIds: [55], guests: [], guestCount: 2 }],
      }),
    );
  });

  test('shows an error toast and does not navigate when booking creation fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('conflict'));
    useCreateBookingMutation.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    );

    expect(
      await screen.findByText(
        'Չհաջողվեց ուղարկել ձեր ամրագրման հայտը։ Խնդրում ենք կրկին փորձել։',
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('cancelling releases the hold and navigates back to the listing', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useReleaseBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Չեղարկել և ազատել այս ամսաթվերը' }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith([55]));
    expect(mockNavigate).toHaveBeenCalledWith('/en/listings/10');
  });

  test('a stale hold rejected server-side (HOLD_EXPIRED) shows a specific conflict message and blocks resubmission', async () => {
    const conflictError = Object.assign(new Error('Hold expired'), {
      code: 'HOLD_EXPIRED',
    });
    const mutateAsync = vi.fn().mockRejectedValue(conflictError);
    useCreateBookingMutation.mockReturnValue({ mutateAsync, isPending: false });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    );

    expect(
      await screen.findByText(
        'Այս ամսաթվերն այլևս հասանելի չեն․ հնարավոր է՝ մեկ ուրիշը հենց նոր ամրագրել է դրանք։ Խնդրում ենք չեղարկել և ընտրել այլ ամսաթվեր։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    ).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('an expired hold shows a warning and disables the confirm button', () => {
    renderPage({
      ...HOLD_STATE,
      holdBatch: {
        ...HOLD_STATE.holdBatch,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(
      screen.getByText(
        'Ձեր պահված ամսաթվերի ժամկետը լրացել է։ Խնդրում ենք կրկին ընտրել ամսաթվերը։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
    ).toBeDisabled();
  });

  describe('Sprint A (Time-Aware Booking Foundation)', () => {
    const TIME_SLOT_HOLD_STATE = {
      listingId: 10,
      holdBatch: {
        items: [
          {
            bookable_unit_id: 2,
            date_from: '2026-09-12',
            date_to: '2026-09-12',
            quantity: 1,
            hold_ids: [77],
          },
        ],
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      unitLabel: '14:00 Departure',
      timeSlotStart: '14:00',
      timeSlotEnd: '16:30',
    };

    test('shows the selected time and a single date (not a meaningless same-day range) for a time-slot booking', () => {
      renderPage(TIME_SLOT_HOLD_STATE);
      expect(screen.getByText('14:00–16:30')).toBeInTheDocument();
      expect(screen.getByText('2026-09-12')).toBeInTheDocument();
      expect(
        screen.queryByText(/2026-09-12 – 2026-09-12/),
      ).not.toBeInTheDocument();
    });

    test('omits the Time row entirely for a date-only booking (Hotel/Property/Car Rental) — no meaningless empty time UI', () => {
      renderPage(HOLD_STATE);
      expect(screen.queryByText('Ժամ')).not.toBeInTheDocument();
    });

    test('still shows a real two-day range when dates genuinely differ, unaffected by the single-date collapse', () => {
      renderPage(HOLD_STATE);
      expect(screen.getByText('2026-08-01 – 2026-08-02')).toBeInTheDocument();
    });

    test('omits the Nights row for a time-slot booking — a same-day departure is never a nightly stay', () => {
      renderPage(TIME_SLOT_HOLD_STATE);
      expect(screen.queryByText('Գիշերներ')).not.toBeInTheDocument();
    });
  });

  describe('Sprint B (Car Rental Pickup/Return Interval)', () => {
    const RENTAL_HOLD_STATE = {
      listingId: 10,
      holdBatch: {
        items: [
          {
            bookable_unit_id: 3,
            date_from: '2027-09-10',
            date_to: '2027-09-12',
            quantity: 1,
            hold_ids: [88],
          },
        ],
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      unitLabel: 'Toyota RAV4',
      pickupTime: '10:00',
      returnTime: '18:00',
      rentalLocationLabel: 'Yerevan, Armenia',
    };

    test('shows distinct Pickup and Return rows combining location, date, and time — not the generic Dates row', () => {
      renderPage(RENTAL_HOLD_STATE);

      expect(screen.getByText('Ստացում')).toBeInTheDocument();
      expect(
        screen.getByText('Yerevan, Armenia · 2027-09-10 · 10:00'),
      ).toBeInTheDocument();
      expect(screen.getByText('Վերադարձ')).toBeInTheDocument();
      expect(
        screen.getByText('Yerevan, Armenia · 2027-09-12 · 18:00'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Ամսաթվեր')).not.toBeInTheDocument();
    });

    test('a non-rental hold state never shows Pickup/Return rows', () => {
      renderPage(HOLD_STATE);
      expect(screen.queryByText('Ստացում')).not.toBeInTheDocument();
      expect(screen.queryByText('Վերադարձ')).not.toBeInTheDocument();
    });
  });
});

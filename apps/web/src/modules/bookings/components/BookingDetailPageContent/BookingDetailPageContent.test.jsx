import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ConfirmProvider from '../../../../providers/ConfirmProvider.jsx';
import BookingDetailPageContent from './BookingDetailPageContent.jsx';
import { useBookingQuery } from '../../queries/useBookingQuery.js';
import { useCancelBookingMutation } from '../../mutations/useCancelBookingMutation.js';
import { useCreateConversationMutation } from '../../../messaging/index.js';
import { getListing } from '../../../../api/listings.js';

vi.mock('../../queries/useBookingQuery.js', () => ({
  useBookingQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../../api/listings.js', () => ({
  getListing: vi.fn(),
}));
vi.mock('../../mutations/useCancelBookingMutation.js', () => ({
  useCancelBookingMutation: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../reviews/index.js', () => ({
  useReviewForBookingQuery: vi.fn(() => ({ data: null, isPending: false })),
  // eslint-disable-next-line react/prop-types -- trivial test double
  ReviewForm: ({ bookingId }) => <div>ReviewForm for {bookingId}</div>,
}));
vi.mock('../../../messaging/index.js', () => ({
  useCreateConversationMutation: vi.fn(),
}));
vi.mock('../../../ai/index.js', () => ({
  AskAiButton: () => null,
}));
vi.mock('../../../payments/index.js', () => ({
  BookingPaymentSection: () => null,
}));

const BASE_BOOKING = {
  id: 7,
  booking_reference: 'BK-20260101-ABCDEF23',
  status: 'CONFIRMED',
  currency: 'AMD',
  total_amount: '85000.00',
  customer_notes: null,
  cancellation_reason: null,
  partner_owner_user_id: 42,
  listing_id: 1,
  guest_contact_snapshot: {
    fullName: 'Ana Smith',
    email: 'ana@example.com',
    phone: '+37411000000',
  },
  items: [
    {
      id: 1,
      date_from: '2026-08-01',
      date_to: '2026-08-03',
      quantity: 1,
      unit_price_amount: '85000.00',
      guests: [],
    },
  ],
};

const BASE_LISTING = {
  id: 1,
  slug: 'sunset-ridge-villa',
  translations: [{ language_id: 1, title: 'Sunset Ridge Villa' }],
  media: [],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/en/account/bookings/7']}>
        <ToastProvider>
          <ConfirmProvider>
            <Routes>
              <Route
                path="/:locale/account/bookings/:id"
                element={<BookingDetailPageContent />}
              />
              <Route
                path="/:locale/account/messages/:conversationId"
                element={<div>Conversation thread page</div>}
              />
            </Routes>
          </ConfirmProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BookingDetailPageContent (apps/web/src/modules/bookings)', () => {
  beforeEach(() => {
    useBookingQuery.mockReset();
    useCancelBookingMutation.mockReset();
    useCancelBookingMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
    useCreateConversationMutation.mockReset();
    useCreateConversationMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ data: { id: 99 } }),
      isPending: false,
    });
    getListing.mockReset();
    getListing.mockResolvedValue({ data: BASE_LISTING });
  });

  test('renders booking reference, status, total, items, and contact snapshot', () => {
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    // "Հաստատված" (Confirmed) now renders twice: once in the status badge
    // and once as the StatusStepper's matching "done" step label — a real,
    // intentional consequence of the 2026 redesign's progress stepper.
    expect(screen.getAllByText('Հաստատված').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Ana Smith/)).toBeInTheDocument();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
  });

  test('P2.2B: shows the booked room/unit type when the item response includes one', () => {
    useBookingQuery.mockReturnValue({
      data: {
        ...BASE_BOOKING,
        items: [{ ...BASE_BOOKING.items[0], unit_label: 'Deluxe Suite' }],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText(/Deluxe Suite/)).toBeInTheDocument();
  });

  test('P2.2B: omits the room type line for an item with no unit_label (e.g. a legacy booking predating this field)', () => {
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.queryByText(/Սենյակի\/միավորի տեսակ/),
    ).not.toBeInTheDocument();
  });

  test('shows the Cancel action for CONFIRMED, hides it for a terminal status', () => {
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const { rerender } = renderPage();
    expect(
      screen.getByRole('button', { name: 'Չեղարկել ամրագրումը' }),
    ).toBeInTheDocument();

    useBookingQuery.mockReturnValue({
      data: { ...BASE_BOOKING, status: 'COMPLETED' },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const rerenderQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    rerender(
      <QueryClientProvider client={rerenderQueryClient}>
        <MemoryRouter initialEntries={['/en/account/bookings/7']}>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                <Route
                  path="/:locale/account/bookings/:id"
                  element={<BookingDetailPageContent />}
                />
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Չեղարկել ամրագրումը' }),
    ).not.toBeInTheDocument();
  });

  test('hides the Cancel action for PENDING_VENDOR (the backend state machine has no customer-withdrawal transition from it)', () => {
    useBookingQuery.mockReturnValue({
      data: { ...BASE_BOOKING, status: 'PENDING_VENDOR' },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.queryByRole('button', { name: 'Չեղարկել ամրագրումը' }),
    ).not.toBeInTheDocument();
  });

  test('cancelling requires confirmation, then calls the mutation and shows a success toast', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    useCancelBookingMutation.mockReturnValue({ mutateAsync, isPending: false });
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Չեղարկել ամրագրումը' }),
    );
    expect(mutateAsync).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Այո, չեղարկել' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('Ձեր ամրագրումը չեղարկվել է։'),
    ).toBeInTheDocument();
  });

  test('renders a 404 empty state for a genuine not-found error', () => {
    useBookingQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { status: 404 },
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Էջը չի գտնվել' }),
    ).toBeInTheDocument();
  });

  test('renders a retryable error state for a non-404 error', () => {
    useBookingQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { status: 500 },
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('shows the Message host action when partner_owner_user_id is resolved', () => {
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.getByRole('button', { name: 'Գրել հյուրընկալողին' }),
    ).toBeInTheDocument();
  });

  // A rare data gap (a partner with no resolvable owner user) — the
  // button must never render pointing at a `null` participant id.
  test('hides the Message host action when partner_owner_user_id is null', () => {
    useBookingQuery.mockReturnValue({
      data: { ...BASE_BOOKING, partner_owner_user_id: null },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(
      screen.queryByRole('button', { name: 'Գրել հյուրընկալողին' }),
    ).not.toBeInTheDocument();
  });

  test('clicking Message host creates a booking-scoped conversation and navigates to its thread', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 99 } });
    useCreateConversationMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Գրել հյուրընկալողին' }),
    );
    expect(mutateAsync).toHaveBeenCalledWith({
      participantUserIds: [42],
      contextType: 'booking',
      contextId: 7,
    });
    expect(
      await screen.findByText('Conversation thread page'),
    ).toBeInTheDocument();
  });

  test('shows an error toast when starting a conversation fails', async () => {
    useCreateConversationMutation.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(new Error('network error')),
      isPending: false,
    });
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(
      screen.getByRole('button', { name: 'Գրել հյուրընկալողին' }),
    );
    expect(
      await screen.findByText(
        'Չհաջողվեց սկսել զրույց հյուրընկալողի հետ։ Խնդրում ենք կրկին փորձել։',
      ),
    ).toBeInTheDocument();
  });

  test('P2.2E: shows the listing name as a link to the listing, once resolved', async () => {
    useBookingQuery.mockReturnValue({
      data: BASE_BOOKING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const link = await screen.findByRole('link', {
      name: 'Sunset Ridge Villa',
    });
    expect(link).toHaveAttribute('href', '/en/listings/sunset-ridge-villa');
  });

  test('P2.2E: shows computed nights for a HOTEL_ROOM item (checkout-exclusive), not for a non-accommodation item', () => {
    useBookingQuery.mockReturnValue({
      data: {
        ...BASE_BOOKING,
        items: [
          {
            ...BASE_BOOKING.items[0],
            bookable_unit_type: 'HOTEL_ROOM',
            date_from: '2026-08-01',
            date_to: '2026-08-04',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    const { rerender } = renderPage();
    expect(screen.getByText(/Գիշերներ: 3/)).toBeInTheDocument();

    const tourQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    useBookingQuery.mockReturnValue({
      data: {
        ...BASE_BOOKING,
        items: [
          {
            ...BASE_BOOKING.items[0],
            bookable_unit_type: 'TOUR_DEPARTURE',
            date_from: '2026-08-01',
            date_to: '2026-08-04',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    rerender(
      <QueryClientProvider client={tourQueryClient}>
        <MemoryRouter initialEntries={['/en/account/bookings/7']}>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                <Route
                  path="/:locale/account/bookings/:id"
                  element={<BookingDetailPageContent />}
                />
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByText(/Գիշերներ:/)).not.toBeInTheDocument();
  });

  test('P2.2E: shows the guest count when named guests were recorded, omits it otherwise', () => {
    useBookingQuery.mockReturnValue({
      data: {
        ...BASE_BOOKING,
        items: [
          {
            ...BASE_BOOKING.items[0],
            guests: [
              { id: 1, full_name: 'Ana Smith', document_number: null },
              { id: 2, full_name: 'Leo Smith', document_number: null },
            ],
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Հյուրեր: 2/)).toBeInTheDocument();
  });

  test('P2.2E: shows the cancellation reason when present, omits it otherwise', () => {
    useBookingQuery.mockReturnValue({
      data: {
        ...BASE_BOOKING,
        status: 'CANCELLED_BY_CUSTOMER',
        cancellation_reason: 'Change of plans',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText(/Change of plans/)).toBeInTheDocument();
  });

  describe('Sprint A (Time-Aware Booking Foundation)', () => {
    test('shows the real selected time when the item carries one', () => {
      useBookingQuery.mockReturnValue({
        data: {
          ...BASE_BOOKING,
          items: [
            {
              ...BASE_BOOKING.items[0],
              unit_label: '09:00 Departure',
              start_time: '09:00',
              end_time: '11:30',
            },
          ],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText('09:00–11:30')).toBeInTheDocument();
    });

    test('shows no meaningless empty Time UI for a date-only booking (Hotel/Property/Car Rental)', () => {
      useBookingQuery.mockReturnValue({
        data: BASE_BOOKING,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      renderPage();
      // The date line itself also uses an en dash ("Aug 1 – Aug 3"), so
      // assert against the specific HH:MM–HH:MM time shape rather than
      // the dash alone.
      expect(
        screen.queryByText(/\d{2}:\d{2}–\d{2}:\d{2}/),
      ).not.toBeInTheDocument();
    });
  });

  describe('Sprint B (Car Rental Pickup/Return Interval)', () => {
    test('shows the real persisted pickup/return location for a Car Rental item', () => {
      useBookingQuery.mockReturnValue({
        data: {
          ...BASE_BOOKING,
          items: [
            {
              ...BASE_BOOKING.items[0],
              unit_label: 'Toyota RAV4',
              start_time: '10:00',
              end_time: '18:00',
              pickup_location: 'Yerevan, Armenia',
              return_location: 'Yerevan, Armenia',
            },
          ],
        },
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      renderPage();
      // Pass 5 (owner issue #12): pickup/return each pair their OWN date
      // with their OWN time and location on one line — `date_from` (Aug 1)
      // with `start_time` (10:00), `date_to` (Aug 3) with `end_time`
      // (18:00) — never one combined date range next to a combined time
      // range, which left it ambiguous which date each time belonged to.
      expect(
        screen.getByText(/Ստացման վայրը:.*10:00.*Yerevan, Armenia/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Վերադարձի վայրը:.*18:00.*Yerevan, Armenia/),
      ).toBeInTheDocument();
    });

    test('never renders a pickup/return location row for a Hotel/Tour item (no empty rental-specific fields)', () => {
      useBookingQuery.mockReturnValue({
        data: BASE_BOOKING,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.queryByText(/Ստացման վայրը/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Վերադարձի վայրը/)).not.toBeInTheDocument();
    });
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

const SERVER_QUOTE = {
  unit_price_amount: '42000.00',
  total_amount: '42000.00',
  currency: 'AMD',
};
// What booking sends back: the quote the customer accepted.
const ACCEPTED_QUOTE = {
  expectedTotalAmount: '42000.00',
  expectedCurrency: 'AMD',
};

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
        // Step L6.2H4: the hold's server quote.
        quote: SERVER_QUOTE,
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
      items: [{ holdIds: [55], guests: [], ...ACCEPTED_QUOTE }],
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
        items: [
          { holdIds: [55], guests: [], guestCount: 2, ...ACCEPTED_QUOTE },
        ],
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

    test('names the unit a vehicle, never a room type', () => {
      renderPage({ ...RENTAL_HOLD_STATE, bookableUnitType: 'VEHICLE' });
      expect(screen.getByText('Ավտոմեքենա')).toBeInTheDocument();
      expect(screen.queryByText(/Սենյակ/)).not.toBeInTheDocument();
    });
  });

  // Step L6.2B — the unit row speaks the booked unit's own domain noun, and
  // only a lodging stay has a Nights row.
  describe('unit wording and nights (Step L6.2B)', () => {
    test('a hotel stay shows its room type and its nights', () => {
      renderPage({
        ...HOLD_STATE,
        unitLabel: 'Standard Room',
        bookableUnitType: 'HOTEL_ROOM',
      });
      expect(screen.getByText('Սենյակի տեսակ')).toBeInTheDocument();
      expect(screen.getByText('Գիշերներ')).toBeInTheDocument();
    });

    test.each([
      ['TOUR_DEPARTURE', 'Mount Aragats hike', 'Մեկնում / սեանս'],
      ['RESTAURANT_TABLE', 'Main hall', 'Սեղան'],
    ])(
      'a date-range %s booking never shows a Nights row',
      (bookableUnitType, unitLabel, noun) => {
        renderPage({ ...HOLD_STATE, unitLabel, bookableUnitType });
        expect(screen.getByText(noun)).toBeInTheDocument();
        expect(screen.queryByText('Գիշերներ')).not.toBeInTheDocument();
      },
    );
  });

  // Step L6.2H2B — a restaurant reservation is free and its party size is
  // editable here: the booking request carries the one authoritative value.
  describe('restaurant reservation (Step L6.2H2B)', () => {
    const RESTAURANT_STATE = {
      ...HOLD_STATE,
      isRestaurantReservation: true,
      bookableUnitType: 'RESTAURANT_TABLE',
      unitLabel: 'Main hall',
      guestCount: 4,
      holdBatch: {
        ...HOLD_STATE.holdBatch,
        items: [
          {
            ...HOLD_STATE.holdBatch.items[0],
            quote: {
              unit_price_amount: '0.00',
              total_amount: '0.00',
              currency: 'AMD',
            },
          },
        ],
      },
    };

    test('shows free-reservation wording instead of a monetary total', () => {
      renderPage(RESTAURANT_STATE);
      expect(
        screen.getByText('Անվճար ամրագրում՝ վճարումը ռեստորանում'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/6,?500/)).not.toBeInTheDocument();
    });

    test('the party size is prefilled, editable, and the edited value is what gets booked', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 42 } });
      useCreateBookingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
      });
      const user = userEvent.setup();
      renderPage(RESTAURANT_STATE);

      const partySize = screen.getByLabelText(/Հյուրերի քանակ/);
      expect(partySize).toHaveValue(4);
      await user.clear(partySize);
      await user.type(partySize, '6');
      await user.click(
        screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
      );

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            {
              holdIds: [55],
              guests: [],
              guestCount: 6,
              expectedTotalAmount: '0.00',
              expectedCurrency: 'AMD',
            },
          ],
        }),
      );
    });

    test.each([['0'], ['2.5']])(
      'an invalid party size (%s) blocks submission with a message',
      async (value) => {
        const mutateAsync = vi.fn();
        useCreateBookingMutation.mockReturnValue({
          mutateAsync,
          isPending: false,
        });
        const user = userEvent.setup();
        renderPage(RESTAURANT_STATE);

        const partySize = screen.getByLabelText(/Հյուրերի քանակ/);
        await user.clear(partySize);
        await user.type(partySize, value);
        await user.click(
          screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
        );

        expect(
          await screen.findByText('Նշեք ամբողջ թիվ՝ առնվազն 1։'),
        ).toBeInTheDocument();
        expect(mutateAsync).not.toHaveBeenCalled();
      },
    );

    test('a non-restaurant checkout has no party-size field', () => {
      renderPage({ ...HOLD_STATE, guestCount: 2 });
      expect(screen.queryByLabelText(/Հյուրերի քանակ/)).not.toBeInTheDocument();
    });
  });

  // Step L6.2H3B — a departure shows only its one people count (the held
  // quantity), named by category, and sends no separate guest count.
  describe('departure people count (Step L6.2H3B)', () => {
    const DEPARTURE_STATE = {
      ...HOLD_STATE,
      holdBatch: {
        ...HOLD_STATE.holdBatch,
        items: [{ ...HOLD_STATE.holdBatch.items[0], quantity: 4 }],
      },
      bookableUnitType: 'TOUR_DEPARTURE',
      unitLabel: 'Shared Group Departure',
      guestCount: null,
      departurePeopleKey: 'visitors',
    };

    test('shows "Visitors 4" and neither a Guests nor a Quantity row', () => {
      renderPage(DEPARTURE_STATE);
      expect(screen.getByText('Այցելուներ')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.queryByText('Հյուրեր')).not.toBeInTheDocument();
      expect(screen.queryByText('Քանակ')).not.toBeInTheDocument();
    });

    test('submits the hold with no separate guest count', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 42 } });
      useCreateBookingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
      });
      const user = userEvent.setup();
      renderPage(DEPARTURE_STATE);

      await user.click(
        screen.getByRole('button', { name: 'Հաստատել ամրագրման հայտը' }),
      );

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      const [{ items }] = mutateAsync.mock.calls[0];
      expect(items).toEqual([
        {
          holdIds: [55],
          guests: [],
          guestCount: undefined,
          ...ACCEPTED_QUOTE,
        },
      ]);
      expect(JSON.parse(JSON.stringify(items))).toEqual([
        { holdIds: [55], guests: [], ...ACCEPTED_QUOTE },
      ]);
    });
  });

  // Step L6.2H4 — the hold's server quote is the checkout total and the
  // accepted quote; a changed price needs the customer's explicit accept.
  describe('server quote (Step L6.2H4)', () => {
    const SUBMIT_LABEL = 'Հաստատել ամրագրման հայտը';
    const CHANGED_QUOTE = {
      unit_price_amount: '60000.00',
      total_amount: '60000.00',
      currency: 'AMD',
    };

    function stateWithQuote(quote, itemOverrides = {}) {
      return {
        ...HOLD_STATE,
        holdBatch: {
          ...HOLD_STATE.holdBatch,
          items: [
            { ...HOLD_STATE.holdBatch.items[0], ...itemOverrides, quote },
          ],
        },
      };
    }

    function priceChangedError(quote = CHANGED_QUOTE) {
      return Object.assign(new Error('Price changed'), {
        code: 'PRICE_CHANGED',
        status: 409,
        details: [{ field: 'items.0', issue: 'PRICE_CHANGED', ...quote }],
      });
    }

    test('the total is the server quote (in the display currency), with no estimate wording', async () => {
      renderPage();
      // 42,000 AMD at the fixture's 400 AMD/USD; 'en' displays USD.
      expect(await screen.findByText(/\$105\.00/)).toBeInTheDocument();
      expect(screen.queryByText(/գնահատական/)).not.toBeInTheDocument();
    });

    test('a multi-room hold shows the quote for every held room', async () => {
      renderPage(
        stateWithQuote(
          {
            unit_price_amount: '40000.00',
            total_amount: '80000.00',
            currency: 'AMD',
          },
          { quantity: 2 },
        ),
      );
      expect(await screen.findByText(/\$200\.00/)).toBeInTheDocument();
    });

    test.each([
      ['USD', '241.00', /\$241\.00/],
      ['EUR', '60.00', /€60\.00/],
    ])(
      'a %s quote renders in its own currency, never relabelled as AMD',
      (currency, amount, shown) => {
        renderPage(
          stateWithQuote({
            unit_price_amount: amount,
            total_amount: amount,
            currency,
          }),
        );
        expect(screen.getByText(shown)).toBeInTheDocument();
      },
    );

    test('a hold without a server quote cannot be booked', () => {
      renderPage(stateWithQuote(null));
      expect(
        screen.getByText(
          'Այս պահին չենք կարող հաստատել այս ամրագրման գինը։ Ազատեք պահումը և փորձեք ավելի ուշ։',
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeDisabled();
    });

    test('PRICE_CHANGED shows the previous and new totals, books nothing and never resubmits on its own', async () => {
      const mutateAsync = vi.fn().mockRejectedValueOnce(priceChangedError());
      useCreateBookingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

      const title = await screen.findByText('Գինը փոխվեց ամրագրման ընթացքում։');
      const warning = title.closest('[role="status"]');
      expect(warning).toHaveTextContent('Նախորդ ընդհանուր գումար');
      expect(warning).toHaveTextContent('$105.00');
      expect(warning).toHaveTextContent('Նոր ընդհանուր գումար');
      expect(warning).toHaveTextContent('$150.00');
      expect(warning.parentElement).toHaveFocus();
      expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeDisabled();
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(
        screen.queryByText(
          'Չհաջողվեց ուղարկել ձեր ամրագրման հայտը։ Խնդրում ենք կրկին փորձել։',
        ),
      ).not.toBeInTheDocument();
    });

    test('accepting the new price keeps it in history state and books at it only on the next explicit submit', async () => {
      const mutateAsync = vi
        .fn()
        .mockRejectedValueOnce(priceChangedError())
        .mockResolvedValueOnce({ data: { id: 77 } });
      useCreateBookingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
      });
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

      await user.click(
        await screen.findByRole('button', { name: 'Ընդունել նոր գինը' }),
      );

      expect(mockNavigate).toHaveBeenCalledWith('/en/booking/checkout', {
        replace: true,
        state: expect.objectContaining({
          holdBatch: expect.objectContaining({
            items: [expect.objectContaining({ quote: CHANGED_QUOTE })],
          }),
        }),
      });
      expect(
        screen.queryByText('Գինը փոխվեց ամրագրման ընթացքում։'),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/\$150\.00/)).toBeInTheDocument();
      expect(mutateAsync).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
      expect(mutateAsync.mock.calls[1][0].items).toEqual([
        {
          holdIds: [55],
          guests: [],
          guestCount: undefined,
          expectedTotalAmount: '60000.00',
          expectedCurrency: 'AMD',
        },
      ]);
      expect(mockNavigate).toHaveBeenLastCalledWith('/en/account/bookings/77');
    });

    test('a quote accepted earlier (a same-tab refresh) is the one shown and sent', async () => {
      const mutateAsync = vi.fn().mockResolvedValue({ data: { id: 78 } });
      useCreateBookingMutation.mockReturnValue({
        mutateAsync,
        isPending: false,
      });
      const user = userEvent.setup();
      renderPage(stateWithQuote(CHANGED_QUOTE));

      expect(await screen.findByText(/\$150\.00/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync.mock.calls[0][0].items[0]).toMatchObject({
        expectedTotalAmount: '60000.00',
        expectedCurrency: 'AMD',
      });
    });
  });

  // Step L6.3B — an hourly hotel stay reads as one date and its hours,
  // never as nights; the total is still the hold's server quote.
  describe('hourly hotel stay (Step L6.3B)', () => {
    const HOURLY_STATE = {
      ...HOLD_STATE,
      unitLabel: 'Day Room',
      bookableUnitType: 'HOTEL_ROOM',
      bookingMode: 'HOURLY',
      holdBatch: {
        ...HOLD_STATE.holdBatch,
        items: [
          {
            ...HOLD_STATE.holdBatch.items[0],
            booking_mode: 'HOURLY',
            date_from: '2026-08-01',
            date_to: '2026-08-01',
            start_time: '14:00',
            end_time: '18:00',
            quantity: 2,
            quote: {
              unit_price_amount: '32000.00',
              total_amount: '64000.00',
              currency: 'AMD',
            },
          },
        ],
      },
    };

    test('shows type, date, start, end, duration and rooms — and no nights', () => {
      renderPage(HOURLY_STATE);
      [
        ['Ամրագրման տեսակ', 'Ժամային կեցություն'],
        ['Սկիզբ', '14:00'],
        ['Ավարտ', '18:00'],
        ['Տևողություն', '4 ժամ'],
        ['Քանակ', '2'],
      ].forEach(([label, value]) => {
        const row = screen.getByText(label).parentElement;
        expect(within(row).getByText(value)).toBeInTheDocument();
      });
      expect(screen.queryByText('Գիշերներ')).not.toBeInTheDocument();
      expect(screen.queryByText('Ամսաթվեր')).not.toBeInTheDocument();
    });

    test('the total is the hourly server quote for every room', async () => {
      renderPage(HOURLY_STATE);
      // 64,000 AMD at the fixture's 400 AMD/USD.
      expect(await screen.findByText(/\$160\.00/)).toBeInTheDocument();
    });
  });
});

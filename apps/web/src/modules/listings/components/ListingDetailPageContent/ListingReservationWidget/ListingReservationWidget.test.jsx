import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import i18n from 'i18next';
import ToastProvider from '../../../../../providers/ToastProvider.jsx';
import CurrencyProvider from '../../../../../providers/CurrencyProvider.jsx';
import ListingReservationWidget from './ListingReservationWidget.jsx';
import { useAuth } from '../../../../../contexts/AuthContext.jsx';
import { useListingBookableUnitsQuery } from '../../../queries/useListingBookableUnitsQuery.js';
import { useListingCalendarQuery } from '../../../queries/useListingCalendarQuery.js';
import { useListingDayStatusQuery } from '../../../queries/useListingDayStatusQuery.js';
import { useCreateBookingHoldMutation } from '../../../../bookings/mutations/useCreateBookingHoldMutation.js';

vi.mock('../../../../../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../../../api/fx.js', () => ({
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

// DatePicker's own calendar-grid UX is covered by DatePicker.test.jsx;
// this widget's test only needs to drive its `onChange` contract to
// exercise the widget's OWN logic (gating, estimate, submit, redirect).
vi.mock('@desavii/ui/components/form-controls', async () => {
  const actual = await vi.importActual('@desavii/ui/components/form-controls');
  // Sprint A: single mode's real `onChange` emits a plain date string, not
  // a `{start, end}` object (see `DatePicker.test.jsx`'s own "onChange
  // emits plain YYYY-MM-DD strings" case) — this mock now branches on
  // `mode` to match, but keeps the exact same button label/click shape
  // every existing (range-mode) test in this file already relies on.
  function MockDatePicker({ mode = 'range', onChange, disabledDates = [] }) {
    return (
      <>
        <button
          type="button"
          onClick={() =>
            mode === 'single'
              ? onChange('2027-08-01')
              : onChange({ start: '2027-08-01', end: '2027-08-02' })
          }
        >
          pick dates
        </button>
        <div data-testid="disabled-dates">{disabledDates.join(',')}</div>
      </>
    );
  }
  MockDatePicker.propTypes = {
    mode: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    disabledDates: PropTypes.arrayOf(PropTypes.string),
  };
  return {
    ...actual,
    DatePicker: MockDatePicker,
  };
});

const SINGLE_UNIT = [
  { id: 1, bookable_unit_type: 'PROPERTY_UNIT', capacity: 1 },
];
const MULTI_UNIT = [
  { id: 1, bookable_unit_type: 'HOTEL_ROOM', capacity: 2 },
  { id: 2, bookable_unit_type: 'HOTEL_ROOM', capacity: 4 },
];
// P2.2B fixtures: real unit_label/max_guests/base_price/bed_configuration,
// the same shape the public units DTO actually returns.
const MULTI_UNIT_LABELED = [
  {
    id: 1,
    bookable_unit_type: 'HOTEL_ROOM',
    capacity: 2,
    unit_label: 'Standard Room',
    max_guests: 2,
    base_price_amount: '50000.00',
    base_price_currency: 'AMD',
    bed_configuration: [{ type: 'QUEEN', count: 1 }],
  },
  {
    id: 2,
    bookable_unit_type: 'HOTEL_ROOM',
    capacity: 1,
    unit_label: 'Deluxe Suite',
    max_guests: 4,
    base_price_amount: '90000.00',
    base_price_currency: 'AMD',
    bed_configuration: [{ type: 'KING', count: 1 }],
  },
];
const CALENDAR_DAYS = [
  {
    date: '2027-08-01',
    status: 'AVAILABLE',
    price_amount: '100.00',
    price_currency: 'AMD',
  },
  {
    date: '2027-08-02',
    status: 'AVAILABLE',
    price_amount: '120.00',
    price_currency: 'AMD',
  },
];
// Sprint A (Time-Aware Booking Foundation) fixtures — two real departures
// of the same Tour, the exact shape `GET /availability/:listingId/units`
// returns (`time_slot_start`/`time_slot_end` present).
const TIME_SLOT_UNITS = [
  {
    id: 1,
    bookable_unit_type: 'TOUR_DEPARTURE',
    capacity: 12,
    time_slot_start: '09:00',
    time_slot_end: '11:30',
    unit_label: '09:00 Departure',
  },
  {
    id: 2,
    bookable_unit_type: 'TOUR_DEPARTURE',
    capacity: 12,
    time_slot_start: '14:00',
    time_slot_end: '16:30',
    unit_label: '14:00 Departure',
  },
];
const SINGLE_TIME_SLOT_UNIT = [
  {
    id: 1,
    bookable_unit_type: 'TOUR_DEPARTURE',
    capacity: 12,
    time_slot_start: '09:00',
    time_slot_end: '11:30',
    unit_label: '09:00 Departure',
  },
];

const DAY_STATUSES = [
  {
    date: '2027-08-01',
    availability_status: 'AVAILABLE',
    remaining_count: null,
  },
  {
    date: '2027-08-02',
    availability_status: 'AVAILABLE',
    remaining_count: null,
  },
];

function RouteScopedWidget(props) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <ListingReservationWidget
        listingId={10}
        pricing={{ amount: '85000.00', currency: 'AMD' }}
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
      />
    </CurrencyProvider>
  );
}

function renderWidget(props = {}, initialEntry = '/en/listings/10') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/listings/:id"
              // eslint-disable-next-line react/jsx-props-no-spreading
              element={<RouteScopedWidget {...props} />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListingReservationWidget (Listing Details, Phase 7)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingCalendarQuery.mockReturnValue({
      data: CALENDAR_DAYS,
      refetch: vi.fn(),
    });
    useListingDayStatusQuery.mockReturnValue({
      data: DAY_STATUSES,
      refetch: vi.fn(),
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('shows a spinner while units are pending', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    renderWidget();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  test('shows a retryable error state when the units query fails', async () => {
    const refetch = vi.fn();
    useListingBookableUnitsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();
    renderWidget();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('shows the price and an honest "not bookable yet" message when the listing has zero units', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderWidget();
    expect(
      screen.getByText(
        'Այս հայտարարությունը դեռ հասանելի չէ առցանց ամրագրման համար։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Ուղարկել/ }),
    ).not.toBeInTheDocument();
  });

  test('auto-selects the single unit — no unit selector shown', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();
    expect(screen.queryByText('Միավոր')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeInTheDocument();
  });

  test('shows a unit selector when there is more than one unit', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: MULTI_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();
    expect(screen.getByText('Միավոր')).toBeInTheDocument();
  });

  test('the Request to Book button is disabled until dates are selected', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();
  });

  test('selecting dates enables submit and shows a checkout-exclusive estimated total', async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    // Pass 8: 'hy' locale's own default display currency is AMD (no FX
    // conversion) — this test is about checkout-exclusive pricing logic,
    // not currency display, so it renders in the one locale that keeps
    // these raw AMD fixture amounts unconverted.
    renderWidget({}, '/hy/listings/10');

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeEnabled();
    // P2.2B: SINGLE_UNIT is a PROPERTY_UNIT (accommodation) — the picked
    // range (2027-08-01 -> 2027-08-02) is a genuine 1-night stay, so only
    // the check-in day's price (100) is charged, matching the backend's
    // own checkout-exclusive `resolveConsumedRange`. The old inclusive-
    // both-ends sum (100 + 120 = 220) double-charged the checkout day —
    // this is the exact bug P2.2B fixes, not a weakened assertion.
    // Pass 8: AMD's own display rounding policy shows a whole dram, no
    // decimals (formatMoney.js's CURRENCY_DISPLAY_DECIMALS) — "100 ֏",
    // not "100.00 ֏".
    expect(screen.getByText('100 ֏')).toBeInTheDocument();
    expect(screen.queryByText(/220/)).not.toBeInTheDocument();
  });

  test('a non-accommodation unit type keeps the original inclusive-both-ends estimate', async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 1, bookable_unit_type: 'VEHICLE', capacity: 1 }],
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    // Pass 8: same 'hy'/AMD (unconverted) rendering choice as the test
    // above — this asserts on the raw AMD fixture sum, not currency.
    renderWidget({}, '/hy/listings/10');

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    // A VEHICLE rental is billed inclusive of the return day — 100 + 120.
    expect(screen.getByText(/220/)).toBeInTheDocument();
  });

  test('P2.2E: the unit selector shows each real unit_label with its known max guests, price, and available quantity, not a generic "Type #N" ordinal', async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: MULTI_UNIT_LABELED,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByTestId('select-trigger'));

    expect(
      screen.getByRole('option', {
        name: 'Standard Room — Ընդունում է 2 հյուր — 50000.00 AMD / գիշեր — 2 հասանելի',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', {
        name: 'Deluxe Suite — Ընդունում է 4 հյուր — 90000.00 AMD / գիշեր — 1 հասանելի',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Type #1/)).not.toBeInTheDocument();
  });

  test("P2.2E: a unit with no base price of its own shows no price suffix in the selector (never the listing fallback mislabeled as this unit's price)", async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          id: 1,
          bookable_unit_type: 'HOTEL_ROOM',
          capacity: 2,
          unit_label: 'Legacy Room',
          max_guests: 2,
          base_price_amount: null,
          base_price_currency: null,
        },
        MULTI_UNIT_LABELED[1],
      ],
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByTestId('select-trigger'));

    expect(
      screen.getByRole('option', {
        name: 'Legacy Room — Ընդունում է 2 հյուր — 2 հասանելի',
      }),
    ).toBeInTheDocument();
  });

  test("selecting a different room type switches the headline price to that unit's own resolved price and shows its bed configuration", async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: MULTI_UNIT_LABELED,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    // Pass 8: 'hy'/AMD keeps these raw fixture amounts unconverted — this
    // test is about which price wins (listing vs. selected unit), not
    // currency display.
    renderWidget(
      { pricing: { amount: '85000.00', currency: 'AMD' } },
      '/hy/listings/10',
    );

    // Before any explicit selection, the static listing price is
    // unchanged (P2.2B: "before explicit selection, preserve existing
    // behavior").
    // 'hy' locale's Intl grouping separator is a space, not a comma
    // (e.g. "85 000 ֏") — the option label text below is a plain
    // template string with no grouping at all ("90000.00"); this
    // character class matches either.
    expect(screen.getByText(/85[.,\s]?000/)).toBeInTheDocument();

    await user.click(screen.getByTestId('select-trigger'));
    await user.click(
      screen.getByRole('option', {
        name: 'Deluxe Suite — Ընդունում է 4 հյուր — 90000.00 AMD / գիշեր — 1 հասանելի',
      }),
    );

    // The headline now reflects the SELECTED unit's own base price, not
    // the static listing price. Two matches are expected here (up from
    // one, pre-P2.2E): the headline `PriceTag` AND the select's own
    // displayed current-option text, which since P2.2E also states this
    // unit's price — both agree with each other, never diverge.
    expect(screen.getAllByText(/90[.,\s]?000/)).toHaveLength(2);
    expect(screen.queryByText(/85[.,\s]?000/)).not.toBeInTheDocument();
    expect(screen.getByText('1 × Քինգ')).toBeInTheDocument();
  });

  test('guest count is clamped to max_guests × quantity, both directly and when a shrinking quantity lowers the cap', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        { id: 1, bookable_unit_type: 'HOTEL_ROOM', capacity: 3, max_guests: 2 },
      ],
      isPending: false,
      isError: false,
    });
    renderWidget();

    const guestsInput = screen.getByLabelText('Հյուրեր');
    fireEvent.change(guestsInput, { target: { value: '99' } });
    // 2 max_guests x 1 (default) quantity.
    expect(guestsInput).toHaveValue(2);

    const quantityInput = screen.getByLabelText('Քանակ');
    fireEvent.change(quantityInput, { target: { value: '3' } });
    expect(quantityInput).toHaveValue(3);

    fireEvent.change(guestsInput, { target: { value: '99' } });
    // 2 max_guests x 3 quantity.
    expect(guestsInput).toHaveValue(6);

    fireEvent.change(quantityInput, { target: { value: '1' } });
    // Shrinking quantity back down re-clamps the already-entered guest
    // count so the two fields never drift into an invalid combination.
    expect(guestsInput).toHaveValue(2);
  });

  test('a legacy unit with no max_guests never invents a guest-count limit', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 1, bookable_unit_type: 'HOTEL_ROOM', capacity: 2 }],
      isPending: false,
      isError: false,
    });
    renderWidget();

    const guestsInput = screen.getByLabelText('Հյուրեր');
    fireEvent.change(guestsInput, { target: { value: '99' } });
    expect(guestsInput).toHaveValue(99);
  });

  test('clicking Request to Book while unauthenticated redirects to login without creating a hold', async () => {
    useAuth.mockReturnValue({ isAuthenticated: false });
    const mutateAsync = vi.fn();
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/en/auth/login?redirect='),
    );
  });

  test('clicking Request to Book while authenticated creates a hold and navigates to checkout', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      data: { items: [{ hold_ids: [1] }], expires_at: '2027-08-01T00:15:00Z' },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 1,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-02',
        quantity: 1,
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/en/booking/checkout',
      expect.objectContaining({
        state: expect.objectContaining({ listingId: 10 }),
      }),
    );
  });

  test('a quantity greater than 1 is sent through in the hold request, along with the resolved unit label and guest count', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      data: {
        items: [{ hold_ids: [1, 2] }],
        expires_at: '2027-08-01T00:15:00Z',
      },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          id: 1,
          bookable_unit_type: 'HOTEL_ROOM',
          capacity: 3,
          unit_label: 'Standard Room',
          max_guests: 2,
        },
      ],
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    const quantityInput = screen.getByLabelText('Քանակ');
    fireEvent.change(quantityInput, { target: { value: '2' } });

    const guestsInput = screen.getByLabelText('Հյուրեր');
    fireEvent.change(guestsInput, { target: { value: '3' } });

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 1,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-02',
        quantity: 2,
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/en/booking/checkout',
      expect.objectContaining({
        state: expect.objectContaining({
          unitLabel: 'Standard Room',
          guestCount: 3,
        }),
      }),
    );
  });

  test('shows an error toast and does not navigate when the hold request fails', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('conflict'));
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(
      await screen.findByText(
        'Չհաջողվեց պահել այս ամսաթվերը։ Խնդրում ենք կրկին փորձել։',
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('a stale-availability conflict (AVAILABILITY_CONFLICT) shows a specific message and refreshes the calendar', async () => {
    const conflictError = Object.assign(new Error('No capacity'), {
      code: 'AVAILABILITY_CONFLICT',
    });
    const mutateAsync = vi.fn().mockRejectedValue(conflictError);
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const refetch = vi.fn();
    useListingCalendarQuery.mockReturnValue({
      data: CALENDAR_DAYS,
      refetch,
    });
    const refetchDayStatus = vi.fn();
    useListingDayStatusQuery.mockReturnValue({
      data: DAY_STATUSES,
      refetch: refetchDayStatus,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(
      await screen.findByText(
        'Այս ամսաթվերն այլևս հասանելի չեն։ Խնդրում ենք ընտրել այլ ամսաթվեր։',
      ),
    ).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetchDayStatus).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('disables a day whose day-status is SOLD_OUT even when the raw calendar still says AVAILABLE (Phase 18 Availability UX fix)', async () => {
    // The raw calendar's own `status` field only reflects `status_id`
    // (AVAILABLE/BLOCKED) — a day whose `quantity_available` a manual
    // block or external reservation already consumed to zero without
    // flipping `status_id` would incorrectly still show as pickable if
    // the widget trusted `useListingCalendarQuery` for this. The day-status
    // endpoint is the authoritative source instead.
    useListingDayStatusQuery.mockReturnValue({
      data: [
        {
          date: '2027-08-01',
          availability_status: 'SOLD_OUT',
          remaining_count: 0,
        },
        {
          date: '2027-08-02',
          availability_status: 'AVAILABLE',
          remaining_count: null,
        },
      ],
      refetch: vi.fn(),
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();

    expect(screen.getByTestId('disabled-dates')).toHaveTextContent(
      '2027-08-01',
    );
    expect(screen.getByTestId('disabled-dates')).not.toHaveTextContent(
      '2027-08-02',
    );
  });

  test('a blackout-veto conflict (BLACKOUT_DATE) also shows the specific conflict message', async () => {
    const conflictError = Object.assign(new Error('Blocked'), {
      code: 'BLACKOUT_DATE',
    });
    const mutateAsync = vi.fn().mockRejectedValue(conflictError);
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(
      await screen.findByText(
        'Այս ամսաթվերն այլևս հասանելի չեն։ Խնդրում ենք ընտրել այլ ամսաթվեր։',
      ),
    ).toBeInTheDocument();
  });

  test('renders the group-scoped booking CTA copy when a category-specific bookingCtaKey is passed', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget({
      bookingCtaKey:
        'pages.listingDetail.reservation.requestToBookByGroup.EXPERIENCE',
    });

    expect(
      screen.getByRole('button', { name: 'Ամրագրել ձեր տեղը' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).not.toBeInTheDocument();
  });

  describe("P2.2D: initializes from the search page's own URL context", () => {
    test('a valid dateFrom/dateTo/guests carried from search prefills the widget immediately', () => {
      useListingBookableUnitsQuery.mockReturnValue({
        data: SINGLE_UNIT,
        isPending: false,
        isError: false,
      });
      renderWidget(
        {},
        '/en/listings/10?dateFrom=2027-09-10&dateTo=2027-09-12&guests=2',
      );

      // dateRange is already valid without ever clicking the (mocked)
      // date picker — proven by the submit button being enabled from the
      // very first render, since `canSubmit` requires a real start/end.
      expect(
        screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
      ).toBeEnabled();
      expect(screen.getByLabelText('Հյուրեր')).toHaveValue(2);
    });

    test('a bare listing URL with no query params keeps the original blank/1 defaults', () => {
      useListingBookableUnitsQuery.mockReturnValue({
        data: SINGLE_UNIT,
        isPending: false,
        isError: false,
      });
      renderWidget({}, '/en/listings/10');

      expect(
        screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Հյուրեր')).toHaveValue(1);
    });

    test.each([
      [
        'a past dateFrom',
        '/en/listings/10?dateFrom=2020-01-01&dateTo=2020-01-03&guests=2',
      ],
      [
        'dateTo before dateFrom',
        '/en/listings/10?dateFrom=2027-09-12&dateTo=2027-09-10&guests=2',
      ],
      [
        'a malformed date',
        '/en/listings/10?dateFrom=not-a-date&dateTo=2027-09-12&guests=2',
      ],
      [
        'only dateFrom, no dateTo',
        '/en/listings/10?dateFrom=2027-09-10&guests=2',
      ],
    ])('falls back to blank dates rather than trusting %s', (_label, entry) => {
      useListingBookableUnitsQuery.mockReturnValue({
        data: SINGLE_UNIT,
        isPending: false,
        isError: false,
      });
      renderWidget({}, entry);
      expect(
        screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
      ).toBeDisabled();
    });

    test.each([
      ['zero', '/en/listings/10?guests=0'],
      ['negative', '/en/listings/10?guests=-3'],
      ['non-numeric', '/en/listings/10?guests=abc'],
      ['above the sane bound', '/en/listings/10?guests=999'],
    ])(
      'falls back to guests=1 rather than trusting a %s value',
      (_label, entry) => {
        useListingBookableUnitsQuery.mockReturnValue({
          data: SINGLE_UNIT,
          isPending: false,
          isError: false,
        });
        renderWidget({}, entry);
        expect(screen.getByLabelText('Հյուրեր')).toHaveValue(1);
      },
    );

    test("an initial guest count exceeding the selected unit's real max_guests is re-clamped once units load", () => {
      useListingBookableUnitsQuery.mockReturnValue({
        data: [
          {
            id: 1,
            bookable_unit_type: 'HOTEL_ROOM',
            capacity: 3,
            max_guests: 2,
          },
        ],
        isPending: false,
        isError: false,
      });
      renderWidget({}, '/en/listings/10?guests=5');
      // 5 was validly parsed from the URL (1..50), but this specific
      // unit's own max_guests × quantity(1) is 2 — the same re-clamp
      // `handleChangeQuantity` already applies on every later change.
      expect(screen.getByLabelText('Հյուրեր')).toHaveValue(2);
    });

    // Final-review fix: a multi-unit listing never auto-selects (see
    // `effectiveUnitId`), so picking a room is mandatory — proven live
    // in the browser that the pre-existing `handleSelectUnit` reset
    // silently discarded the URL-seeded dateRange/guestCount the
    // instant a customer picked their FIRST room, making the whole
    // handoff a no-op for exactly the multi-room listings P2.2A exists
    // for. Genuinely switching to a DIFFERENT unit afterward must still
    // reset both fields (a previously valid range/count isn't
    // necessarily valid for a different unit) — both behaviors are
    // asserted together so a regression in either direction is caught.
    test('the first room pick preserves URL-seeded dates/guests; switching to a different room still resets them', async () => {
      useListingBookableUnitsQuery.mockReturnValue({
        data: MULTI_UNIT_LABELED,
        isPending: false,
        isError: false,
      });
      const user = userEvent.setup();
      renderWidget(
        {},
        '/en/listings/10?dateFrom=2027-09-10&dateTo=2027-09-12&guests=2',
      );

      await user.click(screen.getByTestId('select-trigger'));
      await user.click(
        screen.getByRole('option', {
          name: 'Standard Room — Ընդունում է 2 հյուր — 50000.00 AMD / գիշեր — 2 հասանելի',
        }),
      );
      expect(
        screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
      ).toBeEnabled();
      expect(screen.getByLabelText('Հյուրեր')).toHaveValue(2);

      await user.click(screen.getByTestId('select-trigger'));
      await user.click(
        screen.getByRole('option', {
          name: 'Deluxe Suite — Ընդունում է 4 հյուր — 90000.00 AMD / գիշեր — 1 հասանելի',
        }),
      );
      expect(
        screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
      ).toBeDisabled();
      expect(screen.getByLabelText('Հյուրեր')).toHaveValue(1);
    });
  });
});

describe('ListingReservationWidget — Sprint A (Time-Aware Booking Foundation)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingCalendarQuery.mockReturnValue({
      data: CALENDAR_DAYS,
      refetch: vi.fn(),
    });
    useListingDayStatusQuery.mockReturnValue({
      data: DAY_STATUSES,
      refetch: vi.fn(),
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('a time-slot listing never shows the generic Unit selector, and shows no time chips before a date is picked', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: TIME_SLOT_UNITS,
      isPending: false,
      isError: false,
    });
    renderWidget();

    // The DatePicker itself is mocked (see this file's own header comment)
    // — its real `mode`/`label` rendering is covered by DatePicker.test.jsx.
    // What belongs to THIS widget's own logic is asserted here: no generic
    // unit dropdown, and no time options rendered before a date exists.
    expect(screen.queryByText('Միավոր')).not.toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByText(/09:00–11:30/)).not.toBeInTheDocument();
  });

  test('a single time-slot unit shows its time as plain text — no chip group needed', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_TIME_SLOT_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();

    expect(screen.getByText(/09:00–11:30/)).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  test('after picking a date, real available times render as selectable chips sourced from the per-date query', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.date
        ? {
            data: [
              {
                ...TIME_SLOT_UNITS[0],
                availability_status_for_date: 'AVAILABLE',
              },
              {
                ...TIME_SLOT_UNITS[1],
                availability_status_for_date: 'AVAILABLE',
              },
            ],
            isPending: false,
            isError: false,
          }
        : { data: TIME_SLOT_UNITS, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    renderWidget();

    // No times are shown before a date is picked.
    expect(screen.queryByText(/09:00–11:30/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(
      screen.getByRole('button', { name: '09:00–11:30' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '14:00–16:30' }),
    ).toBeInTheDocument();
  });

  test('a sold-out departure on the selected date renders as a disabled chip, not hidden and not fake-urgent', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.date
        ? {
            data: [
              {
                ...TIME_SLOT_UNITS[0],
                availability_status_for_date: 'SOLD_OUT',
                remaining_count_for_date: 0,
              },
              {
                ...TIME_SLOT_UNITS[1],
                availability_status_for_date: 'AVAILABLE',
              },
            ],
            isPending: false,
            isError: false,
          }
        : { data: TIME_SLOT_UNITS, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(screen.getByRole('button', { name: '09:00–11:30' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '14:00–16:30' })).toBeEnabled();
  });

  test('a date with zero real availability shows an honest "no times" message rather than a dead chip row', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.date
        ? {
            data: TIME_SLOT_UNITS.map((unit) => ({
              ...unit,
              availability_status_for_date: 'SOLD_OUT',
              remaining_count_for_date: 0,
            })),
            isPending: false,
            isError: false,
          }
        : { data: TIME_SLOT_UNITS, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(
      screen.getByText(
        'Այս ամսաթվի համար հասանելի ժամեր չկան։ Խնդրում ենք ընտրել այլ ամսաթիվ։',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  test('selecting a real time enables submit and sends that exact unit id in the hold request', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.date
        ? {
            data: TIME_SLOT_UNITS.map((unit) => ({
              ...unit,
              availability_status_for_date: 'AVAILABLE',
            })),
            isPending: false,
            isError: false,
          }
        : { data: TIME_SLOT_UNITS, isPending: false, isError: false },
    );
    const mutateAsync = vi.fn().mockResolvedValue({
      data: { items: [{ hold_ids: [1] }], expires_at: '2027-08-01T00:15:00Z' },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWidget();

    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(screen.getByRole('button', { name: '14:00–16:30' }));

    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 2,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-01',
        quantity: 1,
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/en/booking/checkout',
      expect.objectContaining({
        state: expect.objectContaining({
          timeSlotStart: '14:00',
          timeSlotEnd: '16:30',
        }),
      }),
    );
  });

  test('changing the date clears a previously selected time — no stale time carries forward', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.date
        ? {
            data: TIME_SLOT_UNITS.map((unit) => ({
              ...unit,
              availability_status_for_date: 'AVAILABLE',
            })),
            isPending: false,
            isError: false,
          }
        : { data: TIME_SLOT_UNITS, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(screen.getByRole('button', { name: '09:00–11:30' }));
    expect(screen.getByRole('button', { name: '09:00–11:30' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Picking a (new) date again must not leave the old time selected.
    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(screen.getByRole('button', { name: '09:00–11:30' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();
  });
});

describe('ListingReservationWidget — Sprint B (Car Rental Pickup/Return Interval)', () => {
  const VEHICLE_UNIT = [{ id: 1, bookable_unit_type: 'VEHICLE', capacity: 1 }];
  const RENTAL_LOCATION = { city_name: 'Yerevan', country_name: 'Armenia' };

  beforeEach(() => {
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingCalendarQuery.mockReturnValue({
      data: CALENDAR_DAYS,
      refetch: vi.fn(),
    });
    useListingDayStatusQuery.mockReturnValue({
      data: DAY_STATUSES,
      refetch: vi.fn(),
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: VEHICLE_UNIT,
      isPending: false,
      isError: false,
    });
  });

  test('shows a distinct Pickup and Return group, each displaying the single listing location (same-location-return-only)', () => {
    renderWidget({ location: RENTAL_LOCATION });

    expect(screen.getByText('Ստացում')).toBeInTheDocument();
    expect(screen.getByText('Վերադարձ')).toBeInTheDocument();
    expect(screen.getAllByText('Yerevan, Armenia')).toHaveLength(2);
  });

  test('pickup/return time inputs are disabled until dates are picked, then enabled', async () => {
    const user = userEvent.setup();
    renderWidget({ location: RENTAL_LOCATION });

    expect(screen.getByLabelText('Ստացման ժամը')).toBeDisabled();
    expect(screen.getByLabelText('Վերադարձի ժամը')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(screen.getByLabelText('Ստացման ժամը')).toBeEnabled();
    expect(screen.getByLabelText('Վերադարձի ժամը')).toBeEnabled();
  });

  test('Request to Book stays disabled while the pickup/return time is incomplete', async () => {
    const user = userEvent.setup();
    renderWidget({ location: RENTAL_LOCATION });

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Ստացման ժամը'), {
      target: { value: '10:00' },
    });
    // Only pickup time entered so far — still incomplete.
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();
  });

  test('a same-day rental with return before pickup shows the invalid-interval error and keeps submit disabled', () => {
    renderWidget(
      { location: RENTAL_LOCATION },
      '/en/listings/10?dateFrom=2027-01-01&dateTo=2027-01-01',
    );

    fireEvent.change(screen.getByLabelText('Ստացման ժամը'), {
      target: { value: '18:00' },
    });
    fireEvent.change(screen.getByLabelText('Վերադարձի ժամը'), {
      target: { value: '09:00' },
    });

    expect(
      screen.getByText(
        'Վերադարձը պետք է լինի ստացումից հետո։ Խնդրում ենք ստուգել ընտրված ամսաթվերն ու ժամերը։',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeDisabled();
  });

  test('a valid interval enables submit and sends startTime/endTime through in the hold request and checkout hand-off', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      data: { items: [{ hold_ids: [1] }], expires_at: '2027-08-01T00:15:00Z' },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
    const user = userEvent.setup();
    renderWidget({ location: RENTAL_LOCATION });

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    fireEvent.change(screen.getByLabelText('Ստացման ժամը'), {
      target: { value: '10:00' },
    });
    fireEvent.change(screen.getByLabelText('Վերադարձի ժամը'), {
      target: { value: '18:00' },
    });

    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    );

    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 1,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-02',
        quantity: 1,
        startTime: '10:00',
        endTime: '18:00',
      },
    ]);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/en/booking/checkout',
      expect.objectContaining({
        state: expect.objectContaining({
          pickupTime: '10:00',
          returnTime: '18:00',
          rentalLocationLabel: 'Yerevan, Armenia',
        }),
      }),
    );
  });

  test('a non-vehicle listing never shows the Pickup/Return groups or sends startTime/endTime', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 1, bookable_unit_type: 'HOTEL_ROOM', capacity: 1 }],
      isPending: false,
      isError: false,
    });
    renderWidget({ location: RENTAL_LOCATION });

    expect(screen.queryByText('Ստացում')).not.toBeInTheDocument();
    expect(screen.queryByText('Վերադարձ')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ստացման ժամը')).not.toBeInTheDocument();
  });
});

describe('ListingReservationWidget — Sprint C-3 (Date-Range Room Availability)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingCalendarQuery.mockReturnValue({
      data: CALENDAR_DAYS,
      refetch: vi.fn(),
    });
    useListingDayStatusQuery.mockReturnValue({
      data: DAY_STATUSES,
      refetch: vi.fn(),
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('a Hotel listing shows the date-range picker before the unit selector — dates first, then room', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: MULTI_UNIT_LABELED,
      isPending: false,
      isError: false,
    });
    renderWidget();

    const body = document.body.innerHTML;
    const datesIndex = body.indexOf('pick dates');
    const unitIndex = body.indexOf('select-trigger');
    expect(datesIndex).toBeGreaterThan(-1);
    expect(unitIndex).toBeGreaterThan(-1);
    expect(datesIndex).toBeLessThan(unitIndex);
  });

  test('once a room and a valid stay range are both chosen, the server-computed stay total is shown — never the client day-by-day estimate', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.checkIn
        ? {
            data: [
              {
                ...MULTI_UNIT_LABELED[0],
                availability_status_for_stay: 'AVAILABLE',
                remaining_count_for_stay: null,
                night_count_for_stay: 3,
                // Deliberately NOT a multiple of the unit's own
                // 50000.00/night base price — proves this is the real
                // server total, not a recomputation of the base price.
                stay_total_amount: '142500.00',
                stay_total_currency: 'AMD',
              },
              MULTI_UNIT_LABELED[1],
            ],
            isPending: false,
            isError: false,
          }
        : { data: MULTI_UNIT_LABELED, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    // Pass 8: 'hy'/AMD keeps the server-total fixture amount unconverted
    // — this test is about which total wins (server vs. client-computed),
    // not currency display.
    renderWidget({}, '/hy/listings/10');

    // Dates first, then the room — picking a room does NOT itself count
    // as a "date change", so it survives; the reverse order would
    // immediately clear it (see the "changing the stay dates..." test
    // below), which is the correct, deliberate invalidation rule.
    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(screen.getByTestId('select-trigger'));
    await user.click(
      screen.getByRole('option', {
        name: 'Standard Room — Sleeps 2 — 50000.00 AMD / night — 2 available',
      }),
    );

    // The server total (142,500.00), never the client's own per-day sum
    // (which would compute 100 + 120 = 220 from CALENDAR_DAYS) nor a
    // client-side multiplication of the unit's own base price.
    // 'hy' locale groups with a space, not a comma (e.g. "142 500 ֏").
    expect(screen.getByText(/142[,\s]?500/)).toBeInTheDocument();
    expect(screen.queryByText(/220/)).not.toBeInTheDocument();
  });

  test('a room already SOLD_OUT for the chosen stay disables Request to Book and shows an explicit sold-out message', async () => {
    useListingBookableUnitsQuery.mockImplementation((_listingId, opts = {}) =>
      opts.checkIn
        ? {
            data: [
              {
                ...MULTI_UNIT_LABELED[0],
                availability_status_for_stay: 'SOLD_OUT',
                remaining_count_for_stay: 0,
                night_count_for_stay: 1,
                stay_total_amount: null,
                stay_total_currency: null,
              },
              MULTI_UNIT_LABELED[1],
            ],
            isPending: false,
            isError: false,
          }
        : { data: MULTI_UNIT_LABELED, isPending: false, isError: false },
    );
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(screen.getByTestId('select-trigger'));
    await user.click(
      screen.getByRole('option', {
        name: 'Standard Room — Sleeps 2 — 50000.00 AMD / night — 2 available',
      }),
    );

    expect(
      screen.getByText('This room is sold out for the selected dates.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Request to book' }),
    ).toBeDisabled();
  });

  test('changing the stay dates after picking a room clears the room selection — a new range has not been checked against it yet', async () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: MULTI_UNIT_LABELED,
      isPending: false,
      isError: false,
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByTestId('select-trigger'));
    await user.click(
      screen.getByRole('option', {
        name: 'Standard Room — Sleeps 2 — 50000.00 AMD / night — 2 available',
      }),
    );
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(screen.queryByLabelText('Quantity')).not.toBeInTheDocument();
  });

  test('a non-Hotel listing (Property) is entirely unaffected — no dates-first reorder, no stay query gating submit', () => {
    useListingBookableUnitsQuery.mockReturnValue({
      data: SINGLE_UNIT,
      isPending: false,
      isError: false,
    });
    renderWidget();

    expect(
      screen.getByRole('button', { name: 'Request to book' }),
    ).toBeDisabled();
    expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument();
  });
});

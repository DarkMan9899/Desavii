/**
 * The restaurant and car-rental flows of the rebuilt reservation panel
 * (docs/BOOKING_WIDGET_REBUILD.md §4–§5): a table reservation offers the
 * restaurant's own open times and a party size, never a table count; a
 * published menu adds an optional dish pre-order — chosen in a dialog on
 * the desktop panel and as an in-place step in the mobile sheet — which is
 * handed to checkout as ids, quantities and the subtotal the guest saw. A
 * car rental never asks for guests.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
vi.mock(
  '../../../../bookings/mutations/useCreateBookingHoldMutation.js',
  () => ({ useCreateBookingHoldMutation: vi.fn(), default: vi.fn() }),
);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// The calendar grid is covered by DatePicker's own tests; here a button
// emits the date the way the real picker does.
vi.mock('@desavii/ui/components/form-controls', async () => {
  const actual = await vi.importActual('@desavii/ui/components/form-controls');
  function MockDatePicker({ mode = 'range', onChange }) {
    return (
      <button
        type="button"
        onClick={() =>
          mode === 'single'
            ? onChange('2027-08-01')
            : onChange({ start: '2027-08-01', end: '2027-08-03' })
        }
      >
        pick dates
      </button>
    );
  }
  MockDatePicker.propTypes = {
    mode: PropTypes.string,
    onChange: PropTypes.func.isRequired,
  };
  return { ...actual, DatePicker: MockDatePicker };
});

const TABLE = [{ id: 5, bookable_unit_type: 'RESTAURANT_TABLE', capacity: 6 }];
const CAR = [{ id: 7, bookable_unit_type: 'VEHICLE', capacity: 1 }];
// 2027-08-01 is a Sunday (day_of_week 0).
const HOURS = [
  { day_of_week: 0, opens_at: '12:00', closes_at: '14:00', is_closed: false },
];
const LONG_DISH =
  'Խորոված խոզի փափկամսից՝ մարինացված նռան հյութով և սոխով, մատուցվում է լավաշով';
const MENUS = [
  {
    id: 1,
    is_active: true,
    sections: [
      {
        id: 10,
        title: 'Խորոված',
        items: [
          {
            id: 101,
            title: LONG_DISH,
            price_amount: '5500.00',
            price_currency_code: 'AMD',
            is_active: true,
          },
          {
            id: 102,
            title: 'Ղափամա (սեզոնային)',
            price_amount: '7500.00',
            price_currency_code: 'AMD',
            is_active: false,
          },
        ],
      },
    ],
  },
];

const CTA_TABLE = 'Ամրագրել սեղան';
const CTA_PREORDER = 'Ամրագրել նախապատվերով';

function Scoped(props) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <ListingReservationWidget
        listingId={10}
        pricing={{
          amount: '8000.00',
          currency: 'AMD',
          pricing_model: 'PER_PERSON',
        }}
        listingType="RESTAURANT"
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...props}
      />
    </CurrencyProvider>
  );
}

function renderWidget(props = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/hy/listings/10']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/listings/:id"
              // eslint-disable-next-line react/jsx-props-no-spreading
              element={<Scoped {...props} />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function chooseTime(user, time) {
  await user.click(screen.getByRole('combobox', { name: 'Ամրագրման ժամը' }));
  await user.click(screen.getByRole('option', { name: time }));
}

describe('ListingReservationWidget — restaurant table and pre-order', () => {
  let mutateAsync;

  beforeEach(async () => {
    await i18n.changeLanguage('hy');
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockReturnValue({
      data: TABLE,
      isPending: false,
      isError: false,
    });
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    mutateAsync = vi.fn().mockResolvedValue({
      data: { items: [{ hold_ids: [9] }], expires_at: '2027-08-01T00:15:00Z' },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  test('table only: open times from the partner hours, a party size, no table count or guests', async () => {
    const user = userEvent.setup();
    renderWidget({ weeklyHours: HOURS });

    expect(screen.queryByLabelText('Հյուրեր')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Քանակ')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Հյուրերի քանակ')).toHaveValue(1);
    // No menu published: no pre-order choice at all.
    expect(screen.queryByText('Միայն սեղան')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(screen.getByRole('combobox', { name: 'Ամրագրման ժամը' }));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['12:00', '12:30', '13:00', '13:30']);
    await user.click(screen.getByRole('option', { name: '13:00' }));
    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել՝ Հյուրերի քանակ' }),
    );
    await user.click(screen.getByRole('button', { name: CTA_TABLE }));

    expect(mutateAsync).toHaveBeenCalledWith([
      {
        bookableUnitId: 5,
        dateFrom: '2027-08-01',
        dateTo: '2027-08-01',
        quantity: 1,
        startTime: '13:00',
      },
    ]);
    const { state } = mockNavigate.mock.calls[0][1];
    expect(state.guestCount).toBe(2);
    expect(state.menuPreorder).toBeNull();
  });

  test('pre-order (desktop): dishes in a dialog, inactive ones hidden, handed to checkout with the subtotal', async () => {
    const user = userEvent.setup();
    renderWidget({ weeklyHours: HOURS, menus: MENUS });

    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await chooseTime(user, '12:30');
    await user.click(
      screen.getByRole('radio', { name: 'Սեղան և ճաշատեսակների նախապատվեր' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Ընտրել ճաշատեսակներ' }),
    );

    const dialog = screen.getByRole('dialog');
    // The visible title, plus the stepper's own screen-reader label.
    expect(within(dialog).getAllByText(LONG_DISH)).toHaveLength(2);
    expect(
      within(dialog).queryByText('Ղափամա (սեզոնային)'),
    ).not.toBeInTheDocument();
    const increase = within(dialog).getByRole('button', {
      name: `Ավելացնել՝ ${LONG_DISH}`,
    });
    await user.click(increase);
    await user.click(increase);
    expect(
      within(dialog).getByText('Ընտրված է 2 ճաշատեսակ'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Պատրաստ է' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Ճաշատեսակների նախապատվեր')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: CTA_PREORDER }));

    // The hold never carries dishes; checkout sends them with the booking.
    expect(mutateAsync.mock.calls[0][0][0]).not.toHaveProperty(
      'menuSelections',
    );
    expect(mockNavigate.mock.calls[0][1].state.menuPreorder).toEqual({
      lines: [
        expect.objectContaining({
          menuItemId: 101,
          quantity: 2,
          unitPriceAmount: '5500.00',
          lineTotalAmount: '11000.00',
        }),
      ],
      subtotalAmount: '11000.00',
      currency: 'AMD',
    });
  });

  test('pre-order (mobile sheet): the menu is an in-place step and "Back" keeps the form', async () => {
    const user = userEvent.setup();
    renderWidget({ weeklyHours: HOURS, menus: MENUS, presentation: 'sheet' });

    await user.click(
      screen.getByRole('button', { name: 'Ավելացնել՝ Հյուրերի քանակ' }),
    );
    await user.click(
      screen.getByRole('radio', { name: 'Սեղան և ճաշատեսակների նախապատվեր' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Ընտրել ճաշատեսակներ' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const heading = screen.getByRole('heading', {
      name: 'Ճաշատեսակների նախապատվեր',
    });
    expect(heading).toHaveFocus();
    await user.click(
      screen.getByRole('button', { name: `Ավելացնել՝ ${LONG_DISH}` }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Վերադառնալ ամրագրմանը' }),
    );

    expect(screen.getByLabelText('Հյուրերի քանակ')).toHaveValue(2);
    expect(screen.getByRole('button', { name: CTA_PREORDER })).toBeDisabled();
  });

  test('choosing "Table only" again books the table alone', async () => {
    const user = userEvent.setup();
    renderWidget({ weeklyHours: HOURS, menus: MENUS });

    await user.click(
      screen.getByRole('radio', { name: 'Սեղան և ճաշատեսակների նախապատվեր' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Ընտրել ճաշատեսակներ' }),
    );
    await user.click(
      screen.getByRole('button', { name: `Ավելացնել՝ ${LONG_DISH}` }),
    );
    await user.click(screen.getByRole('button', { name: 'Պատրաստ է' }));
    await user.click(screen.getByRole('radio', { name: 'Միայն սեղան' }));

    expect(screen.getByRole('button', { name: CTA_TABLE })).toBeInTheDocument();
  });

  test('no published hours: a free time field instead of an invented schedule', async () => {
    const user = userEvent.setup();
    renderWidget({ weeklyHours: [] });
    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    expect(screen.getByLabelText('Ամրագրման ժամը')).toHaveAttribute(
      'type',
      'time',
    );
  });
});

describe('ListingReservationWidget — restaurant late-night hours (§10)', () => {
  let mutateAsync;

  beforeEach(async () => {
    await i18n.changeLanguage('en');
    mockNavigate.mockReset();
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockReturnValue({
      data: TABLE,
      isPending: false,
      isError: false,
    });
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    mutateAsync = vi.fn().mockResolvedValue({
      data: { items: [{ hold_ids: [9] }], expires_at: '2027-08-01T00:15:00Z' },
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
    });
  });

  // The picker below always chooses Sunday 2027-08-01.
  test("the chosen date offers the previous night's after-midnight tail, then its own hours, and holds on that date", async () => {
    const user = userEvent.setup();
    renderWidget({
      weeklyHours: [
        {
          day_of_week: 6,
          opens_at: '22:00',
          closes_at: '01:00',
          is_closed: false,
        },
        {
          day_of_week: 0,
          opens_at: '12:00',
          closes_at: '13:00',
          is_closed: false,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('combobox', { name: 'Reservation time' }),
    );
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['00:00', '00:30', '12:00', '12:30']);
    await user.click(screen.getByRole('option', { name: '00:30' }));
    await user.click(screen.getByRole('button', { name: 'Reserve a table' }));

    expect(mutateAsync).toHaveBeenCalledWith([
      expect.objectContaining({
        dateFrom: '2027-08-01',
        dateTo: '2027-08-01',
        startTime: '00:30',
      }),
    ]);
  });

  test('a date whose hours run past midnight says where the later times are', async () => {
    const user = userEvent.setup();
    renderWidget({
      weeklyHours: [
        {
          day_of_week: 0,
          opens_at: '20:00',
          closes_at: '02:00',
          is_closed: false,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    expect(
      screen.getByText(
        'Open until 02:00 — times after midnight are on the next date.',
      ),
    ).toBeInTheDocument();
  });

  test('a server refusal outside the hours is announced in words, not as a generic error', async () => {
    mutateAsync.mockRejectedValueOnce(
      Object.assign(new Error('Outside hours'), {
        code: 'VALIDATION_FAILED',
        status: 422,
        details: [
          { field: 'items', issue: 'RESERVATION_OUTSIDE_OPENING_HOURS' },
        ],
      }),
    );
    const user = userEvent.setup();
    renderWidget({
      weeklyHours: [
        {
          day_of_week: 0,
          opens_at: '12:00',
          closes_at: '13:00',
          is_closed: false,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'pick dates' }));
    await user.click(
      screen.getByRole('combobox', { name: 'Reservation time' }),
    );
    await user.click(screen.getByRole('option', { name: '12:30' }));
    await user.click(screen.getByRole('button', { name: 'Reserve a table' }));

    expect(
      await screen.findByText(
        "The restaurant isn't open at that time. Choose one of its reservation times.",
      ),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('ListingReservationWidget — an unknown departure category', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 3, bookable_unit_type: 'TOUR_DEPARTURE', capacity: 5 }],
      isPending: false,
      isError: false,
    });
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('an ATTRACTION departure whose category is not known is never called a tour', () => {
    renderWidget({ listingType: 'ATTRACTION', categorySlug: null });
    expect(
      screen.getByRole('button', { name: 'Request to book' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Book tour' }),
    ).not.toBeInTheDocument();
  });
});

describe('ListingReservationWidget — car rental', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('hy');
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockReturnValue({
      data: CAR,
      isPending: false,
      isError: false,
    });
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  test('W-01: never asks for guests, rooms or nights', async () => {
    const user = userEvent.setup();
    renderWidget({ listingType: 'CAR_RENTAL' });
    await user.click(screen.getByRole('button', { name: 'pick dates' }));

    expect(screen.queryByLabelText('Հյուրեր')).not.toBeInTheDocument();
    expect(screen.queryByText('Գիշերներ')).not.toBeInTheDocument();
    expect(screen.getByText('Վարձակալության օրեր')).toBeInTheDocument();
    expect(screen.getByText('Ստացում')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Վարձակալել մեքենան' }),
    ).toBeInTheDocument();
  });
});

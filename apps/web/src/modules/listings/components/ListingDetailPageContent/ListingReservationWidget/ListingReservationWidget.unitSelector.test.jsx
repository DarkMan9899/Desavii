/**
 * The reservation widget's room/unit selector: each option is the room
 * name followed by separate facts — guests, its price in the canonical
 * money display on the basis being booked (per night, or per hour in
 * hourly mode), and availability ONLY from the server's stay snapshot,
 * never from the unit's inventory size. The closed trigger names the room.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import i18n from 'i18next';
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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

// The calendar grid is covered by DatePicker's own tests — this drives
// only the onChange contract (a stay range).
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

const LONG_HY =
  'Լյուքս համար Արարատի և Մասիսի համայնապատկերով, առանձին պատշգամբով';
const LONG_RU = 'Семейный номер с видом на Арарат и отдельной гостиной зоной';
const ROOMS = [
  {
    id: 1,
    bookable_unit_type: 'HOTEL_ROOM',
    capacity: 6,
    unit_label: LONG_HY,
    max_guests: 2,
    base_price_amount: '24000.00',
    base_price_currency: 'AMD',
    hourly_enabled: false,
  },
  {
    id: 2,
    bookable_unit_type: 'HOTEL_ROOM',
    capacity: 5,
    unit_label: LONG_RU,
    max_guests: 4,
    base_price_amount: '120.00',
    base_price_currency: 'USD',
    hourly_enabled: true,
    hourly_price_amount: '8000.00',
    hourly_price_currency: 'AMD',
    hourly_min_duration_hours: 2,
    hourly_max_duration_hours: 6,
    hourly_available_from: '10:00',
    hourly_available_until: '20:00',
  },
];
// The server's stay snapshot for the picked range: one room nearly gone,
// the other sold out — the only source of per-room availability.
const STAY = [
  {
    ...ROOMS[0],
    availability_status_for_stay: 'LOW',
    remaining_count_for_stay: 2,
  },
  {
    ...ROOMS[1],
    availability_status_for_stay: 'SOLD_OUT',
    remaining_count_for_stay: 0,
  },
];

function RouteScopedWidget({ selectedUnitId = undefined, onSelectUnit }) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <ListingReservationWidget
        listingId={10}
        listingType="HOTEL"
        pricing={{
          amount: '24000.00',
          currency: 'AMD',
          pricing_model: 'PER_NIGHT',
        }}
        selectedUnitId={selectedUnitId}
        onSelectUnit={onSelectUnit}
      />
    </CurrencyProvider>
  );
}
RouteScopedWidget.propTypes = {
  selectedUnitId: PropTypes.number,
  onSelectUnit: PropTypes.func.isRequired,
};

function renderWidget(locale, selectedUnitId = undefined) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/${locale}/listings/10`]}>
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

function roomOption(name) {
  return screen.getByRole('option', { name: new RegExp(`^${name}`) });
}

describe('ListingReservationWidget — room/unit selector', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ isAuthenticated: true });
    useListingBookableUnitsQuery.mockImplementation(
      (_listingId, { checkIn } = {}) => ({
        data: checkIn ? STAY : ROOMS,
        isPending: false,
        isError: false,
      }),
    );
    useListingCalendarQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingHourlyAvailabilityQuery.mockReturnValue({
      data: null,
      isPending: false,
      refetch: vi.fn(),
    });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  afterEach(async () => {
    await i18n.changeLanguage('hy');
  });

  test('HY: a long Armenian name leads its option, followed by guests and the formatted nightly price', async () => {
    const user = userEvent.setup();
    renderWidget('hy');
    await user.click(screen.getByRole('button', { name: 'Միավոր' }));

    const room = roomOption(LONG_HY);
    expect(within(room).getByText(LONG_HY)).toBeInTheDocument();
    expect(within(room).getByText('Ընդունում է 2 հյուր')).toBeInTheDocument();
    expect(within(room).getByText(/24[.,\s]?000/)).toBeInTheDocument();
    expect(within(room).getByText(/Գիշերվա համար/)).toBeInTheDocument();
    expect(within(room).queryByText(/24000\.00/)).not.toBeInTheDocument();
  });

  test('RU: a long Russian name and a non-AMD price keep their own currency and Russian wording', async () => {
    await i18n.changeLanguage('ru');
    const user = userEvent.setup();
    renderWidget('ru');
    await user.click(screen.getByRole('button', { name: 'Единица' }));

    const room = roomOption(LONG_RU);
    expect(within(room).getByText('Вмещает 4')).toBeInTheDocument();
    expect(within(room).getByText(/\$120\.00|120,00\s?\$/)).toBeInTheDocument();
    expect(within(room).getByText(/За ночь/)).toBeInTheDocument();
    expect(within(room).queryByText(/AMD/)).not.toBeInTheDocument();
  });

  test('before any dates no option claims availability — the room count is inventory, not availability', async () => {
    const user = userEvent.setup();
    renderWidget('hy');
    await user.click(screen.getByRole('button', { name: 'Միավոր' }));

    const listbox = screen.getByRole('listbox');
    expect(within(listbox).queryByText(/հասանելի/)).not.toBeInTheDocument();
    expect(within(listbox).queryByText(/Մնացել/)).not.toBeInTheDocument();
    expect(within(listbox).queryByText(/6/)).not.toBeInTheDocument();
  });

  test('after a stay is picked each option shows the server’s availability for it — few left, or sold out', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWidget('en');
    await user.click(screen.getByRole('button', { name: 'pick nights' }));
    await user.click(screen.getByRole('button', { name: 'Unit' }));

    expect(
      within(roomOption(LONG_HY)).getByText('Only 2 left for these dates'),
    ).toBeInTheDocument();
    expect(
      within(roomOption(LONG_RU)).getByText('Sold out for these dates'),
    ).toBeInTheDocument();
  });

  test('the closed trigger names the chosen room only — no guests, price or availability', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWidget('en');
    await user.click(screen.getByRole('button', { name: 'Unit' }));
    await user.click(roomOption(LONG_RU));

    const trigger = screen.getByRole('button', { name: 'Unit' });
    expect(trigger).toHaveTextContent(new RegExp(`^${LONG_RU}$`));
    expect(trigger).not.toHaveTextContent(/Sleeps|night|\$/);
  });

  test('in hourly mode the hourly room is priced per hour, the nightly-only room stays per night', async () => {
    await i18n.changeLanguage('en');
    const user = userEvent.setup();
    renderWidget('en', 2);
    await user.click(screen.getByText('Book by hour', { exact: true }));
    await user.click(screen.getByRole('button', { name: 'Unit' }));

    const hourly = roomOption(LONG_RU);
    expect(within(hourly).getByText(/Per hour/)).toBeInTheDocument();
    expect(within(hourly).queryByText(/Per night/)).not.toBeInTheDocument();
    expect(
      within(roomOption(LONG_HY)).getByText(/Per night/),
    ).toBeInTheDocument();
  });
});

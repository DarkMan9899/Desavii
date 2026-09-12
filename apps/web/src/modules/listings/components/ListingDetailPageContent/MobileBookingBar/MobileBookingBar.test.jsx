import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import MobileBookingBar from './MobileBookingBar.jsx';
import CurrencyProvider from '../../../../../providers/CurrencyProvider.jsx';

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

// This test only needs to prove MobileBookingBar's own contract (bar
// content, opening the drawer, forwarding props) — the reservation
// widget's own booking logic is already covered by
// ListingReservationWidget.test.jsx.
vi.mock('../ListingReservationWidget/ListingReservationWidget.jsx', () => ({
  default: ({ listingId, bookingCtaKey, location }) => (
    <div data-testid="reservation-widget">
      {`widget for listing ${listingId} (${bookingCtaKey})`}
      {location && ` — ${location.city_name}, ${location.country_name}`}
    </div>
  ),
}));

// This project's test setup defaults i18next to Armenian (hy) — mirrors
// the exact locale-string convention every other component test in this
// module already uses, rather than English.
const REQUEST_TO_BOOK = 'Ուղարկել ամրագրման հայտ';
const RESERVE_YOUR_SPOT = 'Ամրագրել ձեր տեղը';
const NO_UNITS_AVAILABLE =
  'Այս հայտարարությունը դեռ հասանելի չէ առցանց ամրագրման համար։';

// Pass 8: `pricing.amount` is always AMD (canonical) — rendered here at
// 'hy' locale (AMD's own default, no FX conversion) so this file's price
// assertions can keep matching the raw fixture number.
const PRICING = { amount: 120, currency: 'AMD', pricing_model: 'PER_NIGHT' };

function RouteScopedBar({
  listingId,
  pricing = null,
  bookingCtaKey,
  location = null,
}) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <MobileBookingBar
        listingId={listingId}
        pricing={pricing}
        bookingCtaKey={bookingCtaKey}
        location={location}
      />
    </CurrencyProvider>
  );
}
RouteScopedBar.propTypes = {
  listingId: PropTypes.number.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- test-only pass-through
  pricing: PropTypes.object,
  bookingCtaKey: PropTypes.string.isRequired,
  // eslint-disable-next-line react/forbid-prop-types -- test-only pass-through
  location: PropTypes.object,
};

function renderBar({ listingId, pricing, bookingCtaKey, location }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/listings/7']}>
        <Routes>
          <Route
            path="/:locale/listings/:id"
            element={
              <RouteScopedBar
                listingId={listingId}
                pricing={pricing}
                bookingCtaKey={bookingCtaKey}
                location={location}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MobileBookingBar', () => {
  test('renders the price and CTA button, with the drawer closed by default', () => {
    renderBar({
      listingId: 7,
      pricing: PRICING,
      bookingCtaKey: 'pages.listingDetail.reservation.requestToBook',
    });
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: REQUEST_TO_BOOK }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('reservation-widget')).not.toBeInTheDocument();
  });

  test('shows a "no units" message instead of a price when pricing is null', () => {
    renderBar({
      listingId: 7,
      pricing: null,
      bookingCtaKey: 'pages.listingDetail.reservation.requestToBook',
    });
    expect(screen.getByText(NO_UNITS_AVAILABLE)).toBeInTheDocument();
  });

  test('tapping the CTA opens the drawer with the reservation widget for this listing', async () => {
    const user = userEvent.setup();
    renderBar({
      listingId: 7,
      pricing: PRICING,
      bookingCtaKey: 'pages.listingDetail.reservation.requestToBook',
    });

    await user.click(screen.getByRole('button', { name: REQUEST_TO_BOOK }));

    expect(screen.getByTestId('reservation-widget')).toHaveTextContent(
      'widget for listing 7',
    );
  });

  test('uses the group-scoped booking CTA copy when a category-specific key is passed', () => {
    renderBar({
      listingId: 7,
      pricing: PRICING,
      bookingCtaKey:
        'pages.listingDetail.reservation.requestToBookByGroup.EXPERIENCE',
    });
    expect(
      screen.getByRole('button', { name: RESERVE_YOUR_SPOT }),
    ).toBeInTheDocument();
  });

  test('Sprint B (Car Rental Pickup/Return Interval): forwards the listing location through to the reservation widget', async () => {
    const user = userEvent.setup();
    renderBar({
      listingId: 7,
      pricing: PRICING,
      bookingCtaKey: 'pages.listingDetail.reservation.requestToBook',
      location: { city_name: 'Yerevan', country_name: 'Armenia' },
    });

    await user.click(screen.getByRole('button', { name: REQUEST_TO_BOOK }));

    expect(screen.getByTestId('reservation-widget')).toHaveTextContent(
      'Yerevan, Armenia',
    );
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ListingCardBase from './ListingCardBase.jsx';
import CurrencyProvider from '../../providers/CurrencyProvider.jsx';

// A non-AMD `priceCurrencyCode` (every test but the dedicated Pass 8 one
// below uses 'USD') never touches `<Money>`/`CurrencyContext` at all — see
// ListingCardBase.jsx's own AMD-only conversion guard — so these existing
// tests need no CurrencyProvider/QueryClientProvider wrapping.
vi.mock('../../api/fx.js', () => ({
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

function renderCard(props = {}) {
  const finalProps = {
    href: '/en/listings/1',
    typeLabel: 'Hotel',
    title: 'Sunset Villa',
    ...props,
  };
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route
          path="/:locale"
          element={
            // eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary ListingCardBase props
            <ListingCardBase {...finalProps} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderCardWithCurrency(props = {}) {
  const finalProps = {
    href: '/en/listings/1',
    typeLabel: 'Hotel',
    title: 'Sunset Villa',
    ...props,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/en']}>
        <Routes>
          <Route
            path="/:locale"
            element={
              <CurrencyProvider locale="en">
                {/* eslint-disable-next-line react/jsx-props-no-spreading -- test helper forwards arbitrary ListingCardBase props */}
                <ListingCardBase {...finalProps} />
              </CurrencyProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ListingCardBase (apps/web/src/components)', () => {
  test('renders the title and links to the given href', () => {
    renderCard();
    expect(
      screen.getByRole('heading', { name: 'Sunset Villa' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Sunset Villa/ })).toHaveAttribute(
      'href',
      '/en/listings/1',
    );
  });

  test('renders a placeholder, not a broken image, with no imageUrl', () => {
    renderCard();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('renders the cover image when imageUrl is present', () => {
    renderCard({ imageUrl: '/cover.jpg', imageAlt: 'Sunset Villa' });
    expect(screen.getByRole('img', { name: 'Sunset Villa' })).toHaveAttribute(
      'src',
      '/cover.jpg',
    );
  });

  test('shows a gallery-count indicator only when there is more than one photo', () => {
    renderCard({ galleryCount: 3 });
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('renders no gallery-count indicator for zero or one photo', () => {
    renderCard({ galleryCount: 1 });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  test('renders a rating only when reviewCount is greater than zero', () => {
    renderCard({ ratingAverage: 4.5, reviewCount: 3 });
    expect(screen.getByRole('img', { name: /4\.5.*3/ })).toBeInTheDocument();
  });

  test('renders no rating when reviewCount is zero', () => {
    renderCard({ reviewCount: 0 });
    expect(
      screen.queryByRole('img', { name: /out of 5/ }),
    ).not.toBeInTheDocument();
  });

  test('renders a price when priceAmount is present', () => {
    renderCard({ priceAmount: '150.00', priceCurrencyCode: 'USD' });
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  test('renders the location node when provided', () => {
    renderCard({ location: <p>Yerevan</p> });
    expect(screen.getByText('Yerevan')).toBeInTheDocument();
  });

  test('renders the type badge by default', () => {
    renderCard();
    expect(screen.getByText('Hotel')).toBeInTheDocument();
  });

  test('hides the type badge when hideTypeBadge is set (e.g. a category page where it is redundant)', () => {
    renderCard({ hideTypeBadge: true });
    expect(screen.queryByText('Hotel')).not.toBeInTheDocument();
  });

  // Pass 7 (category-specific visual identity) — new optional, generic
  // (never category-named) props: the caller resolves category identity,
  // this shared shell only renders it.
  test('renders metaChips when provided, nothing when omitted', () => {
    renderCard({
      metaChips: [
        { key: 'a', label: 'Armenian' },
        { key: 'b', label: '$$' },
      ],
    });
    expect(screen.getByText('Armenian')).toBeInTheDocument();
    expect(screen.getByText('$$')).toBeInTheDocument();
  });

  test('renders no meta-chip list when metaChips is empty (default)', () => {
    renderCard();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  test('renders priceSuffix alongside the price when both are present', () => {
    renderCard({
      priceAmount: '150.00',
      priceCurrencyCode: 'USD',
      priceSuffix: '/ night',
    });
    expect(screen.getByText('/ night')).toBeInTheDocument();
  });

  test('sets data-category on the card root for CSS category hooks', () => {
    renderCard({ categoryVisualKey: 'villas' });
    expect(screen.getByRole('link')).toHaveAttribute('data-category', 'villas');
  });

  describe('Pass 8 (Multi-Currency / CBA FX Pricing)', () => {
    test("an AMD priceCurrencyCode converts through the customer's current currency", async () => {
      renderCardWithCurrency({
        priceAmount: '40000',
        priceCurrencyCode: 'AMD',
      });
      // 'en' locale defaults to USD (currencyPolicy.js); 40000 AMD / 400.00 = $100.00.
      expect(await screen.findByText('$100.00')).toBeInTheDocument();
    });

    test('a non-AMD priceCurrencyCode renders unconverted, as before this pass', () => {
      renderCard({ priceAmount: '150.00', priceCurrencyCode: 'USD' });
      expect(screen.getByText('$150.00')).toBeInTheDocument();
    });
  });
});

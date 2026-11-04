import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeaturedListingCard from './FeaturedListingCard.jsx';
import CurrencyProvider from '../../../../providers/CurrencyProvider.jsx';
import { FEATURED_SOURCES } from '../../utils/selectFeaturedListings.js';

// AMD prices go through `<Money>` (CurrencyContext); the rates request is
// a fixture, as in ListingCardBase's own tests.
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
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => <button type="button">favourite</button>,
  }),
);

const HOTEL = {
  id: 28,
  listing_type: 'HOTEL',
  category_slug: 'hotels',
  slug: 'ararat-view-grand-hotel',
  title: 'Ararat View Grand Hotel',
  city_name: 'Yerevan',
  cover_image_url: '/assets/images/demo/hotels/hotels-1.svg',
  price_amount: '42000.00',
  price_currency_code: 'AMD',
  pricing_model: 'PER_NIGHT',
  review_count: 3,
  rating_average: 4.666,
  star_rating: 4,
};

function renderCard(props) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CurrencyProvider locale="en">
        <MemoryRouter initialEntries={['/en']}>
          <Routes>
            <Route
              path="/:locale"
              element={
                <FeaturedListingCard
                  listing={HOTEL}
                  source={FEATURED_SOURCES.RATED}
                  position={0}
                  // eslint-disable-next-line react/jsx-props-no-spreading -- test harness
                  {...props}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </CurrencyProvider>
    </QueryClientProvider>,
  );
}

describe('FeaturedListingCard (apps/web/src/modules/home)', () => {
  test('is one labelled article whose title links to the listing', () => {
    renderCard();
    const card = screen.getByRole('article', {
      name: 'Ararat View Grand Hotel',
    });
    expect(
      within(card).getByRole('link', { name: 'Ararat View Grand Hotel' }),
    ).toHaveAttribute('href', '/en/listings/ararat-view-grand-hotel');
  });

  test('shows the category, the city, the real rating and at most two facts', () => {
    renderCard();
    const card = screen.getByRole('article');
    // The harness's i18n defaults to Armenian (tests/setup.js).
    expect(within(card).getByText('Yerevan')).toBeInTheDocument();
    expect(within(card).getByText(/4\.7/)).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem').length).toBeLessThanOrEqual(3);
  });

  test('never shows a rating for an unreviewed listing', () => {
    renderCard({
      listing: { ...HOTEL, review_count: 0, rating_average: null },
    });
    expect(screen.queryByText(/4\.7/)).not.toBeInTheDocument();
  });

  test('says the price is on request instead of inventing one', () => {
    renderCard({ listing: { ...HOTEL, price_amount: null } });
    expect(screen.getByText('Գինը՝ ըստ հարցման')).toBeInTheDocument();
  });

  test('falls back to generated art when the image fails', () => {
    const { container } = renderCard();
    fireEvent.error(container.querySelector('img'));
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  test('keeps the favourite button outside the card link', () => {
    renderCard();
    const link = screen.getByRole('link', { name: 'Ararat View Grand Hotel' });
    expect(
      within(link).queryByRole('button', { name: 'favourite' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'favourite' })).toBeVisible();
  });

  test('a promoted card says so to assistive technology', () => {
    renderCard({ source: FEATURED_SOURCES.PROMOTED });
    expect(screen.getByText(/գովազդվող հայտարարություն/)).toBeInTheDocument();
  });
});

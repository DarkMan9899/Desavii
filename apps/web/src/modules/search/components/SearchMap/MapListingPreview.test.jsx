import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CurrencyContext from '../../../../contexts/CurrencyContext.jsx';
import MapListingPreview from './MapListingPreview.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search;
const CURRENCY = { currency: 'AMD', rates: { AMD: '1.00000000' } };

const HOTEL = {
  id: 7,
  slug: 'grand-hotel',
  title: 'Grand Hotel',
  listing_type: 'HOTEL',
  category_slug: 'hotels',
  city_name: 'Երևան',
  latitude: 40.18,
  longitude: 44.51,
  location_precision: 'exact',
  cover_image_url: '/assets/images/demo/hotels/hotels-1.svg',
  price_amount: '30000.00',
  pricing_model: 'PER_NIGHT',
  rating_average: 4.5,
  review_count: 12,
  star_rating: '4',
};

function renderPreview(listing, entry = '/hy/search') {
  return render(
    <CurrencyContext.Provider value={CURRENCY}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/:locale/search"
            element={<MapListingPreview listing={listing} headingId="h" />}
          />
        </Routes>
      </MemoryRouter>
    </CurrencyContext.Provider>,
  );
}

describe('MapListingPreview (apps/web/src/modules/search)', () => {
  test('summarises the listing from its marker data', () => {
    renderPreview(HOTEL);
    const preview = screen.getByRole('article', { name: 'Grand Hotel' });
    expect(
      within(preview).getByText(hy.listings.type.HOTEL),
    ).toBeInTheDocument();
    expect(within(preview).getByText('Երևան')).toBeInTheDocument();
    expect(within(preview).getByText(T.card.fromPrice)).toBeInTheDocument();
    expect(
      within(preview).getByText(T.card.priceUnit.perNight),
    ).toBeInTheDocument();
    expect(within(preview).getByRole('listitem')).toHaveTextContent(
      T.card.starRating.replace('{{count}}', '4'),
    );
  });

  test('"Learn more" opens the listing with the search\'s booking context only', () => {
    renderPreview(
      HOTEL,
      '/hy/search?view=map&categoryId=1&bbox=44.4,40.1,44.6,40.25&dateFrom=2026-11-01&dateTo=2026-11-03&guests=2',
    );
    expect(
      screen.getByRole('link', { name: T.map.preview.learnMore }),
    ).toHaveAttribute(
      'href',
      '/hy/listings/grand-hotel?dateFrom=2026-11-01&dateTo=2026-11-03&guests=2',
    );
  });

  test('never invents facts, a rating or a price the listing does not have', () => {
    renderPreview({
      ...HOTEL,
      star_rating: null,
      review_count: 0,
      rating_average: null,
      price_amount: null,
      cover_image_url: null,
    });
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(T.card.fromPrice)).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: T.map.preview.learnMore }),
    ).toBeInTheDocument();
  });

  test('a private stay says its location is approximate', () => {
    renderPreview({
      ...HOTEL,
      listing_type: 'PROPERTY',
      category_slug: 'apartments',
      location_precision: 'approximate',
      star_rating: null,
      bedrooms: 2,
    });
    expect(screen.getByText(T.map.preview.approximate)).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent(
      T.card.bedroomsCount.replace('{{count}}', '2'),
    );
  });
});

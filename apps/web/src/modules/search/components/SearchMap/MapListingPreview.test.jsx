import { describe, test, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CurrencyContext from '../../../../contexts/CurrencyContext.jsx';
import MapListingPreview from './MapListingPreview.jsx';
import hy from '../../../../../public/locales/hy/common.json';

// The test harness's i18n instance defaults to Armenian (tests/setup.js).
const T = hy.search;
const CARD = hy.listingCard;
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
  price_currency_code: 'AMD',
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
  test('is the shared card, summarising the listing from its marker data', () => {
    renderPreview(HOTEL);
    const preview = screen.getByRole('article', { name: 'Grand Hotel' });
    expect(within(preview).getByText(CARD.category.hotels)).toBeInTheDocument();
    expect(within(preview).getByText('Երևան')).toBeInTheDocument();
    expect(within(preview).getByText(CARD.price.from)).toBeInTheDocument();
    expect(
      within(preview).getByText(T.card.priceUnit.perNight),
    ).toBeInTheDocument();
    expect(within(preview).getByText('4.5')).toBeInTheDocument();
    const facts = within(preview).getAllByRole('listitem');
    expect(facts[0]).toHaveTextContent(
      T.card.starRating.replace('{{count}}', '4'),
    );
    // 4.5 from 12 approved reviews meets the objective rule.
    expect(within(preview).getByText(CARD.badge.topRated)).toBeInTheDocument();
  });

  test('its title is the focus target the preview names it by', () => {
    renderPreview(HOTEL);
    const heading = screen.getByRole('heading', { name: 'Grand Hotel' });
    expect(heading).toHaveAttribute('id', 'h');
    expect(heading).toHaveAttribute('tabindex', '-1');
    // The action is spelled out: one link, and the title is not it.
    expect(screen.getAllByRole('link')).toHaveLength(1);
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
    expect(screen.getByText(CARD.reviews.none)).toBeInTheDocument();
    expect(screen.queryByText(CARD.price.from)).not.toBeInTheDocument();
    expect(screen.getByText(CARD.price.unlisted)).toBeInTheDocument();
    expect(screen.queryByText(CARD.badge.topRated)).not.toBeInTheDocument();
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
    expect(screen.getByText(CARD.category.apartments)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(
      T.card.bedroomsCount_other.replace('{{count}}', '2'),
    );
  });
});

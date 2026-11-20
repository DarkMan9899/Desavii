import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import SearchResultCard from './SearchResultCard.jsx';
import CurrencyProvider from '../../../../providers/CurrencyProvider.jsx';

// FavoriteButton has its own dedicated test file — a plain button stub
// here keeps this file focused on the card and avoids needing an
// AuthProvider, while still proving the button never nests in the card's
// link. `QueryClientProvider` is still needed: an AMD price renders through
// `<Money>`, which reads `CurrencyContext`'s FX-rates query.
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    // eslint-disable-next-line react/jsx-no-literals -- test stub
    default: () => <button type="button">favourite</button>,
  }),
);
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

const RESULT = {
  id: 7,
  listing_type: 'HOTEL',
  title: 'Yerevan Grand Hotel',
  summary: 'A central hotel with mountain views.',
  city_name: 'Yerevan',
  cover_image_url: 'https://example.test/cover.jpg',
  media_count: 1,
  price_amount: null,
  price_currency_code: null,
};

function LocaleScopedCard({ result, highlight = undefined }) {
  const { locale } = useParams();
  return (
    <CurrencyProvider locale={locale}>
      <SearchResultCard result={result} highlight={highlight} />
    </CurrencyProvider>
  );
}
LocaleScopedCard.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- test-only pass-through
  result: PropTypes.object.isRequired,
  highlight: PropTypes.string,
};

function renderCard(
  result = RESULT,
  initialEntry = '/en',
  highlight = undefined,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/:locale"
            element={<LocaleScopedCard result={result} highlight={highlight} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SearchResultCard (apps/web/src/modules/search)', () => {
  test('links to the listing detail route', () => {
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/en/listings/7');
  });

  test('renders the card fields from the search DTO — not the long summary', () => {
    renderCard();
    expect(
      screen.getByRole('heading', { name: 'Yerevan Grand Hotel' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Yerevan')).toBeInTheDocument();
    expect(
      screen.queryByText('A central hotel with mountain views.'),
    ).not.toBeInTheDocument();
  });

  test('is one article named by its title, with one link and the favourite outside it', () => {
    renderCard();
    const card = screen.getByRole('article', { name: 'Yerevan Grand Hotel' });
    const link = screen.getByRole('link');
    expect(link).toHaveAccessibleName('Yerevan Grand Hotel');
    expect(card).toContainElement(link);
    const favourite = screen.getByRole('button', { name: 'favourite' });
    expect(link).not.toContainElement(favourite);
    expect(card).toContainElement(favourite);
  });

  test('says "price not listed" rather than leaving the price empty', () => {
    renderCard(RESULT);
    expect(screen.getByText('Գինը նշված չէ')).toBeInTheDocument();
  });

  test('falls back to a placeholder when there is no cover image', () => {
    renderCard({ ...RESULT, cover_image_url: null });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  test('omits the location line when city_name is absent', () => {
    renderCard({ ...RESULT, city_name: null });
    expect(screen.queryByText('Yerevan')).not.toBeInTheDocument();
  });

  test('shows a gallery-count indicator only when media_count is more than one', () => {
    renderCard({ ...RESULT, media_count: 4 });
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  test('renders no gallery-count indicator for zero or one photo', () => {
    renderCard({ ...RESULT, media_count: 1 });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  test('renders a price when price_amount is present (Phase 10: real listing_pricing join)', () => {
    renderCard({
      ...RESULT,
      price_amount: '99.00',
      price_currency_code: 'USD',
    });
    expect(screen.getByText(/99/)).toBeInTheDocument();
  });

  test('renders no price when price_amount is null (never fabricated)', () => {
    renderCard(RESULT);
    expect(screen.queryByText(/^[\d$֏₽]/)).not.toBeInTheDocument();
  });

  test('a real price is labeled "From" (P2.2D: search price is a per-listing minimum, never an exact promise)', () => {
    renderCard({
      ...RESULT,
      price_amount: '99.00',
      price_currency_code: 'USD',
    });
    expect(screen.getByText('Սկսած')).toBeInTheDocument();
  });

  // P2.2D: search -> listing detail context handoff — the reservation
  // widget reads these exact same query keys to prefill its own state.
  test('carries dateFrom/dateTo/guests from the current search URL into the listing detail link', () => {
    renderCard(
      RESULT,
      '/en?dateFrom=2026-09-10&dateTo=2026-09-12&guests=3&sort=newest',
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/en/listings/7?dateFrom=2026-09-10&dateTo=2026-09-12&guests=3',
    );
  });

  test('omits the query string entirely when the current search has no dates/guests', () => {
    renderCard(RESULT, '/en?sort=newest');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/en/listings/7');
  });

  test('renders the localized type badge by default', () => {
    renderCard();
    expect(screen.getByText('Հյուրանոց')).toBeInTheDocument();
  });

  describe('badges (one at most, each with a real source)', () => {
    test('a TOP placement is badged TOP and says it is promoted', () => {
      renderCard(RESULT, '/en', 'top');
      expect(screen.getByText('ԹՈՓ')).toBeInTheDocument();
      expect(screen.getByText(/գովազդվող հայտարարություն/)).toBeInTheDocument();
    });

    test('an organic card is never badged TOP', () => {
      renderCard();
      expect(screen.queryByText('ԹՈՓ')).not.toBeInTheDocument();
    });

    test('"Top guest rating" follows the objective rule, on any surface', () => {
      renderCard({ ...RESULT, rating_average: 4.8, review_count: 5 });
      expect(screen.getByText('Հյուրերի բարձր գնահատական')).toBeInTheDocument();
      // The Armenian harness writes the decimal with a comma.
      expect(screen.getByText('4,8')).toBeInTheDocument();
      expect(screen.getByText('5 կարծիք')).toBeInTheDocument();
    });

    test('one or two perfect reviews do not earn it', () => {
      renderCard({ ...RESULT, rating_average: 5, review_count: 2 });
      expect(
        screen.queryByText('Հյուրերի բարձր գնահատական'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('5,0')).toBeInTheDocument();
      expect(screen.getByText('2 կարծիք')).toBeInTheDocument();
    });

    test('TOP wins over the rating badge', () => {
      renderCard(
        { ...RESULT, rating_average: 4.9, review_count: 9 },
        '/en',
        'top',
      );
      expect(screen.getByText('ԹՈՓ')).toBeInTheDocument();
      expect(
        screen.queryByText('Հյուրերի բարձր գնահատական'),
      ).not.toBeInTheDocument();
    });

    test('the featured fill is "New"', () => {
      renderCard(RESULT, '/en', 'new');
      expect(screen.getByText('Նորույթ')).toBeInTheDocument();
    });
  });

  test('without approved reviews it says so, never a 0.0 rating', () => {
    renderCard({ ...RESULT, rating_average: null, review_count: 0 });
    expect(screen.getByText('Կարծիքներ դեռ չկան')).toBeInTheDocument();
    expect(screen.queryByText(/\d կարծիք/)).not.toBeInTheDocument();
  });

  test('a long, script-shaped title renders as text, never as markup', () => {
    const title = `<img src=x onerror="window.cardXssProbe=1">${'Ա'.repeat(300)}`;
    const { container } = renderCard({ ...RESULT, title });
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(window.cardXssProbe).toBeUndefined();
  });

  test('an unsafe image URL is never rendered — the generated art stands in', () => {
    const { container } = renderCard({
      ...RESULT,
      // eslint-disable-next-line no-script-url -- the hostile input under test
      cover_image_url: 'javascript:alert(1)',
    });
    expect(container.querySelector('img[src^="javascript"]')).toBeNull();
  });

  // Pass 7 (category-specific visual identity, brief §15's acceptance
  // test: badge hidden, category must still be recognizable). Restaurant
  // is the one category with real card metadata today (cuisine/price
  // tier, the deferred item from the previous pass) — these assertions
  // exercise the new `category_slug`/`cuisine`/`price_tier` search DTO
  // fields end to end, not just the SQL layer already covered by
  // `mysqlSearchRepository.buildQuery.test.js`/the new backend
  // integration test.
  // Step L6.2H2B: a restaurant's price is average spend per person.
  test('a Restaurant result shows its cuisines, and its price as an average per person', () => {
    renderCard({
      ...RESULT,
      listing_type: 'RESTAURANT',
      category_slug: 'restaurants',
      cuisine: ['ARMENIAN', 'GEORGIAN'],
      price_tier: '$$',
      price_amount: '5000.00',
      price_currency_code: 'AMD',
    });
    // Test i18n defaults to 'hy' (tests/setup.js) — Armenian option
    // labels, matching this file's existing 'Հյուրանոց'/'Սկսած' convention.
    // The cuisines read as one fact; the price tier is not a card fact
    // (the average spend already says it).
    expect(screen.getByText('Հայկական, Վրացական')).toBeInTheDocument();
    expect(screen.queryByText('$$')).not.toBeInTheDocument();
    expect(screen.getByText('Միջինը')).toBeInTheDocument();
    expect(screen.getByText('/ անձի համար')).toBeInTheDocument();
    expect(screen.queryByText('Սկսած')).not.toBeInTheDocument();
  });

  test('a Hotel result shows no cuisine/price-tier chips and a per-night price suffix (never fabricated for other categories)', () => {
    renderCard({
      ...RESULT,
      category_slug: 'hotels',
      cuisine: null,
      price_tier: null,
      price_amount: '99.00',
      price_currency_code: 'USD',
    });
    expect(screen.queryByText('Հայկական')).not.toBeInTheDocument();
    expect(screen.getByText('/ գիշեր')).toBeInTheDocument();
  });

  test('renders no price-unit suffix when category_slug is absent (unresolved category, never guessed)', () => {
    renderCard({
      ...RESULT,
      category_slug: undefined,
      price_amount: '99.00',
      price_currency_code: 'USD',
    });
    expect(screen.queryByText('/ գիշեր')).not.toBeInTheDocument();
  });

  // Owner-directed premium card redesign — one real headline metadata
  // chip per remaining category, from mysqlSearchRepository.js's new
  // CARD_METADATA_SELECT fields.
  describe('headline metadata chips (real data only, never fabricated)', () => {
    test('a Hotel with a real star_rating shows a star-rating chip', () => {
      renderCard({ ...RESULT, category_slug: 'hotels', star_rating: '4' });
      expect(screen.getByText('4 աստղ')).toBeInTheDocument();
    });

    test('a Hotel with no star_rating shows no chip (never fabricated)', () => {
      renderCard({ ...RESULT, category_slug: 'hotels', star_rating: null });
      expect(screen.queryByText(/աստղ/)).not.toBeInTheDocument();
    });

    test('an Apartment/Villa/Guest House with real bedrooms shows a bedrooms chip', () => {
      renderCard({
        ...RESULT,
        category_slug: 'apartments',
        bedrooms: 3,
      });
      expect(screen.getByText('3 ննջասենյակ')).toBeInTheDocument();
    });

    test('a Tour/Attraction/Entertainment listing with real duration shows a duration chip in minutes', () => {
      renderCard({
        ...RESULT,
        category_slug: 'tours',
        duration_minutes: 45,
      });
      expect(screen.getByText('45 րոպե')).toBeInTheDocument();
    });

    test('an exact-hour duration renders in hours, not minutes', () => {
      renderCard({
        ...RESULT,
        category_slug: 'attractions',
        duration_minutes: 120,
      });
      expect(screen.getByText('2 ժամ')).toBeInTheDocument();
    });

    test('a Car Rental with a real transmission shows a transmission chip', () => {
      renderCard({
        ...RESULT,
        category_slug: 'car-rentals',
        transmission: 'AUTOMATIC',
      });
      expect(screen.getByText('Ավտոմատ')).toBeInTheDocument();
    });

    test("a Restaurant never shows a headline chip from another category's fields", () => {
      renderCard({
        ...RESULT,
        category_slug: 'restaurants',
        bedrooms: 3,
        star_rating: '5',
        transmission: 'MANUAL',
        duration_minutes: 90,
      });
      expect(screen.queryByText(/ննջասենյակ/)).not.toBeInTheDocument();
      expect(screen.queryByText(/աստղ/)).not.toBeInTheDocument();
      expect(screen.queryByText('Մեխանիկական')).not.toBeInTheDocument();
      expect(screen.queryByText(/ժամ|րոպե/)).not.toBeInTheDocument();
    });
  });
});

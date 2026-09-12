import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import SearchResultCard from './SearchResultCard.jsx';

// FavoriteButton has its own dedicated test file — a trivial stub here
// keeps this file focused on SearchResultCard's own rendering and avoids
// needing an AuthProvider/QueryClientProvider just to satisfy
// FavoriteButton's internal hooks.
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => null,
  }),
);

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

function renderCard(
  result = RESULT,
  initialEntry = '/en',
  hideTypeBadge = false,
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/:locale"
          element={
            <SearchResultCard result={result} hideTypeBadge={hideTypeBadge} />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SearchResultCard (apps/web/src/modules/search)', () => {
  test('links to the listing detail route', () => {
    renderCard();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/en/listings/7');
  });

  test('renders the fields the search DTO actually returns', () => {
    renderCard();
    expect(
      screen.getByRole('heading', { name: 'Yerevan Grand Hotel' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Yerevan')).toBeInTheDocument();
    expect(
      screen.getByText('A central hotel with mountain views.'),
    ).toBeInTheDocument();
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

  test('hides the type badge when hideTypeBadge is set (e.g. a category page where it is redundant)', () => {
    renderCard(RESULT, '/en', true);
    expect(screen.queryByText('Հյուրանոց')).not.toBeInTheDocument();
  });

  // Pass 7 (category-specific visual identity, brief §15's acceptance
  // test: badge hidden, category must still be recognizable). Restaurant
  // is the one category with real card metadata today (cuisine/price
  // tier, the deferred item from the previous pass) — these assertions
  // exercise the new `category_slug`/`cuisine`/`price_tier` search DTO
  // fields end to end, not just the SQL layer already covered by
  // `mysqlSearchRepository.buildQuery.test.js`/the new backend
  // integration test.
  test('a Restaurant result shows cuisine and price-tier chips, and a per-person price suffix', () => {
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
    expect(screen.getByText('Հայկական')).toBeInTheDocument();
    expect(screen.getByText('Վրացական')).toBeInTheDocument();
    expect(screen.getByText('$$')).toBeInTheDocument();
    expect(screen.getByText('/ անձի համար')).toBeInTheDocument();
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
});

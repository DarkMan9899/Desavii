import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FavoritesPageContent from './FavoritesPageContent.jsx';
import { listFavorites } from '../../../../api/favorites.js';

vi.mock('../../../../api/favorites.js', () => ({
  listFavorites: vi.fn(),
}));
vi.mock('../FavoriteButton/FavoriteButton.jsx', () => ({
  default: () => null,
}));

const FAVORITE_ROW = {
  favorite_id: 1,
  favorited_at: '2026-07-01T00:00:00.000Z',
  listing_id: 5,
  listing_type: 'HOTEL',
  status: 'PUBLISHED',
  slug: 'sunset-villa',
  title: 'Sunset Villa',
  city_name: 'Yerevan',
  cover_image_url: null,
  price_amount: '150.00',
  price_currency_code: 'USD',
  rating_average: 4.5,
  review_count: 3,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy']}>
        <Routes>
          <Route path="/:locale" element={<FavoritesPageContent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FavoritesPageContent (apps/web/src/modules/favorites)', () => {
  beforeEach(() => {
    listFavorites.mockReset();
  });

  test('renders a card per favorited listing', async () => {
    listFavorites.mockResolvedValue({
      data: [FAVORITE_ROW],
      meta: { has_more: false },
    });
    renderPage();
    expect(await screen.findByText('Sunset Villa')).toBeInTheDocument();
  });

  test('shows an empty state when there are no favorites yet', async () => {
    listFavorites.mockResolvedValue({ data: [], meta: { has_more: false } });
    renderPage();
    expect(await screen.findByText('Ընտրյալներ դեռ չկան')).toBeInTheDocument();
  });

  test('shows a retryable error state when the request fails', async () => {
    listFavorites.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(
      await screen.findByText('Չհաջողվեց բեռնել Ձեր ընտրյալները։'),
    ).toBeInTheDocument();
  });

  // Card-composition-closure fix (cross-category audit) — Favorites now
  // reuses the exact same `buildCategoryCardMeta` helper `SearchResultCard`
  // does, so a favorited listing carries the real `data-category`
  // attribute (activating its own category's `ListingCardBase.module.scss`
  // design) and category-appropriate price unit/metadata, never a
  // Favorites-specific 10th visual system.
  describe('category context (card-composition-closure fix)', () => {
    test('a favorited Hotel receives the hotel category visual key and per-night price unit', async () => {
      listFavorites.mockResolvedValue({
        data: [
          {
            ...FAVORITE_ROW,
            category_slug: 'hotels',
            price_amount: '99.00',
            price_currency_code: 'USD',
          },
        ],
        meta: { has_more: false },
      });
      const { container } = renderPage();
      await screen.findByText('Sunset Villa');
      expect(
        container.querySelector('[data-category="hotels"]'),
      ).toBeInTheDocument();
      expect(screen.getByText('/ գիշեր')).toBeInTheDocument();
    });

    test('a favorited Car Rental receives the car-rentals category visual key, a transmission chip, and a per-day price unit', async () => {
      listFavorites.mockResolvedValue({
        data: [
          {
            ...FAVORITE_ROW,
            listing_type: 'CAR_RENTAL',
            category_slug: 'car-rentals',
            transmission: 'AUTOMATIC',
            price_amount: '30.00',
            price_currency_code: 'USD',
          },
        ],
        meta: { has_more: false },
      });
      const { container } = renderPage();
      await screen.findByText('Sunset Villa');
      expect(
        container.querySelector('[data-category="car-rentals"]'),
      ).toBeInTheDocument();
      expect(screen.getByText('Ավտոմատ')).toBeInTheDocument();
      expect(screen.getByText('/ օր')).toBeInTheDocument();
    });

    test('renders the real city as a location line when present', async () => {
      listFavorites.mockResolvedValue({
        data: [{ ...FAVORITE_ROW, category_slug: 'hotels' }],
        meta: { has_more: false },
      });
      renderPage();
      // 'Yerevan' also appears as the group heading above the card — the
      // location line is a second, real occurrence of the same city text.
      expect((await screen.findAllByText('Yerevan')).length).toBeGreaterThan(1);
    });

    test('a Car Rental with no real transmission shows no chip (missing metadata degrades cleanly, never fabricated)', async () => {
      listFavorites.mockResolvedValue({
        data: [
          {
            ...FAVORITE_ROW,
            listing_type: 'CAR_RENTAL',
            category_slug: 'car-rentals',
            transmission: null,
          },
        ],
        meta: { has_more: false },
      });
      const { container } = renderPage();
      await screen.findByText('Sunset Villa');
      expect(
        container.querySelector('[data-category="car-rentals"]'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Ավտոմատ')).not.toBeInTheDocument();
      expect(screen.queryByText('Մեխանիկական')).not.toBeInTheDocument();
    });

    test('a favorite with no category_slug falls back to the coarser listing_type and shows no price-unit suffix (never guessed)', async () => {
      listFavorites.mockResolvedValue({
        data: [{ ...FAVORITE_ROW, category_slug: undefined }],
        meta: { has_more: false },
      });
      const { container } = renderPage();
      await screen.findByText('Sunset Villa');
      expect(
        container.querySelector('[data-category="hotel"]'),
      ).toBeInTheDocument();
      expect(screen.queryByText('/ գիշեր')).not.toBeInTheDocument();
    });
  });
});

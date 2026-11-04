import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeaturedListings from './FeaturedListings.jsx';
import { usePublicHomeFeaturedQuery } from '../../../advertising/index.js';
import { useSearchListingsQuery } from '../../../search/index.js';
import { FEATURED_RAIL_SIZE } from '../../utils/selectFeaturedListings.js';
import {
  resetQueueForTests,
  peekQueueForTests,
} from '../../../../analytics/analyticsQueue.js';
import { resetDedupForTests } from '../../../../analytics/analyticsClient.js';
import { resetInMemoryIdentityForTests } from '../../../../analytics/analyticsIdentity.js';

// Only the two data-fetching hooks are mocked (FRONTEND_ARCHITECTURE.md
// §14 is a React Query concern) — the rail, its selection and its cards
// render for real.
vi.mock('../../../advertising/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, usePublicHomeFeaturedQuery: vi.fn() };
});
vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useSearchListingsQuery: vi.fn() };
});
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => null,
  }),
);

const LISTING = {
  id: 1,
  listing_type: 'HOTEL',
  slug: 'yerevan-grand-hotel',
  title: 'Yerevan Grand Hotel',
  city_name: 'Yerevan',
  review_count: 0,
  rating_average: null,
};
const listing = (id, title, extra = {}) => ({
  ...LISTING,
  id,
  slug: `listing-${id}`,
  title,
  ...extra,
});

function mockPromotions(state) {
  usePublicHomeFeaturedQuery.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    ...state,
  });
}
function mockFill(results, state = {}) {
  useSearchListingsQuery.mockReturnValue({
    data: results ? { pages: [{ results }] } : undefined,
    isPending: false,
    ...state,
  });
}

// The cards link to `/:locale/listings/:slug` via useParams.
function renderFeaturedListings() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<FeaturedListings />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cardTitles = () =>
  screen
    .getAllByRole('article')
    .map((card) => within(card).getByRole('heading', { level: 3 }).textContent);

describe('FeaturedListings (apps/web/src/modules/home) — featured rail', () => {
  beforeEach(() => {
    mockPromotions({});
    mockFill([]);
  });

  test('holds the rail with placeholders while the promotions load', () => {
    mockPromotions({ isPending: true });
    renderFeaturedListings();
    expect(screen.getByRole('region', { busy: true })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  test('keeps the placeholders while the fill request loads', () => {
    mockPromotions({ data: [LISTING] });
    mockFill(undefined, { isPending: true });
    renderFeaturedListings();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  test('a full set of promotions needs no fill request', () => {
    const promoted = Array.from({ length: FEATURED_RAIL_SIZE }, (_, i) =>
      listing(i + 1, `Promoted ${i + 1}`),
    );
    mockPromotions({ data: promoted });
    renderFeaturedListings();
    expect(useSearchListingsQuery).toHaveBeenLastCalledWith(
      { sort: 'rating_desc' },
      { locale: 'en', enabled: false },
    );
    expect(screen.getAllByRole('article')).toHaveLength(FEATURED_RAIL_SIZE);
  });

  test('tops one promotion up with real top-rated and newest listings, each once and labelled', () => {
    mockPromotions({ data: [LISTING] });
    mockFill([
      listing(28, 'Ararat View Grand Hotel', {
        review_count: 3,
        rating_average: 4.7,
      }),
      listing(1, 'Yerevan Grand Hotel'),
      listing(45, 'Gyumri Ceramics Workshop', { listing_type: 'ATTRACTION' }),
      listing(44, 'Nova Laser Tag Arena', { listing_type: 'ATTRACTION' }),
      listing(39, 'Aragats Summit Hike', { listing_type: 'TOUR' }),
    ]);
    renderFeaturedListings();

    expect(useSearchListingsQuery).toHaveBeenLastCalledWith(
      { sort: 'rating_desc' },
      { locale: 'en', enabled: true },
    );
    expect(cardTitles()).toEqual([
      'Yerevan Grand Hotel',
      'Ararat View Grand Hotel',
      'Gyumri Ceramics Workshop',
      'Aragats Summit Hike',
    ]);
    const [top, rated, newest] = screen.getAllByRole('article');
    expect(top).toHaveAttribute('data-source', 'promoted');
    expect(rated).toHaveAttribute('data-source', 'rated');
    expect(newest).toHaveAttribute('data-source', 'newest');
    // The test harness's i18n instance defaults to Armenian (tests/setup.js).
    expect(within(top).getByText('ԹՈՓ')).toBeInTheDocument();
    expect(
      within(rated).getByText('Հյուրերի բարձր գնահատական'),
    ).toBeInTheDocument();
    expect(within(newest).getByText('Նորույթ')).toBeInTheDocument();
    // Only paid placements carry the TOP badge.
    expect(screen.getAllByText('ԹՈՓ')).toHaveLength(1);
  });

  test('a single real promotion with nothing else stays a single card — never repeated', () => {
    mockPromotions({ data: [LISTING] });
    renderFeaturedListings();
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(cardTitles()).toEqual(['Yerevan Grand Hotel']);
  });

  test('each card links to its listing page', () => {
    mockPromotions({ data: [LISTING] });
    renderFeaturedListings();
    expect(
      screen.getByRole('link', { name: 'Yerevan Grand Hotel' }),
    ).toHaveAttribute('href', '/en/listings/yerevan-grand-hotel');
  });

  test('shows real listings without a TOP badge when the promotions fail', () => {
    mockPromotions({ isError: true });
    mockFill([listing(39, 'Aragats Summit Hike', { listing_type: 'TOUR' })]);
    renderFeaturedListings();
    expect(cardTitles()).toEqual(['Aragats Summit Hike']);
    expect(screen.queryByText('ԹՈՓ')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('renders an error alert only when nothing can be shown', () => {
    mockPromotions({ isError: true });
    renderFeaturedListings();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('renders an empty state when there is nothing at all — never fake content', () => {
    renderFeaturedListings();
    expect(
      screen.getByRole('heading', { name: 'Հայտարարություններ դեռ չկան' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  test('renders a "view all" link to the search route', () => {
    renderFeaturedListings();
    expect(screen.getByRole('link', { name: 'Տեսնել բոլորը' })).toHaveAttribute(
      'href',
      '/en/search',
    );
  });

  // Step A3.1 (Engagement Analytics): the real `promotion_id` reaches the
  // click tracking — and a filler card, which is no promotion, never
  // reports one.
  describe('promotion analytics wiring', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ANALYTICS_COLLECTION_ENABLED', 'true');
      window.localStorage.clear();
      window.sessionStorage.clear();
      resetInMemoryIdentityForTests();
      resetQueueForTests();
      resetDedupForTests();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      resetQueueForTests();
    });

    test('clicking a promoted card fires promotion_clicked with the real promotion_id', () => {
      mockPromotions({ data: [{ ...LISTING, promotion_id: 42 }] });
      renderFeaturedListings();

      fireEvent.click(
        screen.getByRole('link', { name: 'Yerevan Grand Hotel' }),
      );

      const click = peekQueueForTests().find(
        (event) => event.eventName === 'promotion_clicked',
      );
      expect(click).toMatchObject({
        promotionId: 42,
        listingId: 1,
        placement: 'home_featured',
      });
    });

    test('clicking a filler card reports no promotion', () => {
      mockFill([listing(39, 'Aragats Summit Hike', { listing_type: 'TOUR' })]);
      renderFeaturedListings();

      fireEvent.click(
        screen.getByRole('link', { name: 'Aragats Summit Hike' }),
      );

      expect(
        peekQueueForTests().some(
          (event) => event.eventName === 'promotion_clicked',
        ),
      ).toBe(false);
    });
  });
});

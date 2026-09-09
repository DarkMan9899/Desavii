import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeaturedListings from './FeaturedListings.jsx';
import { usePublicHomeFeaturedQuery } from '../../../advertising/index.js';

// Only the data-fetching hook is mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern) — `SearchResultCard` renders for real, so this also
// exercises the actual cross-module `search`/`advertising` public-export
// wiring (§6.3).
vi.mock('../../../advertising/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, usePublicHomeFeaturedQuery: vi.fn() };
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
};

// SearchResultCard links to `/:locale/listings/:id` via useParams, so any
// state that renders it needs a matching route, same as SearchResultCard's
// own test.
function renderFeaturedListings() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<FeaturedListings />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FeaturedListings (apps/web/src/modules/home) — Sprint E Promotion Engine', () => {
  test('renders a skeleton while pending', () => {
    usePublicHomeFeaturedQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    renderFeaturedListings();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  test('renders an error alert on failure', () => {
    usePublicHomeFeaturedQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    renderFeaturedListings();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('renders an empty state when there is no active Home promotion — never fake TOP content', () => {
    usePublicHomeFeaturedQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderFeaturedListings();
    // The test harness's i18n instance defaults to Armenian (tests/setup.js)
    // — this asserts against the real translation content, not English.
    expect(
      screen.getByRole('heading', { name: 'Հայտարարություններ դեռ չկան' }),
    ).toBeInTheDocument();
  });

  test('renders a SearchResultCard with the TOP badge per promoted listing, linked to its detail route', () => {
    usePublicHomeFeaturedQuery.mockReturnValue({
      data: [LISTING],
      isPending: false,
      isError: false,
    });
    renderFeaturedListings();
    expect(
      screen.getByRole('heading', { name: 'Yerevan Grand Hotel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Yerevan Grand Hotel/ }),
    ).toHaveAttribute('href', '/en/listings/yerevan-grand-hotel');
  });

  test('renders a "view all" link to the search route regardless of query state', () => {
    usePublicHomeFeaturedQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderFeaturedListings();
    // The test harness's i18n instance defaults to Armenian (tests/setup.js).
    expect(screen.getByRole('link', { name: 'Տեսնել բոլորը' })).toHaveAttribute(
      'href',
      '/en/search',
    );
  });
});

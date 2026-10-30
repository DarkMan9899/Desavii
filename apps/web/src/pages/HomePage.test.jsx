import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import {
  useCategoriesQuery,
  useDestinationsQuery,
  useSearchListingsQuery,
} from '../modules/search/index.js';
import { usePublicHomeFeaturedQuery } from '../modules/advertising/index.js';
import { usePublicPostsQuery } from '../modules/blog/index.js';

// Only the data-fetching hooks are mocked, same as
// FeaturedListings.test.jsx/Categories.test.jsx/FeaturedDestinations.test.jsx
// — every section renders for real, so this exercises the actual
// composition `pages/HomePage.jsx` wires together.
vi.mock('../modules/search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCategoriesQuery: vi.fn(),
    useDestinationsQuery: vi.fn(),
    useSearchListingsQuery: vi.fn(),
    useSearchFilterDefinitionsQuery: () => ({ data: [] }),
  };
});

// Home AI discovery: Ask Desavii's availability check and parse call (AI
// off here), and the visitor (a guest).
vi.mock('../modules/ai/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAiSearchAvailabilityQuery: () => ({ isPending: false, data: false }),
  useParseSearchQueryMutation: () => ({ mutate: () => {}, reset: () => {} }),
}));
vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

// Sprint E: FeaturedListings now sources its cards from the Promotion
// Engine's public Home-featured endpoint rather than a plain listings
// search, same as every other data-fetching hook above.
vi.mock('../modules/advertising/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usePublicHomeFeaturedQuery: vi.fn(),
  };
});

// Sprint K: EditorialHighlights (real published Blog posts).
vi.mock('../modules/blog/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usePublicPostsQuery: vi.fn(),
  };
});

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<HomePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('HomePage (apps/web/src/pages)', () => {
  test('renders the hero and every homepage section', () => {
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
    });
    useCategoriesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    useDestinationsQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    usePublicHomeFeaturedQuery.mockReturnValue({ data: [], isPending: false });
    usePublicPostsQuery.mockReturnValue({
      data: { data: [{ id: 1, slug: 'a-post', title: 'A post', excerpt: '' }] },
      isPending: false,
      isError: false,
    });

    renderHomePage();

    // Hero
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // One labeled section per homepage section (destinations, featured
    // listings, experiences, categories, why-desavii, editorial
    // highlights, partner CTA).
    expect(
      screen.getAllByRole('heading', { level: 2 }).length,
    ).toBeGreaterThanOrEqual(7);
    // The Search page's own fields mount as part of the page; jsdom renders
    // the phone layout, where one button opens them in a sheet (covered by
    // HomeSearch.test.jsx).
    expect(
      screen.getByRole('button', { name: /Ո՞ւր եք գնում Հայաստանում/ }),
    ).toHaveAttribute('aria-haspopup', 'dialog');
  });
});

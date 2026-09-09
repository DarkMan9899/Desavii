import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage.jsx';
import {
  useCategoriesQuery,
  useDestinationsQuery,
  useSuggestionsQuery,
  useSearchListingsQuery,
} from '../modules/search/index.js';
import { usePublicHomeFeaturedQuery } from '../modules/advertising/index.js';

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
    useSuggestionsQuery: vi.fn(),
    useSearchListingsQuery: vi.fn(),
  };
});

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
    useSuggestionsQuery.mockReturnValue({ data: [], isPending: false });
    usePublicHomeFeaturedQuery.mockReturnValue({ data: [], isPending: false });

    renderHomePage();

    // Hero
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // One labeled section per homepage section (destinations, featured
    // listings, experiences, categories, why-desavii, partner CTA,
    // testimonials).
    expect(
      screen.getAllByRole('heading', { level: 2 }).length,
    ).toBeGreaterThanOrEqual(7);
    // The search widget mounts without crashing — its fields only mount
    // once its compact trigger is activated (SearchWidget.jsx), covered
    // by SearchWidget.test.jsx itself; this just confirms the collapsed
    // dock is present as part of the real page composition.
    expect(
      screen.getByRole('button', {
        name: /Where are you going|Ո՞ւր եք գնում|Куда вы едете/,
      }),
    ).toBeInTheDocument();
  });
});

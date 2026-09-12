/**
 * 2026 SEO/performance audit — canonical query-string normalization,
 * verified at the REAL page level (real `useSeo()` execution, real
 * `<link rel="canonical">` DOM output), not only against `urls.js`'s own
 * unit tests. Every current page builds its canonical `path` from a
 * slug/id rather than `location.search`, so these tests exist primarily
 * to prove that invariant holds even when the visited URL carries dirty
 * query params (sort/utm/tracking/pagination noise) — a future page that
 * ever DOES interpolate `location.search` into its canonical path is
 * still protected, since `buildLocaleUrl()` itself (the one place every
 * canonical/hreflang URL is assembled) strips non-canonical noise.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CategoryPageContent from '../modules/discovery/components/CategoryPageContent/CategoryPageContent.jsx';
import SearchPageContent from '../modules/search/components/SearchPageContent/SearchPageContent.jsx';
import {
  useCategoriesQuery,
  useSearchListingsQuery,
} from '../modules/search/index.js';
import { useSearchFilters } from '../modules/search/hooks/useSearchFilters.js';
import { usePublicCategoryTopQuery } from '../modules/advertising/index.js';
import { getSiteOrigin } from './seoConfig.js';

vi.mock('../modules/search/index.js', () => ({
  useCategoriesQuery: vi.fn(),
  useSearchListingsQuery: vi.fn(),
  // eslint-disable-next-line react/prop-types -- trivial test double
  SearchResultCard: ({ result }) => <div>{result.title}</div>,
  // Pass 6 (owner issue #13/#15): a trivial test double — this file only
  // exercises canonical-URL output, never DynamicFilterPanel's own
  // filtering behavior (covered by its own dedicated test files).
  DynamicFilterPanel: () => null,
}));

// Sprint E: CategoryPageContent now also queries the Promotion Engine's
// public Category-TOP endpoint alongside the normal search-results query
// mocked above.
vi.mock('../modules/advertising/index.js', () => ({
  usePublicCategoryTopQuery: vi.fn(),
}));

vi.mock('../modules/search/hooks/useSearchFilters.js', () => ({
  useSearchFilters: vi.fn(),
}));
vi.mock('../modules/search/queries/useSearchListingsQuery.js', () => ({
  useSearchListingsQuery: vi.fn(() => ({
    data: { pages: [{ results: [] }] },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));
vi.mock('../modules/search/queries/useCategoriesQuery.js', () => ({
  useCategoriesQuery: vi.fn(() => ({ data: [], isPending: false })),
}));
vi.mock('../modules/search/queries/useSearchFilterDefinitionsQuery.js', () => ({
  useSearchFilterDefinitionsQuery: vi.fn(() => ({
    data: undefined,
    isPending: false,
  })),
}));
vi.mock('../modules/ai/mutations/useParseSearchQueryMutation.js', () => ({
  useParseSearchQueryMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

const CATEGORY = {
  id: 5,
  slug: 'car-rentals',
  name: 'Car Rentals',
  listing_count: 9,
};

function canonicalHref() {
  return document.querySelector('link[rel="canonical"]')?.getAttribute('href');
}

describe('Real page-level canonical output stays clean under dirty query strings', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReset();
    useSearchListingsQuery.mockReset();
    useSearchFilters.mockReset();
    usePublicCategoryTopQuery.mockReset();
    usePublicCategoryTopQuery.mockReturnValue({ data: [], isPending: false });
  });

  test('Category page: canonical ignores sort/utm/tracking noise on the visited URL', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/en/categories/car-rentals?sort=price&utm_source=newsletter&fbclid=abc123&cursor=xyz',
        ]}
      >
        <Routes>
          <Route
            path="/:locale/categories/:categorySlug"
            element={<CategoryPageContent />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Car Rentals',
    );
    expect(canonicalHref()).toBe(
      `${getSiteOrigin()}/en/categories/car-rentals`,
    );
  });

  test('Search page: stays noindex with a fixed, query-free canonical regardless of active filters', () => {
    useSearchFilters.mockReturnValue({
      filters: {
        destination: 'Yerevan',
        categoryId: undefined,
        sort: 'newest',
        dynamicFilters: {},
      },
      updateFilters: vi.fn(),
      updateDynamicFilter: vi.fn(),
      clearFilters: vi.fn(),
      hasActiveFilters: true,
    });

    render(
      <MemoryRouter
        initialEntries={[
          '/en/search?keyword=yerevan&sort=price&ref=homepage&gclid=xyz',
        ]}
      >
        <Routes>
          <Route path="/:locale/search" element={<SearchPageContent />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(canonicalHref()).toBe(`${getSiteOrigin()}/en/search`);
    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    ).toBe('noindex, follow');
  });
});

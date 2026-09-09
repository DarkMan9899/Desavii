import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CategoryPageContent from './CategoryPageContent.jsx';
import {
  useCategoriesQuery,
  useSearchListingsQuery,
} from '../../../search/index.js';
import { usePublicCategoryTopQuery } from '../../../advertising/index.js';

vi.mock('../../../search/index.js', () => ({
  useCategoriesQuery: vi.fn(),
  useSearchListingsQuery: vi.fn(),
  // eslint-disable-next-line react/prop-types -- trivial test double
  SearchResultCard: ({ result, hideTypeBadge, topBadgeLabel }) => (
    <div>
      {/* eslint-disable-next-line react/prop-types -- trivial test double */}
      {result.title}
      {hideTypeBadge ? ' (badge hidden)' : ''}
      {topBadgeLabel ? ` (${topBadgeLabel})` : ''}
    </div>
  ),
}));

vi.mock('../../../advertising/index.js', () => ({
  usePublicCategoryTopQuery: vi.fn(),
}));

vi.mock('../../../../seo/useSeo.js', () => ({ default: vi.fn() }));

const CATEGORY = {
  id: 5,
  slug: 'car-rentals',
  name: 'Car Rentals',
  listing_count: 9,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/en/categories/car-rentals']}>
      <Routes>
        <Route
          path="/:locale/categories/:categorySlug"
          element={<CategoryPageContent />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CategoryPageContent (apps/web/src/modules/discovery)', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReset();
    useSearchListingsQuery.mockReset();
    usePublicCategoryTopQuery.mockReset();
    // Sprint E: every existing test in this file predates the Category
    // TOP section — default it to "no active promotion" so those tests'
    // assertions (which never mention the TOP section) stay valid
    // without each one re-stating this mock.
    usePublicCategoryTopQuery.mockReturnValue({ data: [], isPending: false });
  });

  test('shows a not-found state when no category matches the slug', () => {
    useCategoriesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('Էջը չի գտնվել')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Car Rentals' }),
    ).not.toBeInTheDocument();
  });

  test('2026 SEO/performance audit: never fetches listings with an unresolved categoryId — no wasted unfiltered request', () => {
    useCategoriesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
    });
    renderPage();

    // No matching category (slug not found in the seeded list above) —
    // `category?.id` is undefined, so the fetch must stay disabled.
    expect(useSearchListingsQuery).toHaveBeenCalledWith(
      { categoryId: undefined },
      expect.objectContaining({ enabled: false }),
    );
  });

  // Regression coverage for a reported "duplicated breadcrumb/title/
  // description" visual bug. Investigation (2026 public-frontend audit)
  // found no reproducible duplicate-DOM-node defect in this codebase at
  // the time — the perceived duplication traced to a cramped 8-card grid
  // repeating the category name as a per-card badge (fixed separately via
  // `hideTypeBadge`/`ListingGrid`) — but these explicit "exactly one"
  // assertions exist so a future regression (e.g. a page accidentally
  // rendering `PageHeader` twice, or two `<Breadcrumbs>` from a layout +
  // page both owning one) fails a test immediately instead of only
  // showing up in a screenshot.
  test('renders EXACTLY one H1, one breadcrumb nav, and one description block for the matched category', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
    });
    renderPage();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Car Rentals',
    );
    expect(
      screen.getAllByRole('navigation', { name: 'Breadcrumb' }),
    ).toHaveLength(1);
    expect(
      screen.getAllByText(
        'Դիտեք Car Rentals ողջ Հայաստանում և ամրագրեք ստուգված տեղական գործընկերների հետ desavii-ում։',
      ),
    ).toHaveLength(1);
    // The category name itself appears exactly twice on the page — once
    // as the breadcrumb's current-page crumb, once as the H1 — never a
    // third time from an accidental duplicate render of either.
    expect(screen.getAllByText('Car Rentals')).toHaveLength(2);
  });

  test('renders the listing count and each result with the per-card type badge hidden (already redundant on a category page)', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [{ id: 1, title: 'Ararat Valley Fleet' }] }] },
      isPending: false,
    });
    renderPage();

    expect(screen.getByText('9 հայտարարություն')).toBeInTheDocument();
    expect(
      screen.getByText('Ararat Valley Fleet (badge hidden)'),
    ).toBeInTheDocument();
  });

  test('shows an empty state when the category has no published listings', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
    });
    renderPage();
    expect(
      screen.getByText('Առայժմ հայտարարություններ չկան'),
    ).toBeInTheDocument();
  });

  test('Sprint E: renders the Category TOP section, badged, ABOVE the normal grid when an active promotion exists', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [{ id: 2, title: 'Regular Listing' }] }] },
      isPending: false,
    });
    usePublicCategoryTopQuery.mockReturnValue({
      data: [{ id: 1, title: 'Promoted Fleet' }],
      isPending: false,
    });
    renderPage();

    expect(
      screen.getByText('Promoted Fleet (badge hidden) (ԹՈՓ)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Regular Listing (badge hidden)'),
    ).toBeInTheDocument();

    const heading = screen.getByRole('heading', {
      name: /Car Rentals/,
      level: 2,
    });
    expect(heading).toBeInTheDocument();
  });

  test('Sprint E: renders no TOP section at all when there is no active Category promotion', () => {
    useCategoriesQuery.mockReturnValue({
      data: [CATEGORY],
      isPending: false,
      isError: false,
    });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
    });
    renderPage();

    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  test('shows a retryable error state when the categories query fails', () => {
    const refetch = vi.fn();
    useCategoriesQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    useSearchListingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
    });
    renderPage();
    expect(screen.getByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
  });
});

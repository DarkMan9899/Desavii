import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Categories, { orderForDisplay } from './Categories.jsx';
import { useCategoriesQuery } from '../../../search/index.js';

// Only the data-fetching hook is mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern) — CategoryCard renders for real, so this also
// exercises the real cross-module `search` public-export wiring (§6.3).
vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useCategoriesQuery: vi.fn() };
});

const CATEGORIES = [
  { id: 1, slug: 'hotels', name: 'Hotels', listing_count: 4 },
  { id: 2, slug: 'tours', name: 'Tours', listing_count: 0 },
];

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<Categories />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Categories (apps/web/src/modules/home)', () => {
  test('renders skeleton placeholders while pending', () => {
    useCategoriesQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    renderSection();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('renders a retryable error state on failure', () => {
    const refetch = vi.fn();
    useCategoriesQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    renderSection();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('renders an empty state when there are no categories', () => {
    useCategoriesQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('renders one tile per real category, linked by slug', () => {
    useCategoriesQuery.mockReturnValue({
      data: CATEGORIES,
      isPending: false,
      isError: false,
    });
    renderSection();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(CATEGORIES.length);
    expect(links[0]).toHaveAttribute('href', '/en/categories/hotels');
    expect(screen.getByText('Hotels')).toBeInTheDocument();
  });

  test('the largest category leads, the rest keep the catalog order', () => {
    const ordered = orderForDisplay([
      { id: 1, slug: 'hotels', listing_count: 4 },
      { id: 2, slug: 'tours', listing_count: 9 },
      { id: 3, slug: 'villas', listing_count: 9 },
      { id: 4, slug: 'restaurants' },
    ]);
    expect(ordered.map((category) => category.id)).toEqual([2, 1, 3, 4]);
    expect(orderForDisplay([])).toEqual([]);
  });
});

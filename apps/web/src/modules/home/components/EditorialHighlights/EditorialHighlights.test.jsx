import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EditorialHighlights from './EditorialHighlights.jsx';
import { usePublicPostsQuery } from '../../../blog/index.js';

// Only the data-fetching hook is mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern), same convention as every other Home section's own
// test (FeaturedListings.test.jsx, PopularExperiences.test.jsx, ...).
vi.mock('../../../blog/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, usePublicPostsQuery: vi.fn() };
});

const POST = {
  id: 1,
  slug: 'dilijan-weekend-guide',
  title: 'A weekend guide to Dilijan',
  excerpt: 'Forest trails, lake views, and where to eat.',
  cover: null,
};

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<EditorialHighlights />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EditorialHighlights (apps/web/src/modules/home)', () => {
  test('renders a skeleton while pending', () => {
    usePublicPostsQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    renderSection();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  test('renders nothing when the request fails, instead of a broken-looking error state', () => {
    usePublicPostsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when there are no published posts yet', () => {
    usePublicPostsQuery.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
    });
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  test('renders one card per real published post, linking to the public Blog article', () => {
    usePublicPostsQuery.mockReturnValue({
      data: { data: [POST] },
      isPending: false,
      isError: false,
    });
    renderSection();
    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'A weekend guide to Dilijan',
    });
    expect(heading).toBeInTheDocument();
    expect(heading.closest('a')).toHaveAttribute(
      'href',
      '/en/blog/dilijan-weekend-guide',
    );
  });

  test('renders a "view all" link to the public Blog index', () => {
    usePublicPostsQuery.mockReturnValue({
      data: { data: [POST] },
      isPending: false,
      isError: false,
    });
    renderSection();
    // The test harness's i18n instance defaults to Armenian (tests/setup.js).
    expect(screen.getByRole('link', { name: 'Այցելել բլոգ' })).toHaveAttribute(
      'href',
      '/en/blog',
    );
  });
});

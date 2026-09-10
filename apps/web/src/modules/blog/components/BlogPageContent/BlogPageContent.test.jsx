import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BlogPageContent from './BlogPageContent.jsx';
import {
  listPublicPosts,
  listPublicCategories,
  listPublicTags,
} from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({
  listPublicPosts: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/blog']}>
        <Routes>
          <Route path="/:locale/blog" element={<BlogPageContent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const POST = {
  id: 1,
  slug: 'exploring-yerevan',
  title: 'Exploring Yerevan',
  excerpt: 'A short guide.',
  author: 'Ani Sargsyan',
  category_slug: 'experiences',
  published_at: '2026-09-01T00:00:00.000Z',
  cover: null,
  tags: [],
};

describe('BlogPageContent (Sprint H)', () => {
  beforeEach(() => {
    listPublicCategories.mockResolvedValue({
      success: true,
      data: [{ id: 1, slug: 'experiences', name: 'Experiences' }],
    });
    listPublicTags.mockResolvedValue({ success: true, data: [] });
  });

  test('renders an H1 and a real article card once posts load', async () => {
    listPublicPosts.mockResolvedValue({
      success: true,
      data: [POST],
      meta: { total: 1 },
    });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Exploring Yerevan')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Exploring Yerevan/ }),
    ).toHaveAttribute('href', '/hy/blog/exploring-yerevan');
  });

  test('shows the empty state when there are no published posts', async () => {
    listPublicPosts.mockResolvedValue({
      success: true,
      data: [],
      meta: { total: 0 },
    });
    renderPage();
    expect(await screen.findByText('Դեռ հոդվածներ չկան')).toBeInTheDocument();
  });

  test('shows a retryable error state when the request fails', async () => {
    listPublicPosts.mockRejectedValue(new Error('network error'));
    renderPage();
    expect(await screen.findByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
  });
});

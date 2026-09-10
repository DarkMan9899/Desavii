import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BlogPostPreviewContent from './BlogPostPreviewContent.jsx';
import { getAdminPostDetail } from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({
  getAdminPostDetail: vi.fn(),
}));

const DRAFT_POST = {
  id: 9,
  slug: 'draft-slug',
  status: 'DRAFT',
  category_slug: 'experiences',
  author: 'Ani Sargsyan',
  published_at: null,
  translations: [
    {
      language_code: 'hy',
      title: 'Դեռ չհրապարակված հոդված',
      excerpt: 'Ամփոփում',
      body: '# Վերնագիր\n\nՀիմնական տեքստ։',
      seo_title: '',
      seo_description: '',
    },
  ],
  tags: [{ id: 1, slug: 'yerevan', name: 'Yerevan' }],
  cover: null,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/admin/blog/9/preview']}>
        <Routes>
          <Route
            path="/:locale/admin/blog/:id/preview"
            element={<BlogPostPreviewContent basePath="/admin/blog" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BlogPostPreviewContent (Sprint H)', () => {
  test('renders a draft post via the authenticated admin endpoint, with a not-public notice', async () => {
    getAdminPostDetail.mockResolvedValue({ success: true, data: DRAFT_POST });
    renderPage();
    expect(
      await screen.findByText('Դեռ չհրապարակված հոդված'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Նախադիտում — այս էջը հրապարակայնորեն տեսանելի չէ։'),
    ).toBeInTheDocument();
    expect(screen.getByText('Yerevan')).toBeInTheDocument();
  });

  test('sets a noindex robots tag', async () => {
    getAdminPostDetail.mockResolvedValue({ success: true, data: DRAFT_POST });
    renderPage();
    await screen.findByText('Դեռ չհրապարակված հոդված');
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  test('renders a 404 empty state for a genuine not-found error', async () => {
    getAdminPostDetail.mockRejectedValue({ status: 404 });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Էջը չի գտնվել' }),
    ).toBeInTheDocument();
  });
});

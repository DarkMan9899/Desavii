import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BlogPostPageContent from './BlogPostPageContent.jsx';
import { getPublicPost } from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({ getPublicPost: vi.fn() }));

function renderPage(slug = 'exploring-yerevan') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/hy/blog/${slug}`]}>
        <Routes>
          <Route path="/:locale/blog/:slug" element={<BlogPostPageContent />} />
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
  body: '# Vernissage\n\nA real article body with **formatting**.',
  author: 'Ani Sargsyan',
  category_slug: 'experiences',
  published_at: '2026-09-01T00:00:00.000Z',
  seo_title: null,
  seo_description: null,
  cover: null,
  tags: [{ id: 1, slug: 'yerevan', name: 'Yerevan' }],
  related: [],
};

describe('BlogPostPageContent (Sprint H)', () => {
  test('renders the article title, author, and Markdown body once it loads', async () => {
    getPublicPost.mockResolvedValue({ success: true, data: POST });
    renderPage();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Exploring Yerevan',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ani Sargsyan/)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Vernissage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('formatting').tagName).toBe('STRONG');
    expect(screen.getByText('Yerevan')).toBeInTheDocument();
  });

  test('never renders a raw <script> tag embedded in the article body', async () => {
    getPublicPost.mockResolvedValue({
      success: true,
      data: {
        ...POST,
        body: 'Safe text.\n\n<script>window.xssTriggered = true;</script>',
      },
    });
    renderPage();
    await screen.findByText('Safe text.');
    const scripts = [...document.querySelectorAll('script')];
    expect(
      scripts.some((script) => script.textContent.includes('xssTriggered')),
    ).toBe(false);
    expect(window.xssTriggered).toBeUndefined();
  });

  test('shows a real 404 state for a draft/unpublished slug — never leaks its content', async () => {
    const error = new Error('Not found');
    error.status = 404;
    getPublicPost.mockRejectedValue(error);
    renderPage('some-draft');
    expect(await screen.findByText('Էջը չի գտնվել')).toBeInTheDocument();
  });
});

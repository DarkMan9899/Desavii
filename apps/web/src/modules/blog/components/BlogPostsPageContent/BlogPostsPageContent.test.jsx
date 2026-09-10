import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import BlogPostsPageContent from './BlogPostsPageContent.jsx';
import { getAdminPosts, createDraft } from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({
  getAdminPosts: vi.fn(),
  createDraft: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const POST = {
  id: 1,
  slug: 'exploring-yerevan',
  status: 'DRAFT',
  author: 'Ani Sargsyan',
  category_slug: 'experiences',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/admin/blog']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/admin/blog"
              element={
                <BlogPostsPageContent
                  basePath="/admin/blog"
                  heading="Blog Posts"
                  description="Manage blog posts"
                />
              }
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BlogPostsPageContent (Sprint H)', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  test('renders posts returned by the admin query', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [POST] });
    renderPage();
    expect(await screen.findByText('exploring-yerevan')).toBeInTheDocument();
    expect(screen.getByText('Ani Sargsyan')).toBeInTheDocument();
  });

  test('shows the empty state when there are no posts', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [] });
    renderPage();
    expect(await screen.findByText('Դեռ գրառումներ չկան')).toBeInTheDocument();
  });

  test('shows a retryable error state when the request fails', async () => {
    getAdminPosts.mockRejectedValue(new Error('network error'));
    renderPage();
    expect(await screen.findByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
  });

  test('creating a draft calls createDraft and navigates to its editor', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [] });
    createDraft.mockResolvedValue({
      success: true,
      data: { id: 42, slug: 'new-post' },
    });
    renderPage();
    await screen.findByText('Դեռ գրառումներ չկան');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Նոր գրառում' }));
    await user.type(screen.getByLabelText(/Վերնագիր/), 'New Post');
    const buttons = screen.getAllByRole('button', { name: 'Նոր գրառում' });
    await user.click(buttons[buttons.length - 1]);

    await vi.waitFor(() =>
      expect(createDraft).toHaveBeenCalledWith({
        title: 'New Post',
        languageCode: 'hy',
      }),
    );
    await vi.waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/hy/admin/blog/42'),
    );
  });
});

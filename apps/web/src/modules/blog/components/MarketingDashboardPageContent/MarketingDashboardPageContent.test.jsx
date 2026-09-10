import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MarketingDashboardPageContent from './MarketingDashboardPageContent.jsx';
import { getAdminPosts } from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({ getAdminPosts: vi.fn() }));

const POSTS = [
  {
    id: 1,
    slug: 'draft-post',
    status: 'DRAFT',
    author: 'Ani',
    updated_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 2,
    slug: 'scheduled-post',
    status: 'SCHEDULED',
    author: 'Ani',
    updated_at: '2026-09-02T00:00:00.000Z',
  },
  {
    id: 3,
    slug: 'published-post',
    status: 'PUBLISHED',
    author: 'Ani',
    updated_at: '2026-09-03T00:00:00.000Z',
  },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/marketing']}>
        <Routes>
          <Route
            path="/:locale/marketing"
            element={<MarketingDashboardPageContent />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MarketingDashboardPageContent (Sprint H)', () => {
  test('computes real draft/scheduled/published counts from the admin posts list', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: POSTS });
    renderPage();
    expect(await screen.findByText('published-post')).toBeInTheDocument();
    const statValues = screen.getAllByText('1');
    expect(statValues.length).toBeGreaterThanOrEqual(3);
  });

  test('shows a retryable error state when the request fails', async () => {
    getAdminPosts.mockRejectedValue(new Error('network error'));
    renderPage();
    expect(await screen.findByText('Ինչ-որ բան սխալ գնաց')).toBeInTheDocument();
  });
});

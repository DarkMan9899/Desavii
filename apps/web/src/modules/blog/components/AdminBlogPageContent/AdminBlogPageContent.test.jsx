import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import AdminBlogPageContent from './AdminBlogPageContent.jsx';
import {
  getAdminPosts,
  promoteToMarketing,
  demoteFromMarketing,
} from '../../../../api/blog.js';

vi.mock('../../../../api/blog.js', () => ({
  getAdminPosts: vi.fn(),
  createDraft: vi.fn(),
  promoteToMarketing: vi.fn(),
  demoteFromMarketing: vi.fn(),
}));

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
              element={<AdminBlogPageContent />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminBlogPageContent (Sprint H)', () => {
  test('renders the shared blog posts list and the marketing-role card', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [] });
    renderPage();
    expect(await screen.findByText('Դեռ գրառումներ չկան')).toBeInTheDocument();
    expect(screen.getByText('Մարքեթինգի դեր')).toBeInTheDocument();
  });

  test('granting the Marketing role calls promoteToMarketing with the entered user id', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [] });
    promoteToMarketing.mockResolvedValue({ success: true, data: {} });
    renderPage();
    await screen.findByText('Դեռ գրառումներ չկան');

    fireEvent.change(screen.getByLabelText('Օգտատիրոջ ID'), {
      target: { value: '9' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Տրամադրել Մարքեթինգի դեր' }),
    );

    await waitFor(() => expect(promoteToMarketing).toHaveBeenCalledWith(9));
  });

  test('revoking the Marketing role calls demoteFromMarketing with the entered user id', async () => {
    getAdminPosts.mockResolvedValue({ success: true, data: [] });
    demoteFromMarketing.mockResolvedValue({ success: true, data: {} });
    renderPage();
    await screen.findByText('Դեռ գրառումներ չկան');

    fireEvent.change(screen.getByLabelText('Օգտատիրոջ ID'), {
      target: { value: '9' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Հետ վերցնել Մարքեթինգի դերը' }),
    );

    await waitFor(() => expect(demoteFromMarketing).toHaveBeenCalledWith(9));
  });
});

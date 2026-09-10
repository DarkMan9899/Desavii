import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import BlogPostEditorContent from './BlogPostEditorContent.jsx';
import {
  getAdminPostDetail,
  updatePostSettings,
  upsertPostTranslation,
  publishPost,
  listPublicCategories,
  listPublicTags,
} from '../../../../api/blog.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';

vi.mock('../../../../api/blog.js', () => ({
  getAdminPostDetail: vi.fn(),
  updatePostSettings: vi.fn(),
  upsertPostTranslation: vi.fn(),
  attachCoverImage: vi.fn(),
  removeCoverImage: vi.fn(),
  publishPost: vi.fn(),
  unpublishPost: vi.fn(),
  schedulePost: vi.fn(),
  unschedulePost: vi.fn(),
  listPublicCategories: vi.fn(),
  listPublicTags: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const POST_DETAIL = {
  id: 7,
  slug: 'exploring-yerevan',
  status: 'DRAFT',
  category_id: 1,
  category_slug: 'experiences',
  author: 'Ani Sargsyan',
  published_at: null,
  scheduled_at: null,
  translations: [
    {
      language_code: 'hy',
      title: 'Երևանի ուսումնասիրություն',
      excerpt: 'Համառոտ ամփոփում։',
      body: 'Բովանդակություն։',
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
      <MemoryRouter initialEntries={['/hy/admin/blog/7']}>
        <ToastProvider>
          <Routes>
            <Route
              path="/:locale/admin/blog/:id"
              element={<BlogPostEditorContent basePath="/admin/blog" />}
            />
          </Routes>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BlogPostEditorContent (Sprint H)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listPublicCategories.mockResolvedValue({
      success: true,
      data: [{ id: 1, slug: 'experiences', name: 'Experiences' }],
    });
    listPublicTags.mockResolvedValue({
      success: true,
      data: [{ id: 1, slug: 'yerevan', name: 'Yerevan' }],
    });
    getAdminPostDetail.mockResolvedValue({ success: true, data: POST_DETAIL });
    useAuth.mockReturnValue({ permissions: ['blog.manage', 'blog.publish'] });
  });

  test('renders settings and the HY translation for the loaded post', async () => {
    renderPage();
    expect(
      await screen.findByDisplayValue('exploring-yerevan'),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Երևանի ուսումնասիրություն'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'HY', selected: true }),
    ).toBeInTheDocument();
  });

  test('a locale with no saved translation is marked missing on its tab', async () => {
    renderPage();
    await screen.findByDisplayValue('exploring-yerevan');
    expect(
      screen.getByRole('tab', { name: /EN.*դեռ չգրված/ }),
    ).toBeInTheDocument();
  });

  test('saving settings calls updatePostSettings with the current slug/category/tags', async () => {
    updatePostSettings.mockResolvedValue({ success: true, data: POST_DETAIL });
    renderPage();
    await screen.findByDisplayValue('exploring-yerevan');

    const user = userEvent.setup();
    const saveButtons = screen.getAllByRole('button', { name: 'Պահպանել' });
    await user.click(saveButtons[0]);

    await vi.waitFor(() =>
      expect(updatePostSettings).toHaveBeenCalledWith(7, {
        slug: 'exploring-yerevan',
        categorySlug: 'experiences',
        tagNames: ['Yerevan'],
      }),
    );
  });

  test('editing the HY body and saving calls upsertPostTranslation for "hy"', async () => {
    upsertPostTranslation.mockResolvedValue({ success: true, data: [] });
    renderPage();
    await screen.findByDisplayValue('exploring-yerevan');

    const user = userEvent.setup();
    const excerptField = screen.getByDisplayValue('Համառոտ ամփոփում։');
    await user.clear(excerptField);
    await user.type(excerptField, 'Նոր ամփոփում');

    const saveButtons = screen.getAllByRole('button', { name: 'Պահպանել' });
    await user.click(saveButtons[saveButtons.length - 1]);

    await vi.waitFor(() =>
      expect(upsertPostTranslation).toHaveBeenCalledWith(7, 'hy', {
        title: 'Երևանի ուսումնասիրություն',
        excerpt: 'Նոր ամփոփում',
        body: 'Բովանդակություն։',
        seoTitle: '',
        seoDescription: '',
      }),
    );
  });

  test('publish action calls publishPost for a draft post', async () => {
    publishPost.mockResolvedValue({
      success: true,
      data: { ...POST_DETAIL, status: 'PUBLISHED' },
    });
    renderPage();
    await screen.findByDisplayValue('exploring-yerevan');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Հրապարակել' }));

    await vi.waitFor(() => expect(publishPost).toHaveBeenCalledWith(7));
  });

  test('a user without blog.publish sees no publish/schedule controls', async () => {
    useAuth.mockReturnValue({ permissions: ['blog.manage'] });
    renderPage();
    await screen.findByDisplayValue('exploring-yerevan');
    expect(
      screen.queryByRole('button', { name: 'Հրապարակել' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Պլանավորել' }),
    ).not.toBeInTheDocument();
  });

  test('renders a 404 empty state for a genuine not-found error', async () => {
    getAdminPostDetail.mockRejectedValue({ status: 404 });
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Էջը չի գտնվել' }),
    ).toBeInTheDocument();
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BecomePartnerPageContent from './BecomePartnerPageContent.jsx';
import { getCmsPage } from '../../../../api/cms.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';

vi.mock('../../../../api/cms.js', () => ({ getCmsPage: vi.fn() }));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const SIGNED_OUT = { isAuthenticated: false, partnerships: [] };

function Where() {
  const { pathname } = useLocation();
  const where = `at ${pathname}`;
  return <p>{where}</p>;
}

function renderPage(locale = 'hy') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/${locale}/become-a-partner`]}>
        <Routes>
          <Route
            path="/:locale/become-a-partner"
            element={<BecomePartnerPageContent />}
          />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BecomePartnerPageContent (apps/web/src/modules/cms)', () => {
  beforeEach(() => {
    getCmsPage.mockReset();
    getCmsPage.mockRejectedValue(new Error('Not Found'));
    useAuth.mockReturnValue(SIGNED_OUT);
  });

  test('renders the page heading, three benefits, and a single CTA button', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  test('renders the CMS-authored title once the page is published', async () => {
    getCmsPage.mockResolvedValue({
      success: true,
      data: { title: 'CMS Partner Title', content: 'CMS Partner Lead' },
    });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'CMS Partner Title' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('CMS Partner Lead')).toBeInTheDocument();
  });

  test.each([
    ['a visitor', SIGNED_OUT, 'hy', '/hy/partner/register'],
    [
      'a signed-in customer (existing account, no second one)',
      { isAuthenticated: true, partnerships: [] },
      'ru',
      '/ru/partner/apply',
    ],
    [
      'a signed-in partner member',
      { isAuthenticated: true, partnerships: [{ partner_id: 1 }] },
      'en',
      '/en/partner',
    ],
  ])(
    'Start takes %s straight into partner onboarding, in the same language',
    async (_who, auth, locale, expected) => {
      useAuth.mockReturnValue(auth);
      const user = userEvent.setup();
      renderPage(locale);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText(`at ${expected}`)).toBeInTheDocument();
    },
  );
});

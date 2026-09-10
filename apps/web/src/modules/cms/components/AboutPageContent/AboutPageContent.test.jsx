import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AboutPageContent from './AboutPageContent.jsx';
import { getCmsPage } from '../../../../api/cms.js';

vi.mock('../../../../api/cms.js', () => ({ getCmsPage: vi.fn() }));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/hy/about']}>
        <Routes>
          <Route path="/:locale/about" element={<AboutPageContent />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AboutPageContent (apps/web/src/modules/cms)', () => {
  beforeEach(() => {
    getCmsPage.mockReset();
  });

  test('renders one H1, five section headings, and nine card headings (Sprint G)', () => {
    getCmsPage.mockRejectedValue(new Error('Not Found'));
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    // Mission / traveler value / partner value / how it works / CTA band.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
    // 3 traveler-value + 3 partner-value + 3 how-it-works cards.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(9);
  });

  test('renders a call-to-action linking to Search and Become a Partner', () => {
    getCmsPage.mockRejectedValue(new Error('Not Found'));
    renderPage();
    // This suite renders at /hy/about — assert the Armenian copy actually
    // rendered, same convention every other locale-aware test in this
    // codebase follows.
    expect(
      screen.getByRole('button', { name: 'Դիտել հայտարարությունները' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Դառնալ գործընկեր' }),
    ).toBeInTheDocument();
  });

  test('renders the CMS-authored title once the page is published', async () => {
    getCmsPage.mockResolvedValue({
      success: true,
      data: { title: 'CMS About Title', content: 'CMS About Lead' },
    });
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'CMS About Title' }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('CMS About Lead')).toBeInTheDocument();
  });
});

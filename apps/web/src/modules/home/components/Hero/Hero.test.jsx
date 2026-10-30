import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Hero from './Hero.jsx';
import {
  useCategoriesQuery,
  useDestinationsQuery,
} from '../../../search/index.js';

// Hero composes HomeSearch, which reads the real `search` catalogs —
// mocked here; the search behaviour itself is covered by HomeSearch's own
// tests.
vi.mock('../../../search/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useCategoriesQuery: vi.fn(),
  useDestinationsQuery: vi.fn(),
  useSearchFilterDefinitionsQuery: () => ({ data: [] }),
}));
// Ask Desavii's data hooks (covered by HomeSearch's and useAskDesavii's own
// tests): AI off, a guest.
vi.mock('../../../ai/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  useAiSearchAvailabilityQuery: () => ({ isPending: false, data: false }),
  useParseSearchQueryMutation: () => ({ mutate: () => {}, reset: () => {} }),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

// jsdom has no layout; render the search as it appears from tablet up.
vi.mock('../../../../hooks/useMediaQuery.js', () => ({
  default: () => true,
}));

function renderHero() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<Hero />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Hero (apps/web/src/modules/home)', () => {
  beforeEach(() => {
    useCategoriesQuery.mockReturnValue({ data: [], isPending: false });
    useDestinationsQuery.mockReturnValue({ data: [], isPending: false });
  });

  test('renders the headline as the page level-1 heading', () => {
    renderHero();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Բացահայտեք Հայաստանը' }),
    ).toBeInTheDocument();
  });

  test('renders the search entry', () => {
    renderHero();
    expect(
      screen.getByRole('search', { name: 'Որոնել Հայաստանում' }),
    ).toBeInTheDocument();
  });

  // The photo is the page's largest paint: loaded at once with high
  // priority, as responsive AVIF/WebP, and decorative (the heading says
  // what the page is).
  test('the hero photo loads first, responsively, and is hidden from assistive technology', () => {
    const { container } = renderHero();
    const image = container.querySelector('picture img');
    expect(image).toHaveAttribute('loading', 'eager');
    expect(image).toHaveAttribute('fetchpriority', 'high');
    expect(image).toHaveAttribute('alt', '');
    expect(image.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(
      container
        .querySelector('source[type="image/avif"]')
        .getAttribute('srcset'),
    ).toMatch(/hero-ararat-\d+\.avif \d+w/);
  });
});

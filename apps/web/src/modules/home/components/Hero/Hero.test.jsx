import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Hero from './Hero.jsx';
import {
  useCategoriesQuery,
  useSuggestionsQuery,
} from '../../../search/index.js';

// Hero composes SearchWidget, which now depends on the real `search`
// module's query hooks (categories dropdown + destination autocomplete)
// — mocked here since this test only exercises Hero's own composition,
// not data-fetching (covered by SearchWidget.test.jsx/Categories.test.jsx).
vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useCategoriesQuery: vi.fn(),
    useSuggestionsQuery: vi.fn(),
  };
});

function renderHero() {
  useCategoriesQuery.mockReturnValue({ data: [], isPending: false });
  useSuggestionsQuery.mockReturnValue({ data: [], isPending: false });
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<Hero />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Hero (apps/web/src/modules/home)', () => {
  test('renders the headline as the page level-1 heading', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  test('renders a link to the public partner onboarding entry point', () => {
    renderHero();
    const partnerLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/en/become-a-partner');
    expect(partnerLink).toBeInTheDocument();
  });

  test('renders the search widget', async () => {
    const user = userEvent.setup();
    renderHero();
    // The dock renders collapsed by default (SearchWidget.jsx) — expand
    // it via its trigger before the submit control exists in the DOM.
    await user.click(screen.getByRole('button', { name: 'Ո՞ւր եք գնում' }));
    expect(screen.getByRole('button', { name: /Որոնել/ })).toBeInTheDocument();
  });

  test('hides the decorative depth scene from assistive technology', () => {
    renderHero();
    // Redesign phase (2026) — the procedural terrain scene (SVG ridge
    // layers, light glow, floating particles) replaced the old single
    // `<img>` backdrop; the whole scene wrapper carries `aria-hidden`
    // instead of one image's `alt=""`.
    const scene = document.querySelector('[aria-hidden="true"] svg');
    expect(scene?.closest('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PopularExperiences from './PopularExperiences.jsx';
import { useSearchListingsQuery } from '../../../search/index.js';

// Only the data-fetching hook is mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern) — `SearchResultCard` renders for real, same as
// FeaturedListings.test.jsx's identical approach.
vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useSearchListingsQuery: vi.fn() };
});
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => null,
  }),
);

const EXPERIENCE = {
  id: 7,
  listing_type: 'TOUR',
  slug: 'dilijan-forest-hike',
  title: 'Dilijan Forest Hike',
};

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<PopularExperiences />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PopularExperiences (apps/web/src/modules/home)', () => {
  test('renders a labeled section landmark', () => {
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  test('renders a skeleton while pending', () => {
    useSearchListingsQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    });
    renderSection();
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  test('renders an error alert on failure', () => {
    useSearchListingsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    });
    renderSection();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('renders an empty state when there are no published listings', () => {
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(
      screen.getByRole('heading', { name: 'Դեռ նոր բան չկա' }),
    ).toBeInTheDocument();
  });

  test('renders one card per real listing, sorted newest-first across every listing type', () => {
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [EXPERIENCE] }] },
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(
      screen.getByRole('heading', { name: 'Dilijan Forest Hike' }),
    ).toBeInTheDocument();
    expect(useSearchListingsQuery).toHaveBeenCalledWith(
      { sort: 'newest' },
      { locale: 'en' },
    );
  });

  test('renders a "view all" link to the search route', () => {
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
      isPending: false,
      isError: false,
    });
    renderSection();
    // The test harness's i18n instance defaults to Armenian (tests/setup.js).
    expect(screen.getByRole('link', { name: 'Տեսնել բոլորը' })).toHaveAttribute(
      'href',
      '/en/search',
    );
  });
});

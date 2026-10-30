import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FeaturedDestinations from './FeaturedDestinations.jsx';
import { useDestinationsQuery } from '../../../search/index.js';

// Only the data-fetching hook is mocked (FRONTEND_ARCHITECTURE.md §14 is a
// React Query concern) — `DestinationCard` renders for real.
vi.mock('../../../search/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useDestinationsQuery: vi.fn() };
});

const DESTINATIONS = [
  { id: 1, slug: 'yerevan', name: 'Yerevan', listing_count: 42 },
  { id: 2, slug: 'dilijan', name: 'Dilijan', listing_count: 8 },
  {
    id: 3,
    slug: 'no-listings-city',
    name: 'No Listings City',
    listing_count: 0,
  },
];

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/en']}>
      <Routes>
        <Route path="/:locale" element={<FeaturedDestinations />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FeaturedDestinations (apps/web/src/modules/home)', () => {
  test('renders a labeled section landmark', () => {
    useDestinationsQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  test('renders an error state on failure', () => {
    useDestinationsQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderSection();
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
  });

  test('renders an empty state when no city has published listings', () => {
    useDestinationsQuery.mockReturnValue({
      data: [
        { id: 1, slug: 'quiet-town', name: 'Quiet Town', listing_count: 0 },
      ],
      isPending: false,
      isError: false,
    });
    renderSection();
    // The test harness's i18n instance defaults to Armenian (tests/setup.js).
    expect(
      screen.getByRole('heading', { name: 'Ուղղություններ դեռ չկան' }),
    ).toBeInTheDocument();
  });

  test('renders one card per real city with published listings, excluding empty ones', () => {
    useDestinationsQuery.mockReturnValue({
      data: DESTINATIONS,
      isPending: false,
      isError: false,
    });
    renderSection();
    expect(screen.getByRole('link', { name: /Yerevan/ })).toHaveAttribute(
      'href',
      '/en/destinations/yerevan',
    );
    expect(screen.getByRole('link', { name: /Dilijan/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /No Listings City/ }),
    ).not.toBeInTheDocument();
  });

  // Carousel closure: the section shows the six busiest real cities.
  test('shows at most six cities, the busiest first, never an empty one', () => {
    const cities = Array.from({ length: 8 }, (_, index) => ({
      id: index + 10,
      slug: `city-${index}`,
      name: `City ${index}`,
      listing_count: index + 1,
    }));
    useDestinationsQuery.mockReturnValue({
      data: [...cities, DESTINATIONS[2]],
      isPending: false,
      isError: false,
    });
    renderSection();
    const names = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);
    expect(names).toEqual([
      'City 7',
      'City 6',
      'City 5',
      'City 4',
      'City 3',
      'City 2',
    ]);
  });

  test('renders a "view all" link to the search route', () => {
    useDestinationsQuery.mockReturnValue({
      data: [],
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

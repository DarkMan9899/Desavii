/**
 * Regression test for the "Rooms —" blank-title bug: `listing.title` is
 * never a flat property on the DTO from `GET /listings/:id` — the title
 * lives on each locale's row in `listing.translations`. This asserts the
 * heading and breadcrumb resolve the real localized title instead.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PartnerListingRoomsPageContent from './PartnerListingRoomsPageContent.jsx';
import { useListingQuery } from '../../queries/useListingQuery.js';

vi.mock('../../queries/useListingQuery.js', () => ({
  useListingQuery: vi.fn(),
}));
// Step L6.2B: the heading names the listing's own units, resolved from its
// primary category.
vi.mock('../../queries/useListingCategoriesQuery.js', () => ({
  useListingCategoriesQuery: () => ({
    data: [
      { id: 7, slug: 'hotels' },
      { id: 9, slug: 'car-rentals' },
    ],
  }),
}));
vi.mock('../BookableUnitsManager/BookableUnitsManager.jsx', () => ({
  default: () => <div>BookableUnitsManager</div>,
}));

function renderPage(listingId = 42) {
  return render(
    <MemoryRouter initialEntries={[`/hy/partner/listings/${listingId}/rooms`]}>
      <Routes>
        <Route
          path="/:locale/partner/listings/:id/rooms"
          element={<PartnerListingRoomsPageContent listingId={listingId} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('PartnerListingRoomsPageContent', () => {
  test('resolves the listing title from translations for the heading and breadcrumb', () => {
    useListingQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 42,
        listing_type: 'HOTEL',
        category_ids: [7],
        translations: [
          { language_code: 'en', title: 'Yerevan Hotel' },
          { language_code: 'hy', title: 'Հյուրանոց Երևան' },
        ],
      },
    });

    renderPage();

    // Appears twice: once inside the "Rooms — {title}" heading, once as
    // the breadcrumb's final crumb — both must resolve the real title,
    // not render blank the way `listing.title` (undefined) used to.
    expect(screen.getAllByText(/Հյուրանոց Երևան/).length).toBe(2);
    expect(
      screen.getByText('Սենյակների տեսակներ — Հյուրանոց Երևան'),
    ).toBeInTheDocument();
  });

  test('a car rental names its vehicle, never "rooms"', () => {
    useListingQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 42,
        listing_type: 'CAR_RENTAL',
        category_ids: [9],
        translations: [{ language_code: 'hy', title: 'Toyota RAV4' }],
      },
    });

    renderPage();

    expect(screen.getByText('Ավտոմեքենա — Toyota RAV4')).toBeInTheDocument();
  });

  test('falls back to the first translation when none matches the active locale', () => {
    useListingQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        id: 42,
        listing_type: 'HOTEL',
        category_ids: [7],
        translations: [{ language_code: 'ru', title: 'Отель Ереван' }],
      },
    });

    renderPage();

    expect(screen.getAllByText(/Отель Ереван/).length).toBe(2);
  });
});

/**
 * Integration-style test: mounts the full real page-content tree (every
 * section component for real, nothing stubbed except the network-facing
 * query hooks) across two different, deliberately dissimilar categories
 * (a Villa-shaped attribute/policy/amenity set vs. a Tour-shaped one) —
 * the same "prove zero hardcoded category logic" contract the wizard's
 * own browser walkthrough already established for the write side.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToastProvider from '../../../../providers/ToastProvider.jsx';
import ListingDetailPageContent from './ListingDetailPageContent.jsx';
import { useListingQuery } from '../../queries/useListingQuery.js';
import { useListingMetadataQuery } from '../../queries/useListingMetadataQuery.js';
import { useListingCategoriesQuery } from '../../queries/useListingCategoriesQuery.js';
import { useListingAvailabilityQuery } from '../../queries/useListingAvailabilityQuery.js';
import { useListingAvailabilitySummaryQuery } from '../../queries/useListingAvailabilitySummaryQuery.js';
import { useListingBookableUnitsQuery } from '../../queries/useListingBookableUnitsQuery.js';
import { useListingMenuQuery } from '../../queries/useListingMenuQuery.js';
import { useListingOpeningHoursQuery } from '../../queries/useListingOpeningHoursQuery.js';
import { useListingCalendarQuery } from '../../queries/useListingCalendarQuery.js';
import { useListingDayStatusQuery } from '../../queries/useListingDayStatusQuery.js';
import { useCreateBookingHoldMutation } from '../../../bookings/mutations/useCreateBookingHoldMutation.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';
import { useSearchListingsQuery } from '../../../search/index.js';

vi.mock('../../queries/useListingQuery.js', () => ({
  useListingQuery: vi.fn(),
}));
vi.mock('../../queries/useListingMetadataQuery.js', () => ({
  useListingMetadataQuery: vi.fn(),
}));
vi.mock('../../queries/useListingCategoriesQuery.js', () => ({
  useListingCategoriesQuery: vi.fn(),
}));
vi.mock('../../queries/useListingAvailabilityQuery.js', () => ({
  useListingAvailabilityQuery: vi.fn(),
}));
vi.mock('../../queries/useListingAvailabilitySummaryQuery.js', () => ({
  useListingAvailabilitySummaryQuery: vi.fn(),
}));
vi.mock('../../queries/useListingBookableUnitsQuery.js', () => ({
  useListingBookableUnitsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useListingMenuQuery.js', () => ({
  useListingMenuQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useListingOpeningHoursQuery.js', () => ({
  useListingOpeningHoursQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useListingCalendarQuery.js', () => ({
  useListingCalendarQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/useListingDayStatusQuery.js', () => ({
  useListingDayStatusQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../bookings/mutations/useCreateBookingHoldMutation.js', () => ({
  useCreateBookingHoldMutation: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../../search/index.js', () => ({
  useSearchListingsQuery: vi.fn(),
  // eslint-disable-next-line react/prop-types -- trivial test double
  SearchResultCard: ({ result }) => <div>{result.title}</div>,
}));
vi.mock('../../../reviews/index.js', () => ({
  // eslint-disable-next-line react/prop-types -- trivial test double
  ReviewsList: ({ listingId }) => <div>Reviews for {listingId}</div>,
}));
vi.mock('../../../favorites/index.js', () => ({
  FavoriteButton: () => null,
}));
vi.mock('../../../ai/index.js', () => ({
  AskAiButton: () => null,
}));

const VILLA_LISTING = {
  id: 3,
  slug: 'villa-in-yerevan',
  translations: [
    {
      language_id: 1,
      language_code: 'hy',
      title: 'Հրաշալի վիլլա',
      summary: 'Ամփոփում',
      description: null,
    },
  ],
  location: {
    city_name: 'Yerevan',
    country_name: 'Armenia',
    latitude: 40.1872,
    longitude: 44.5152,
  },
  category_ids: [3],
  amenity_ids: [1],
  media: [
    {
      id: 10,
      media_type: 'IMAGE',
      url: 'https://example.test/villa.jpg',
      thumbnail_url: 'https://example.test/villa-thumb.jpg',
      position: 0,
    },
  ],
  attribute_values: [{ code: 'bedrooms', value: '3' }],
  policy_values: [{ code: 'pets_allowed', value: 'true' }],
  pricing: { pricing_model: 'PER_NIGHT', amount: '150.00', currency: 'AMD' },
};

const VILLA_METADATA = {
  attributes: [{ code: 'bedrooms', data_type: 'INTEGER', unit: 'rooms' }],
  amenity_groups: [
    { code: 'CONNECTIVITY', amenities: [{ value: 1, code: 'WiFi' }] },
  ],
  pricing_models: [{ code: 'PER_NIGHT' }],
  policies: [{ code: 'pets_allowed', data_type: 'BOOLEAN' }],
};

const TOUR_LISTING = {
  ...VILLA_LISTING,
  id: 6,
  slug: 'yerevan-city-tour',
  translations: [
    {
      language_id: 1,
      language_code: 'hy',
      title: 'Երևանի շրջայց',
      summary: 'Ամփոփում',
      description: null,
    },
  ],
  category_ids: [6],
  amenity_ids: [],
  attribute_values: [{ code: 'difficulty', option_codes: ['EASY'] }],
  policy_values: [],
  pricing: { pricing_model: 'PER_PERSON', amount: '25.00', currency: 'AMD' },
};

const TOUR_METADATA = {
  attributes: [
    {
      code: 'difficulty',
      data_type: 'ENUM',
      options: [{ value: 1, code: 'EASY' }],
    },
  ],
  amenity_groups: [],
  pricing_models: [{ code: 'PER_PERSON' }],
  policies: [],
};

function renderPage(listingId) {
  return render(
    <MemoryRouter initialEntries={[`/hy/listings/${listingId}`]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/:locale/listings/:id"
            element={<ListingDetailPageContent />}
          />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('ListingDetailPageContent (Listing Details, Phase 18)', () => {
  beforeEach(() => {
    useListingQuery.mockReset();
    useListingMetadataQuery.mockReset();
    useListingAvailabilityQuery.mockReset();
    useListingBookableUnitsQuery.mockReset();
    useListingMenuQuery.mockReset();
    useListingOpeningHoursQuery.mockReset();
    useListingCalendarQuery.mockReset();
    useCreateBookingHoldMutation.mockReset();
    useAuth.mockReset();
    useSearchListingsQuery.mockReset();
    useListingAvailabilitySummaryQuery.mockReset();
    useListingAvailabilityQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { kind: 'calendar', days: [] },
      refetch: vi.fn(),
    });
    useListingAvailabilitySummaryQuery.mockReturnValue({ data: undefined });
    useListingBookableUnitsQuery.mockReturnValue({
      data: [{ id: 1, bookable_unit_type: 'PROPERTY_UNIT', capacity: 1 }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useListingCalendarQuery.mockReturnValue({ data: [] });
    useListingDayStatusQuery.mockReturnValue({ data: [], refetch: vi.fn() });
    useListingMenuQuery.mockReturnValue({ data: [] });
    useListingOpeningHoursQuery.mockReturnValue({ data: [] });
    useCreateBookingHoldMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
    useAuth.mockReturnValue({ isAuthenticated: false });
    useSearchListingsQuery.mockReturnValue({
      data: { pages: [{ results: [] }] },
    });
    useListingCategoriesQuery.mockReturnValue({
      data: [
        { id: 3, slug: 'villas', name: 'Վիլլաներ' },
        { id: 6, slug: 'tours', name: 'Շրջայցեր' },
      ],
    });
  });

  test('shows a loading state while the listing is fetching', () => {
    useListingQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(3);
    expect(
      screen.getByLabelText('Հայտարարությունը բեռնվում է…'),
    ).toHaveAttribute('aria-busy', 'true');
  });

  test('shows the not-found empty state for a 404', () => {
    useListingQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { status: 404 },
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(999);
    expect(
      screen.getByRole('heading', { name: 'Էջը չի գտնվել' }),
    ).toBeInTheDocument();
  });

  test('shows a retryable error state for a non-404 failure', () => {
    const refetch = vi.fn();
    useListingQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { status: 500 },
      refetch,
    });
    useListingMetadataQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(3);
    screen.getByRole('button', { name: 'Կրկնել' }).click();
    expect(refetch).toHaveBeenCalled();
  });

  test('renders a fully populated Villa listing end-to-end', () => {
    useListingQuery.mockReturnValue({
      data: VILLA_LISTING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: VILLA_METADATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(3);

    expect(
      screen.getByRole('heading', { name: 'Հրաշալի վիլլա', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 սենյակ')).toBeInTheDocument();
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.getByText('Այո')).toBeInTheDocument();
    // Renders once in the hero's meta row and once in the Location
    // section — both are real, intentional uses of the same text.
    expect(screen.getAllByText('Yerevan, Armenia')).toHaveLength(2);
    expect(screen.getByText('Վիլլաներ')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ուղարկել ամրագրման հայտ' }),
    ).toBeInTheDocument();
  });

  test('Sprint C-2: shows a Rooms section for a listing with real HOTEL_ROOM units, and never a whole-property listing', () => {
    useListingQuery.mockReturnValue({
      data: VILLA_LISTING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: VILLA_METADATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    useListingBookableUnitsQuery.mockReturnValue({
      data: [
        {
          id: 1,
          bookable_unit_type: 'HOTEL_ROOM',
          capacity: 3,
          unit_label: 'Standard Room',
          max_guests: 2,
        },
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(3);

    expect(
      screen.getByRole('heading', { name: 'Սենյակներ', level: 2 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Standard Room')).toBeInTheDocument();
  });

  test('does not render a Rooms section for a whole-property listing (no HOTEL_ROOM units)', () => {
    useListingQuery.mockReturnValue({
      data: VILLA_LISTING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: VILLA_METADATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    // Default beforeEach mock already returns a PROPERTY_UNIT — the
    // Villa/Apartment/Guest House regression case.
    renderPage(3);

    expect(
      screen.queryByRole('heading', { name: 'Սենյակներ', level: 2 }),
    ).not.toBeInTheDocument();
  });

  test("2026 SEO audit: sets a real og:image/twitter:image from the listing's own lowest-position photo", () => {
    useListingQuery.mockReturnValue({
      data: VILLA_LISTING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: VILLA_METADATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(3);

    const ogImage = document.querySelector('meta[property="og:image"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    const twitterCard = document.querySelector('meta[name="twitter:card"]');
    expect(ogImage?.getAttribute('content')).toBe(
      'https://example.test/villa.jpg',
    );
    expect(twitterImage?.getAttribute('content')).toBe(
      'https://example.test/villa.jpg',
    );
    expect(twitterCard?.getAttribute('content')).toBe('summary_large_image');
  });

  test('renders a differently-shaped Tour listing with zero hardcoded category logic', () => {
    useListingQuery.mockReturnValue({
      data: TOUR_LISTING,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    useListingMetadataQuery.mockReturnValue({
      data: TOUR_METADATA,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage(6);

    expect(
      screen.getByRole('heading', { name: 'Երևանի շրջայց', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Հեշտ')).toBeInTheDocument();
    expect(screen.getByText('Շրջայցեր')).toBeInTheDocument();
    // No amenities/policies were declared for this category — those
    // sections must not render at all, not an empty placeholder.
    expect(
      screen.queryByRole('heading', { name: 'Հարմարություններ' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Կանոններ' }),
    ).not.toBeInTheDocument();
  });
});

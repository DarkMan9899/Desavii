import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CompanyProfilePageContent from './CompanyProfilePageContent.jsx';
import { useCompanyQuery } from '../../queries/useCompanyQuery.js';
import { usePartnerListingsQuery } from '../../queries/usePartnerListingsQuery.js';

vi.mock('../../queries/useCompanyQuery.js', () => ({
  useCompanyQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock('../../queries/usePartnerListingsQuery.js', () => ({
  usePartnerListingsQuery: vi.fn(),
  default: vi.fn(),
}));
vi.mock(
  '../../../favorites/components/FavoriteButton/FavoriteButton.jsx',
  () => ({
    default: () => null,
  }),
);

const COMPANY = {
  id: 1,
  slug: 'yerevan-boutique-hospitality',
  display_name: 'Yerevan Boutique Hospitality',
  description: 'A boutique hospitality partner.',
  logo_url: null,
  cover_url: null,
  listing_count: 2,
  is_verified: true,
  email: 'hello@example.com',
  phone: '+37411000000',
  website: 'https://example.com',
  social_links: {},
};

const NOOP_LISTINGS_QUERY_RESULT = {
  data: { pages: [{ results: [] }] },
  isPending: false,
  isError: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/hy/companies/yerevan-boutique-hospitality']}
    >
      <Routes>
        <Route
          path="/:locale/companies/:slug"
          element={<CompanyProfilePageContent />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('CompanyProfilePageContent (apps/web/src/modules/companies)', () => {
  test('renders the company name and description on success', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Yerevan Boutique Hospitality' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A boutique hospitality partner.'),
    ).toBeInTheDocument();
    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
  });

  test('renders a not-found EmptyState for a 404', () => {
    useCompanyQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { status: 404 },
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(
      screen.queryByRole('heading', { name: 'Yerevan Boutique Hospitality' }),
    ).not.toBeInTheDocument();
  });

  // Never expose a raw API error / private fields — only the shared
  // errors.notFound.* copy renders for a 404, never e.g. a raw error
  // message or anything from a partner-admin-only shape.
  test('never renders private/internal fields (owner, legal name, review note)', () => {
    useCompanyQuery.mockReturnValue({
      data: {
        ...COMPANY,
        // A malformed/overly-generous mock response would still not
        // leak these — the component never reads these keys at all.
        owner_user_id: 999,
        legal_name: 'Private Legal Name LLC',
        review_note: 'Internal admin note',
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(screen.queryByText(/Private Legal Name/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Internal admin note/)).not.toBeInTheDocument();
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  });

  test('P1.3: prefers the locale-matched translation over the flat fallback description, and renders social links', () => {
    useCompanyQuery.mockReturnValue({
      data: {
        ...COMPANY,
        description: 'Any-locale fallback text.',
        translations: [
          {
            language_id: 2,
            language_code: 'hy',
            description: 'Հայերեն նկարագրություն',
          },
        ],
        social_links: { facebook: 'https://facebook.com/yerevan-boutique' },
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(screen.getByText('Հայերեն նկարագրություն')).toBeInTheDocument();
    expect(
      screen.queryByText('Any-locale fallback text.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Facebook/ })).toHaveAttribute(
      'href',
      'https://facebook.com/yerevan-boutique',
    );
  });

  test('renders the company listings, reusing SearchResultCard (the same shared card system Search/Category/Home use)', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      data: {
        pages: [
          { results: [{ id: 9, listing_type: 'HOTEL', title: 'A room' }] },
        ],
      },
    });
    renderPage();

    expect(screen.getByRole('heading', { name: 'A room' })).toBeInTheDocument();
  });

  // Company Public Profile (Step A2) — mixed categories across a
  // company's own catalog must each keep their own real card metadata,
  // routed entirely through the existing shared card system (no
  // category branching inside this page itself).
  test('renders listings across multiple categories, each carrying its own real category metadata', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      data: {
        pages: [
          {
            results: [
              {
                id: 9,
                listing_type: 'HOTEL',
                category_slug: 'hotels',
                title: 'Sunset Hotel',
                star_rating: '4',
              },
              {
                id: 10,
                listing_type: 'TOUR',
                category_slug: 'tours',
                title: 'City Walking Tour',
                duration_minutes: 90,
              },
            ],
          },
        ],
      },
    });
    const { container } = renderPage();

    expect(
      screen.getByRole('heading', { name: 'Sunset Hotel' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'City Walking Tour' }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-category="hotels"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-category="tours"]'),
    ).toBeInTheDocument();
  });

  // A real merged page across multiple fetched pages — flattening must
  // never duplicate or drop a listing.
  test('flattens multiple fetched pages of listings without duplicates', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      data: {
        pages: [
          { results: [{ id: 1, listing_type: 'HOTEL', title: 'First' }] },
          { results: [{ id: 2, listing_type: 'HOTEL', title: 'Second' }] },
        ],
      },
      hasNextPage: false,
    });
    renderPage();

    expect(screen.getAllByRole('heading', { name: 'First' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: 'Second' })).toHaveLength(1);
  });

  test('shows a "Load more" control only when hasNextPage is true, and calls fetchNextPage on click', async () => {
    const fetchNextPage = vi.fn();
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      data: {
        pages: [{ results: [{ id: 1, listing_type: 'HOTEL', title: 'A' }] }],
      },
      hasNextPage: true,
      fetchNextPage,
    });
    const { getByText } = renderPage();

    const loadMoreButton = getByText('Բեռնել ավելին');
    loadMoreButton.click();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  test('hides the "Load more" control when hasNextPage is false', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      data: {
        pages: [{ results: [{ id: 1, listing_type: 'HOTEL', title: 'A' }] }],
      },
      hasNextPage: false,
    });
    renderPage();

    expect(screen.queryByText('Բեռնել ավելին')).not.toBeInTheDocument();
  });

  // A valid company with zero public listings is a valid profile — never
  // a 404, never fake listings, an intentional empty state instead.
  test('a company with zero public listings shows an intentional empty state, never fake listings or an error', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(
      screen.getByText('Առայժմ հայտարարություններ չկան'),
    ).toBeInTheDocument();
  });

  test('shows a retryable error state for the listings section only, without affecting the company header', () => {
    const refetchListings = vi.fn();
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      isError: true,
      refetch: refetchListings,
    });
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Yerevan Boutique Hospitality' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Հայտարարությունները չհաջողվեց բեռնել'),
    ).toBeInTheDocument();
  });

  test('shows a listings loading skeleton while the listings query is pending', () => {
    useCompanyQuery.mockReturnValue({
      data: COMPANY,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue({
      ...NOOP_LISTINGS_QUERY_RESULT,
      isPending: true,
      data: undefined,
    });
    renderPage();

    // Neither the empty state nor any card renders while pending.
    expect(
      screen.queryByText('Առայժմ հայտարարություններ չկան'),
    ).not.toBeInTheDocument();
  });

  test('missing optional company fields (no logo/cover/description/contacts) degrade cleanly', () => {
    useCompanyQuery.mockReturnValue({
      data: {
        id: 2,
        slug: 'minimal-company',
        display_name: 'Minimal Company',
        description: null,
        logo_url: null,
        cover_url: null,
        listing_count: 0,
        is_verified: false,
        email: null,
        phone: null,
        website: null,
        social_links: {},
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    usePartnerListingsQuery.mockReturnValue(NOOP_LISTINGS_QUERY_RESULT);
    renderPage();

    expect(
      screen.getByRole('heading', { name: 'Minimal Company' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(
      screen.getByText('Առայժմ հայտարարություններ չկան'),
    ).toBeInTheDocument();
  });
});

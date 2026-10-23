import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminListingEditContent from './AdminListingEditContent.jsx';
import { useAdminListingDetailQuery } from '../../queries/useAdminListingDetailQuery.js';
import { useAuth } from '../../../../contexts/AuthContext.jsx';

vi.mock('../../queries/useAdminListingDetailQuery.js', () => ({
  useAdminListingDetailQuery: vi.fn(),
}));
vi.mock('../../../../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

// The Wizard itself is covered by its own suites; here only what this
// page hands it matters.
vi.mock('../../../listings/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // eslint-disable-next-line react/prop-types -- trivial test double
  PartnerListingWizard: ({ partnerships: { length }, exitPath }) => (
    <div
      data-testid="wizard"
      data-partnerships={length}
      data-exit-path={exitPath}
    />
  ),
}));

function LocationProbe() {
  const { pathname, search } = useLocation();
  const current = pathname + search;
  return <output data-testid="location">{current}</output>;
}

function renderPage(entry) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/:locale/admin/listings/:id/edit"
            element={<AdminListingEditContent />}
          />
          <Route path="/:locale/admin/listings/:id" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const DRAFT = {
  id: 7,
  status: 'DRAFT',
  slug: 'garni-day-tour',
  translations: [{ language_code: 'hy', title: 'Գառնիի տուր' }],
};

describe('AdminListingEditContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ permissions: ['listing.update'] });
    useAdminListingDetailQuery.mockReturnValue({
      data: DRAFT,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  test('fills in the listing id and starts at Basic information', () => {
    renderPage('/hy/admin/listings/7/edit');
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/hy/admin/listings/7/edit?listingId=7&step=basicInfo',
    );
  });

  test('opens the shared Wizard on an editable listing, returning to the admin detail page', () => {
    renderPage('/hy/admin/listings/7/edit?listingId=7&step=location');
    expect(
      screen.getByRole('heading', { name: 'Խմբագրում՝ Գառնիի տուր' }),
    ).toBeInTheDocument();
    const wizard = screen.getByTestId('wizard');
    expect(wizard).toHaveAttribute('data-exit-path', '/hy/admin/listings/7');
    expect(wizard).toHaveAttribute('data-partnerships', '0');
  });

  test.each(['PUBLISHED', 'PENDING_REVIEW'])(
    'a %s listing is sent back to its detail page, which explains the lock',
    (status) => {
      useAdminListingDetailQuery.mockReturnValue({
        data: { ...DRAFT, status },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage('/hy/admin/listings/7/edit?listingId=7&step=basicInfo');
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/hy/admin/listings/7',
      );
    },
  );

  test('a role without listing.update never sees the editor', () => {
    useAuth.mockReturnValue({ permissions: ['listing.moderate'] });
    renderPage('/hy/admin/listings/7/edit?listingId=7&step=basicInfo');
    expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/hy/admin/listings/7',
    );
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PartnerLayout from './PartnerLayout.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isBootstrapping: false,
    user: { id: 1, first_name: 'Ana', last_name: 'Smith' },
    logout: vi.fn(),
  }),
}));

// PartnerWorkspaceIdentity (2026 Partner Workspace redesign) reads the
// active partner via `usePartnerContext`, so this layout can no longer
// render without a provider for it — mocked here the same way
// `PartnerDashboardOverviewContent.test.jsx` mocks it, rather than
// wrapping every `renderAt` call in a real `PartnerProvider` (which
// would also need a real `partnerships` array from `useAuth`).
const mockUsePartnerContext = vi.fn(() => ({
  activePartner: {
    partner_id: 3,
    display_name: 'Ararat Travel',
    role: 'OWNER',
    verification_status: 'APPROVED',
  },
}));

vi.mock('../contexts/PartnerContext.jsx', () => ({
  usePartnerContext: () => mockUsePartnerContext(),
}));

// Avoids a real (jsdom-cross-origin-rejected) network attempt for the
// identity card's logo lookup — this layout test only cares about nav
// highlighting, not the company-profile fetch.
vi.mock('../modules/partner/queries/useMyCompanyProfileQuery.js', () => ({
  useMyCompanyProfileQuery: () => ({ data: undefined }),
}));

function renderAt(path) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:locale/partner" element={<PartnerLayout />}>
            <Route index element={<p>overview</p>} />
            <Route path="listings" element={<p>listings</p>} />
            <Route path="listings/new" element={<p>wizard</p>} />
            <Route path="bookings" element={<p>bookings list</p>} />
            <Route path="bookings/:id" element={<p>booking detail</p>} />
            <Route path="calendar" element={<p>calendar</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PartnerLayout (apps/web/src/layouts)', () => {
  test('highlights "Ընդհանուր տեսք" (Overview) on the partner root, not Listings/Bookings/Calendar', () => {
    renderAt('/hy/partner');
    expect(
      screen.getByRole('link', { name: 'Ընդհանուր տեսք', current: 'page' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Ամրագրումներ', current: 'page' }),
    ).not.toBeInTheDocument();
  });

  test('highlights "Ամրագրումներ" (Bookings) on the exact list route', () => {
    renderAt('/hy/partner/bookings');
    expect(
      screen.getByRole('link', { name: 'Ամրագրումներ', current: 'page' }),
    ).toBeInTheDocument();
  });

  test('still highlights "Ամրագրումներ" on a nested booking-detail route', () => {
    renderAt('/hy/partner/bookings/7');
    expect(
      screen.getByRole('link', { name: 'Ամրագրումներ', current: 'page' }),
    ).toBeInTheDocument();
  });

  test('still highlights "Հայտարարություններ" on the new-listing wizard route', () => {
    renderAt('/hy/partner/listings/new');
    expect(
      screen.getByRole('link', { name: 'Հայտարարություններ', current: 'page' }),
    ).toBeInTheDocument();
  });

  test('highlights "Օրացույց" (Calendar) on the calendar route', () => {
    renderAt('/hy/partner/calendar');
    expect(
      screen.getByRole('link', { name: 'Օրացույց', current: 'page' }),
    ).toBeInTheDocument();
  });

  // Step A6 (Partner Analytics Dashboard UI), brief §5/§62: the nav item
  // is discoverable only to a role whose capability matrix grants
  // VIEW_ANALYTICS — UI-only convenience, never the real authority (the
  // server 403s independently either way).
  test('shows the Analytics nav item for an OWNER (always granted, brief §4/§62)', () => {
    mockUsePartnerContext.mockReturnValue({
      activePartner: {
        partner_id: 3,
        display_name: 'Ararat Travel',
        role: 'OWNER',
        verification_status: 'APPROVED',
      },
    });
    renderAt('/hy/partner');
    expect(
      screen.getByRole('link', { name: 'Վերլուծություն' }),
    ).toBeInTheDocument();
  });

  test('hides the Analytics nav item for a role without VIEW_ANALYTICS (e.g. EDITOR)', () => {
    mockUsePartnerContext.mockReturnValue({
      activePartner: {
        partner_id: 3,
        display_name: 'Ararat Travel',
        role: 'EDITOR',
        verification_status: 'APPROVED',
      },
    });
    renderAt('/hy/partner');
    expect(
      screen.queryByRole('link', { name: 'Վերլուծություն' }),
    ).not.toBeInTheDocument();
  });
});

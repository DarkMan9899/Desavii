import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './AdminLayout.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const FULL_ADMIN_PERMISSIONS = [
  'user.list',
  'listing.moderate',
  'booking.view_all',
  'audit.view',
];
// The seeded SUPPORT grants (004_roles_and_permissions.js): read-only.
const SUPPORT_PERMISSIONS = [
  'user.list',
  'user.view',
  'booking.view_all',
  'audit.view',
  'messaging.view_all',
  'payment.view',
  'inventory.view_all',
];
const USERS_CONTENT = 'users list content';
const USER_DETAIL_CONTENT = 'user detail content';
const PARTNERS_CONTENT = 'partners content';
const FORBIDDEN_TITLE = 'Հասանելիությունը սահմանափակված է';

function signedInWith(permissions) {
  useAuth.mockReturnValue({
    isAuthenticated: true,
    isBootstrapping: false,
    user: { id: 1, first_name: 'Dev', last_name: 'Staff' },
    roles: [],
    partnerships: [],
    permissions,
    logout: vi.fn(),
  });
}

function renderAt(path) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:locale/admin" element={<AdminLayout />}>
            <Route index element={<p>dashboard content</p>} />
            <Route path="users" element={<p>{USERS_CONTENT}</p>} />
            <Route path="users/:id" element={<p>{USER_DETAIL_CONTENT}</p>} />
            <Route path="partners" element={<p>{PARTNERS_CONTENT}</p>} />
            <Route path="partners/:id" element={<p>{PARTNERS_CONTENT}</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminLayout (apps/web/src/layouts)', () => {
  test('highlights "Վահանակ" (Dashboard) on the admin root and renders the outlet', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      isBootstrapping: false,
      user: { id: 1, first_name: 'Dev', last_name: 'Admin' },
      permissions: FULL_ADMIN_PERMISSIONS,
      logout: vi.fn(),
    });
    renderAt('/hy/admin');
    expect(
      screen.getByRole('link', { name: 'Վահանակ', current: 'page' }),
    ).toBeInTheDocument();
    expect(screen.getByText('dashboard content')).toBeInTheDocument();
  });

  // Phase 14.10 cleanup: MODERATOR lacks `user.list`/`booking.view_all`/
  // `audit.view` — those three nav entries must not dead-end into a 403.
  test('hides Users/Bookings/Audit-Logs nav entries for a role missing their read permission', () => {
    useAuth.mockReturnValue({
      isAuthenticated: true,
      isBootstrapping: false,
      user: { id: 1, first_name: 'Dev', last_name: 'Moderator' },
      permissions: ['listing.moderate'],
      logout: vi.fn(),
    });
    renderAt('/hy/admin');
    expect(
      screen.queryByRole('link', { name: 'Օգտատերեր' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Ամրագրումներ' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Աուդիտի մատյան' }),
    ).not.toBeInTheDocument();
    // Listings requires listing.moderate, which this role has.
    expect(
      screen.getByRole('link', { name: 'Հայտարարություններ' }),
    ).toBeInTheDocument();
  });

  test('SUPPORT is not offered Partners (its list endpoint needs partner.verify or partner.moderate); a moderator is', () => {
    signedInWith(SUPPORT_PERMISSIONS);
    const { unmount } = renderAt('/hy/admin');
    expect(
      screen.queryByRole('link', { name: 'Գործընկերներ' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Օգտատերեր' })).toBeInTheDocument();
    unmount();

    signedInWith(['partner.moderate']);
    renderAt('/hy/admin');
    expect(screen.getByRole('link', { name: 'Գործընկերներ' })).toHaveAttribute(
      'href',
      '/hy/admin/partners',
    );
  });

  test('a detail page highlights its own section only, and the Dashboard is not current there', () => {
    signedInWith(FULL_ADMIN_PERMISSIONS);
    renderAt('/hy/admin/users/42');

    expect(screen.getByText(USER_DETAIL_CONTENT)).toBeInTheDocument();
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName('Օգտատերեր');
  });

  test.each([
    ['a section list', '/hy/admin/users', ['listing.moderate']],
    ['a section detail', '/hy/admin/partners/7', SUPPORT_PERMISSIONS],
  ])(
    'typing the URL of %s this role cannot open shows the forbidden page, not a page that can only fail, with nothing highlighted',
    (_what, path, permissions) => {
      signedInWith(permissions);
      renderAt(path);

      expect(screen.getByText(FORBIDDEN_TITLE)).toBeInTheDocument();
      expect(screen.queryByText(USERS_CONTENT)).not.toBeInTheDocument();
      expect(screen.queryByText(PARTNERS_CONTENT)).not.toBeInTheDocument();
      expect(screen.queryAllByRole('link', { current: 'page' })).toHaveLength(
        0,
      );
    },
  );

  test('every sidebar link keeps the current locale', () => {
    signedInWith(FULL_ADMIN_PERMISSIONS);
    renderAt('/ru/admin');

    const links = screen.getAllByRole('link');
    const sidebarHrefs = links
      .map((link) => link.getAttribute('href'))
      .filter((href) => href.includes('/admin'));
    expect(sidebarHrefs.length).toBeGreaterThan(10);
    sidebarHrefs.forEach((href) => expect(href).toMatch(/^\/ru\/admin/));
  });
});

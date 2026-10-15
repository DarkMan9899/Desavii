import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import RedirectIfAuthenticated from './RedirectIfAuthenticated.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

const SIGNED_OUT = {
  isAuthenticated: false,
  isBootstrapping: false,
  roles: [],
  partnerships: [],
};
const FORM_HEADING = 'Registration form';
const PARTNERSHIP = [{ partner_id: 1, role_code: 'OWNER' }];

function Where() {
  const { pathname } = useLocation();
  const where = `at ${pathname}`;
  return <p>{where}</p>;
}

function renderAt(entry, destination = 'home') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/:locale/auth/register"
          element={
            <RedirectIfAuthenticated destination={destination}>
              <h1>{FORM_HEADING}</h1>
            </RedirectIfAuthenticated>
          }
        />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RedirectIfAuthenticated (apps/web/src/guards)', () => {
  beforeEach(() => window.localStorage.clear());

  test('shows the screen to a visitor', () => {
    useAuth.mockReturnValue(SIGNED_OUT);
    renderAt('/hy/auth/register');
    expect(
      screen.getByRole('heading', { name: 'Registration form' }),
    ).toBeInTheDocument();
  });

  test('shows a loader, not the form, while the session is restoring', () => {
    useAuth.mockReturnValue({ ...SIGNED_OUT, isBootstrapping: true });
    renderAt('/hy/auth/register');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Registration form')).not.toBeInTheDocument();
  });

  test.each([
    ['a customer', [], [], '/ru/account'],
    ['a partner member', ['CUSTOMER'], PARTNERSHIP, '/ru/partner'],
    ['an admin', ['ADMIN'], [], '/ru/admin'],
    ['a manager', ['MANAGER'], [], '/ru/manager'],
  ])(
    'sends %s to their own workspace instead of offering a second account, keeping the locale',
    (_who, roles, partnerships, expected) => {
      useAuth.mockReturnValue({
        ...SIGNED_OUT,
        isAuthenticated: true,
        roles,
        partnerships,
      });
      renderAt('/ru/auth/register');
      expect(screen.getByText(`at ${expected}`)).toBeInTheDocument();
    },
  );

  test('honours a safe return target but never an off-site one', () => {
    useAuth.mockReturnValue({ ...SIGNED_OUT, isAuthenticated: true });
    const { unmount } = renderAt(
      `/en/auth/register?redirect=${encodeURIComponent('/en/listings/7')}`,
    );
    expect(screen.getByText('at /en/listings/7')).toBeInTheDocument();
    unmount();

    renderAt(
      `/en/auth/register?redirect=${encodeURIComponent('//evil.example')}`,
    );
    expect(screen.getByText('at /en/account')).toBeInTheDocument();
  });

  test('partner registration sends a signed-in customer to the partner application, and a partner to their workspace', () => {
    useAuth.mockReturnValue({ ...SIGNED_OUT, isAuthenticated: true });
    const { unmount } = renderAt('/hy/auth/register', 'partnerStart');
    expect(screen.getByText('at /hy/partner/apply')).toBeInTheDocument();
    unmount();

    useAuth.mockReturnValue({
      ...SIGNED_OUT,
      isAuthenticated: true,
      partnerships: PARTNERSHIP,
    });
    renderAt('/hy/auth/register', 'partnerStart');
    expect(screen.getByText('at /hy/partner')).toBeInTheDocument();
  });
});

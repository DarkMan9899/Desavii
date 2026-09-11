import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthProvider from './AuthProvider.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import * as authApi from '../api/auth.js';
import * as partnersApi from '../api/partners.js';
import { getAccessToken } from '../api/tokenStore.js';

vi.mock('../api/auth.js');
vi.mock('../api/partners.js');

function Consumer() {
  const {
    isAuthenticated,
    isBootstrapping,
    user,
    partnerships,
    login,
    logout,
    refreshUser,
  } = useAuth();
  if (isBootstrapping) return <p>booting</p>;
  return (
    <div>
      <p>{isAuthenticated ? `in:${user.email}` : 'out'}</p>
      <p data-testid="partnerships">
        {partnerships.map((membership) => membership.slug).join(',')}
      </p>
      <button
        type="button"
        onClick={() => login({ email: 'a@b.com', password: 'x' })}
      >
        login
      </button>
      <button type="button" onClick={() => logout()}>
        logout
      </button>
      <button type="button" onClick={() => refreshUser()}>
        refresh
      </button>
    </div>
  );
}

// Clears the `session_hint` cookie the fixed bootstrap effect gates on
// (Sprint L — see `AuthProvider.jsx`'s own header) so tests don't leak
// state into one another via jsdom's shared `document.cookie` jar.
function clearSessionHintCookie() {
  document.cookie =
    'session_hint=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
}

function setSessionHintCookie() {
  document.cookie = 'session_hint=1; path=/';
}

describe('AuthProvider (apps/web/src/providers)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    partnersApi.getMyPartnerships.mockResolvedValue({ data: [] });
    clearSessionHintCookie();
  });

  test('bootstraps to logged-out without calling /auth/refresh when no session_hint cookie exists', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    // No cookie means bootstrap has nothing to await — it resolves
    // synchronously to logged-out, unlike the cookie-present paths below
    // which genuinely pass through a "booting" state.
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
    // The real defect this guards: a logged-out visitor can never have a
    // session, so bootstrap must not fire a network call that can only
    // ever 401.
    expect(authApi.refresh).not.toHaveBeenCalled();
  });

  test('bootstraps to logged-out when the session_hint cookie is present but the refresh call still fails (e.g. an expired/revoked refresh token)', async () => {
    setSessionHintCookie();
    authApi.refresh.mockRejectedValue(new Error('expired session'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });

  test('bootstraps to logged-in via refresh + me when a session exists, also hydrating partnerships', async () => {
    setSessionHintCookie();
    authApi.refresh.mockResolvedValue({ data: { access_token: 'token-1' } });
    authApi.me.mockResolvedValue({
      data: {
        user: { id: 1, email: 'existing@session.com' },
        roles: ['CUSTOMER'],
        permissions: [],
      },
    });
    partnersApi.getMyPartnerships.mockResolvedValue({
      data: [
        { partner_id: 1, slug: 'yerevan-boutique-hospitality', role: 'OWNER' },
      ],
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('in:existing@session.com')).toBeInTheDocument(),
    );
    expect(getAccessToken()).toBe('token-1');
    expect(screen.getByTestId('partnerships')).toHaveTextContent(
      'yerevan-boutique-hospitality',
    );
  });

  test('login() calls POST /auth/login then GET /auth/me and hydrates the session', async () => {
    const user = userEvent.setup();
    authApi.refresh.mockRejectedValue(new Error('no session'));
    authApi.login.mockResolvedValue({
      data: { access_token: 'token-2', user: { id: 2 } },
    });
    authApi.me.mockResolvedValue({
      data: {
        user: { id: 2, email: 'a@b.com' },
        roles: [],
        permissions: [],
      },
    });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() =>
      expect(screen.getByText('in:a@b.com')).toBeInTheDocument(),
    );
    expect(authApi.login).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'x',
    });
    expect(getAccessToken()).toBe('token-2');
  });

  test('logout() clears the session even if the API call fails', async () => {
    const user = userEvent.setup();
    setSessionHintCookie();
    authApi.refresh.mockResolvedValue({ data: { access_token: 'token-3' } });
    authApi.me.mockResolvedValue({
      data: { user: { id: 3, email: 'c@d.com' }, roles: [], permissions: [] },
    });
    authApi.logout.mockRejectedValue(new Error('network error'));

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('in:c@d.com')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    expect(getAccessToken()).toBeNull();
  });

  test('refreshUser() re-fetches /auth/me and updates the session (Phase 8)', async () => {
    const user = userEvent.setup();
    setSessionHintCookie();
    authApi.refresh.mockResolvedValue({ data: { access_token: 'token-4' } });
    authApi.me
      .mockResolvedValueOnce({
        data: {
          user: { id: 4, email: 'stale@example.com' },
          roles: [],
          permissions: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          user: { id: 4, email: 'fresh@example.com' },
          roles: [],
          permissions: [],
        },
      });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText('in:stale@example.com')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() =>
      expect(screen.getByText('in:fresh@example.com')).toBeInTheDocument(),
    );
    expect(authApi.me).toHaveBeenCalledTimes(2);
  });
});

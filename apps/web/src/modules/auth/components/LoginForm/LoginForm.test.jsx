import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LoginForm from './LoginForm.jsx';
import { useLoginMutation } from '../../mutations/useLoginMutation.js';
import { setLastWorkspace } from '../../../../utils/workspacePreference.js';

vi.mock('../../mutations/useLoginMutation.js', () => ({
  useLoginMutation: vi.fn(),
  default: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderForm(initialEntry = '/hy/auth/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/:locale/auth/login" element={<LoginForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submit(user) {
  await user.type(screen.getByLabelText(/Էլ\. փոստ/), 'vendor@travelhub.dev');
  await user.type(screen.getByLabelText(/Գաղտնաբառ/), 'DevVendor!2024');
  await user.click(screen.getByRole('button', { name: 'Մուտք' }));
}

describe('LoginForm role-aware redirect (apps/web/src/modules/auth)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    window.localStorage.clear();
  });

  test('a user with no partnerships is sent to /account', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ partnerships: [], roles: ['CUSTOMER'] });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm();

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/account', {
      replace: true,
    });
  });

  test('a user with partnerships and no stored preference is sent to /partner', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      partnerships: [{ partner_id: 1 }],
      roles: ['CUSTOMER'],
    });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm();

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/partner', {
      replace: true,
    });
  });

  test('a partner user who last chose "customer" is sent to /account', async () => {
    setLastWorkspace('customer');
    const mutateAsync = vi.fn().mockResolvedValue({
      partnerships: [{ partner_id: 1 }],
      roles: ['CUSTOMER'],
    });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm();

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/account', {
      replace: true,
    });
  });

  test('an explicit ?redirect= always wins, even for a partner user', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      partnerships: [{ partner_id: 1 }],
      roles: ['CUSTOMER'],
    });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm('/hy/auth/login?redirect=%2Fhy%2Fpartner%2Flistings');

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/partner/listings', {
      replace: true,
    });
  });

  test('an admin-area role is sent to /admin, ahead of any partnership check', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      partnerships: [{ partner_id: 1 }],
      roles: ['SUPER_ADMIN'],
    });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm();

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/admin', {
      replace: true,
    });
  });

  test('an explicit ?redirect= wins even for an admin-area role', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      partnerships: [],
      roles: ['MODERATOR'],
    });
    useLoginMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm('/hy/auth/login?redirect=%2Fhy%2Faccount%2Fbookings');

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/account/bookings', {
      replace: true,
    });
  });

  test.each([
    ['MANAGER', '/hy/manager'],
    ['MARKETING', '/hy/marketing'],
  ])(
    'a %s user lands on their own workspace, not the customer account',
    async (role, expected) => {
      useLoginMutation.mockReturnValue({
        mutateAsync: vi
          .fn()
          .mockResolvedValue({ partnerships: [], roles: [role] }),
        isPending: false,
        error: null,
      });
      const user = userEvent.setup();
      renderForm();

      await submit(user);

      expect(mockNavigate).toHaveBeenCalledWith(expected, { replace: true });
    },
  );

  test('an off-site ?redirect= is ignored in favour of the role home', async () => {
    useLoginMutation.mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockResolvedValue({ partnerships: [], roles: ['CUSTOMER'] }),
      isPending: false,
      error: null,
    });
    const user = userEvent.setup();
    renderForm(
      `/hy/auth/login?redirect=${encodeURIComponent('//evil.example')}`,
    );

    await submit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/account', {
      replace: true,
    });
  });
});

describe('LoginForm fields and links (apps/web/src/modules/auth)', () => {
  beforeEach(() => {
    useLoginMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    });
  });

  test('the password can be shown and hidden, and both fields keep their password-manager hints', async () => {
    const user = userEvent.setup();
    renderForm();
    const password = screen.getByLabelText(/Գաղտնաբառ/);

    expect(screen.getByLabelText(/Էլ\. փոստ/)).toHaveAttribute(
      'autocomplete',
      'email',
    );
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    await user.type(password, 'DevVendor!2024');
    await user.click(
      screen.getByRole('button', { name: 'Ցույց տալ գաղտնաբառը' }),
    );
    expect(password).toHaveAttribute('type', 'text');
    expect(password).toHaveValue('DevVendor!2024');
    // The toggle is not a submit: the login request was never sent.
    expect(
      useLoginMutation.mock.results.at(-1).value.mutateAsync,
    ).not.toHaveBeenCalled();
  });

  test('"Sign up" is customer registration by default', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'Գրանցվել' })).toHaveAttribute(
      'href',
      '/hy/auth/register',
    );
  });

  test('"Sign up" keeps the partner intent of someone sent here on the way to the partner application', () => {
    renderForm(
      `/ru/auth/login?redirect=${encodeURIComponent('/ru/partner/apply')}`,
    );
    expect(screen.getByRole('link', { name: 'Գրանցվել' })).toHaveAttribute(
      'href',
      '/ru/partner/register',
    );
  });

  test('"Sign up" carries any other in-app return target to customer registration', () => {
    renderForm(
      `/hy/auth/login?redirect=${encodeURIComponent('/hy/listings/5')}`,
    );
    expect(screen.getByRole('link', { name: 'Գրանցվել' })).toHaveAttribute(
      'href',
      `/hy/auth/register?redirect=${encodeURIComponent('/hy/listings/5')}`,
    );
  });
});

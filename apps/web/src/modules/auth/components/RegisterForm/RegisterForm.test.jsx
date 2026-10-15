import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RegisterForm from './RegisterForm.jsx';
import { useRegisterMutation } from '../../mutations/useRegisterMutation.js';

vi.mock('../../mutations/useRegisterMutation.js', () => ({
  useRegisterMutation: vi.fn(),
  default: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const STRONG_PASSWORD = 'Synthetic!Pass2026';

function renderForm(entry, variant = undefined) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/:locale/*" element={<RegisterForm variant={variant} />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user, password = STRONG_PASSWORD) {
  await user.type(screen.getByLabelText(/^Անուն/), 'Ani');
  await user.type(screen.getByLabelText(/^Ազգանուն/), 'Test');
  await user.type(screen.getByLabelText(/^Էլ\. փոստ/), 'ani@example.test');
  await user.type(screen.getByLabelText(/^Գաղտնաբառ/), password);
  await user.click(screen.getByRole('button', { name: 'Ստեղծել հաշիվ' }));
}

describe('RegisterForm (apps/web/src/modules/auth)', () => {
  let mutateAsync;

  beforeEach(() => {
    mockNavigate.mockReset();
    mutateAsync = vi.fn().mockResolvedValue(undefined);
    useRegisterMutation.mockReturnValue({
      mutateAsync,
      isPending: false,
      error: null,
    });
  });

  test('customer registration (navbar "Register") lands on the customer account', async () => {
    const user = userEvent.setup();
    renderForm('/hy/auth/register');

    await fillAndSubmit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/hy/account', {
      replace: true,
    });
  });

  test('customer registration honours an in-app return target and ignores an off-site one', async () => {
    const user = userEvent.setup();
    const { unmount } = renderForm(
      `/ru/auth/register?redirect=${encodeURIComponent('/ru/listings/9')}`,
    );
    await fillAndSubmit(user);
    expect(mockNavigate).toHaveBeenLastCalledWith('/ru/listings/9', {
      replace: true,
    });
    unmount();

    renderForm(
      `/ru/auth/register?redirect=${encodeURIComponent('https://evil.example')}`,
    );
    await fillAndSubmit(user);
    expect(mockNavigate).toHaveBeenLastCalledWith('/ru/account', {
      replace: true,
    });
  });

  test('partner registration (Partner "Start") continues to the partner application, never the customer account', async () => {
    const user = userEvent.setup();
    renderForm(
      `/en/partner/register?redirect=${encodeURIComponent('/en/account')}`,
      'partner',
    );

    await fillAndSubmit(user);

    expect(mockNavigate).toHaveBeenCalledWith('/en/partner/apply', {
      replace: true,
    });
  });

  test('the "Log in" link keeps the partner intent for someone who already has an account', () => {
    const { unmount } = renderForm('/hy/partner/register', 'partner');
    expect(screen.getByRole('link', { name: 'Մուտք գործել' })).toHaveAttribute(
      'href',
      `/hy/auth/login?redirect=${encodeURIComponent('/hy/partner/apply')}`,
    );
    unmount();

    renderForm('/hy/auth/register');
    expect(screen.getByRole('link', { name: 'Մուտք գործել' })).toHaveAttribute(
      'href',
      '/hy/auth/login',
    );
  });

  test('the password can be shown while typing, keeps its new-password hint, and its strength rule still applies', async () => {
    const user = userEvent.setup();
    renderForm('/hy/auth/register');
    const password = screen.getByLabelText(/^Գաղտնաբառ/);

    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/^Էլ\. փոստ/)).toHaveAttribute(
      'autocomplete',
      'email',
    );
    await user.click(
      screen.getByRole('button', { name: 'Ցույց տալ գաղտնաբառը' }),
    );
    expect(password).toHaveAttribute('type', 'text');
    expect(mutateAsync).not.toHaveBeenCalled();

    await fillAndSubmit(user, 'weak');
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveAttribute('type', 'text');
  });
});

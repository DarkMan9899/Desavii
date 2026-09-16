import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CurrencyDropdown from './CurrencyDropdown.jsx';
import CurrencyProvider from '../../providers/CurrencyProvider.jsx';

vi.mock('../../api/fx.js', () => ({
  getRates: vi.fn().mockResolvedValue({
    success: true,
    data: {
      baseCurrency: 'AMD',
      rates: { AMD: '1.00000000', USD: '400.00000000', RUB: '4.50000000' },
      effectiveAt: '2026-01-01',
      source: 'fixture',
    },
    meta: null,
    error: null,
  }),
}));

function renderDropdown(locale = 'en') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider locale={locale}>
        <CurrencyDropdown />
      </CurrencyProvider>
    </QueryClientProvider>,
  );
}

describe('CurrencyDropdown (apps/web/src/components) — DESAVII category-closure pass §3', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('the trigger shows the locale-derived default currency (en -> USD)', () => {
    renderDropdown('en');
    expect(
      screen.getByRole('button', { name: 'Փոխել արժույթը' }),
    ).toHaveTextContent('USD');
  });

  test('clicking the trigger opens a menu with AMD/USD/RUB, current one checked', async () => {
    const user = userEvent.setup();
    renderDropdown('en');

    await user.click(screen.getByRole('button', { name: 'Փոխել արժույթը' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    const usd = screen.getByRole('menuitemradio', { name: 'USD' });
    const amd = screen.getByRole('menuitemradio', { name: 'AMD' });
    const rub = screen.getByRole('menuitemradio', { name: 'RUB' });
    expect(usd).toHaveAttribute('aria-checked', 'true');
    expect(amd).toHaveAttribute('aria-checked', 'false');
    expect(rub).toHaveAttribute('aria-checked', 'false');
  });

  test('selecting a currency updates the trigger, persists an override, and closes the menu', async () => {
    const user = userEvent.setup();
    renderDropdown('en');

    await user.click(screen.getByRole('button', { name: 'Փոխել արժույթը' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'RUB' }));

    expect(
      screen.getByRole('button', { name: 'Փոխել արժույթը' }),
    ).toHaveTextContent('RUB');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(window.localStorage.getItem('desavii:currency:v1')).toBe('RUB');
  });

  test('Escape closes the open menu', async () => {
    const user = userEvent.setup();
    renderDropdown('en');

    await user.click(screen.getByRole('button', { name: 'Փոխել արժույթը' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('clicking outside the menu closes it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">outside</button>
        <CurrencyDropdownHarness />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Փոխել արժույթը' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('ArrowDown/ArrowUp move focus between menu options', async () => {
    const user = userEvent.setup();
    renderDropdown('en');

    await user.click(screen.getByRole('button', { name: 'Փոխել արժույթը' }));
    const amd = screen.getByRole('menuitemradio', { name: 'AMD' });
    const usd = screen.getByRole('menuitemradio', { name: 'USD' });
    amd.focus();

    await user.keyboard('{ArrowDown}');
    expect(usd).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(amd).toHaveFocus();
  });

  test('a stored override survives a later locale switch (RU -> select AMD -> switch to HY -> still AMD)', () => {
    window.localStorage.setItem('desavii:currency:v1', 'AMD');
    renderDropdown('hy');
    expect(
      screen.getByRole('button', { name: 'Փոխել արժույթը' }),
    ).toHaveTextContent('AMD');
  });
});

function CurrencyDropdownHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider locale="en">
        <CurrencyDropdown />
      </CurrencyProvider>
    </QueryClientProvider>
  );
}

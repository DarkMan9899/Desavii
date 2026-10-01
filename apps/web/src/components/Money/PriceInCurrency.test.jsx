import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CurrencyProvider from '../../providers/CurrencyProvider.jsx';
import PriceInCurrency from './PriceInCurrency.jsx';

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

function renderWithCurrency(ui, locale) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider locale={locale}>{ui}</CurrencyProvider>
    </QueryClientProvider>,
  );
}

// Step L6.2H4 — a price is shown in its own currency, never relabelled.
describe('PriceInCurrency', () => {
  test('an AMD price follows the display currency like any other price', async () => {
    renderWithCurrency(
      <PriceInCurrency amount="42000.00" currency="AMD" locale="en" />,
      'en',
    );
    expect(await screen.findByText(/\$105\.00/)).toBeInTheDocument();
  });

  test.each([
    ['USD', '241.00', /\$241\.00/],
    ['EUR', '60.00', /€60\.00/],
    ['RUB', '1500.50', /1,500\.50/],
  ])(
    'a %s price is shown as is, never converted or shown as AMD',
    (currency, amount, shown) => {
      renderWithCurrency(
        <PriceInCurrency amount={amount} currency={currency} locale="en" />,
        'hy',
      );
      expect(screen.getByText(shown)).toBeInTheDocument();
      expect(screen.queryByText(/֏|AMD/)).not.toBeInTheDocument();
    },
  );

  test('carries a suffix', () => {
    render(
      <PriceInCurrency
        amount="60.00"
        currency="EUR"
        locale="en"
        suffix="estimated total"
      />,
    );
    expect(screen.getByText('estimated total')).toBeInTheDocument();
  });
});

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ListingMenuSection from './ListingMenuSection.jsx';
import CurrencyProvider from '../../../../../providers/CurrencyProvider.jsx';

vi.mock('../../../../../api/fx.js', () => ({
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

function renderWithCurrency(ui) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider locale="hy">{ui}</CurrencyProvider>
    </QueryClientProvider>,
  );
}

const MENU = {
  id: 1,
  name: 'Dinner Menu',
  description: 'Served 6pm-11pm',
  is_active: true,
  sections: [
    {
      id: 10,
      title: 'Appetizers',
      items: [
        {
          id: 100,
          title: 'Khinkali (5 pcs)',
          description: 'Hand-folded dumplings.',
          price_amount: 3500,
          price_currency_code: 'AMD',
          dietary_markers: ['spicy'],
          is_active: true,
        },
        {
          id: 101,
          title: 'Retired dish',
          price_amount: 1000,
          price_currency_code: 'AMD',
          dietary_markers: [],
          is_active: false,
        },
      ],
    },
  ],
};

describe('ListingMenuSection (Pass 3 remediation)', () => {
  test('renders nothing when there are no active menus', () => {
    const { container } = renderWithCurrency(<ListingMenuSection menus={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for a menu that itself is inactive', () => {
    const { container } = renderWithCurrency(
      <ListingMenuSection menus={[{ ...MENU, is_active: false }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the menu name, section, and only the active item', () => {
    renderWithCurrency(<ListingMenuSection menus={[MENU]} sectionId="menu" />);
    expect(
      screen.getByRole('heading', { name: 'Մենյու', level: 2 }),
    ).toHaveAttribute('id', 'menu');
    expect(screen.getByText('Dinner Menu')).toBeInTheDocument();
    expect(screen.getByText('Appetizers')).toBeInTheDocument();
    expect(screen.getByText('Khinkali (5 pcs)')).toBeInTheDocument();
    expect(screen.getByText('Կծու')).toBeInTheDocument();
    expect(screen.queryByText('Retired dish')).not.toBeInTheDocument();
  });

  test('omits a section whose every item is inactive', () => {
    const menuWithOnlyInactiveItems = {
      ...MENU,
      sections: [{ ...MENU.sections[0], items: [MENU.sections[0].items[1]] }],
    };
    renderWithCurrency(
      <ListingMenuSection menus={[menuWithOnlyInactiveItems]} />,
    );
    expect(screen.queryByText('Appetizers')).not.toBeInTheDocument();
  });
});

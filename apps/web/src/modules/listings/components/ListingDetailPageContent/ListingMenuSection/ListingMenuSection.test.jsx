import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingMenuSection from './ListingMenuSection.jsx';

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
    const { container } = render(<ListingMenuSection menus={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing for a menu that itself is inactive', () => {
    const { container } = render(
      <ListingMenuSection menus={[{ ...MENU, is_active: false }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders the menu name, section, and only the active item', () => {
    render(<ListingMenuSection menus={[MENU]} sectionId="menu" />);
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
    render(<ListingMenuSection menus={[menuWithOnlyInactiveItems]} />);
    expect(screen.queryByText('Appetizers')).not.toBeInTheDocument();
  });
});

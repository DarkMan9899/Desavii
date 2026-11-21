import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookingItemMenuPreorder from './BookingItemMenuPreorder.jsx';

const SNAPSHOT = {
  lines: [
    {
      menu_item_id: 101,
      title: 'Khorovats',
      quantity: 2,
      line_total_amount: '24000.00',
    },
    // A dish the partner deleted later keeps its snapshot, without an id.
    {
      menu_item_id: null,
      title: '<b>Gata</b>',
      quantity: 1,
      line_total_amount: '1500.00',
    },
  ],
  subtotal_amount: '25500.00',
  currency: 'AMD',
  payment: 'PAY_AT_VENUE',
};

describe('BookingItemMenuPreorder', () => {
  test('a table reservation with no dishes says "Table only"', () => {
    render(
      <BookingItemMenuPreorder
        bookingType="RESTAURANT_RESERVATION"
        item={{ menu_preorder: null }}
        locale="hy"
      />,
    );
    expect(screen.getByText(/Միայն սեղան/)).toBeInTheDocument();
    expect(screen.queryByText('Նախապատվերի գումար')).not.toBeInTheDocument();
  });

  test('a pre-order shows its stored dishes, subtotal and pay-at-venue rule', () => {
    render(
      <BookingItemMenuPreorder
        bookingType="RESTAURANT_RESERVATION"
        item={{ menu_preorder: SNAPSHOT }}
        locale="hy"
      />,
    );
    expect(
      screen.getByText(/Սեղան՝ ճաշատեսակների նախապատվերով/),
    ).toBeInTheDocument();
    expect(screen.getByText('Khorovats')).toBeInTheDocument();
    // Partner-written titles are text, never markup.
    expect(screen.getByText('<b>Gata</b>')).toBeInTheDocument();
    expect(screen.getByText('Նախապատվերի գումար')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Վճարվում է ռեստորանում․ Desavii-ում ոչինչ չի գանձվում։',
      ),
    ).toBeInTheDocument();
  });

  test('renders nothing for any other booking type', () => {
    const { container } = render(
      <BookingItemMenuPreorder
        bookingType="HOTEL_STAY"
        item={{ menu_preorder: null }}
        locale="hy"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

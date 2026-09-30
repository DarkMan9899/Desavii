import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from 'i18next';
import BookingTotal from './BookingTotal.jsx';

// Step L6.2H2B — a new, free restaurant reservation never reads "0 AMD";
// every other booking (including a historical, priced restaurant booking)
// keeps its real stored amount.
function renderTotal(booking) {
  return render(
    <BookingTotal
      booking={booking}
      amount={booking.total_amount}
      currencyCode="AMD"
      suffix="Total"
    />,
  );
}

describe('BookingTotal', () => {
  test.each([
    ['hy', 'Անվճար ամրագրում՝ վճարումը ռեստորանում'],
    ['en', 'Free reservation — pay at the restaurant'],
    ['ru', 'Бесплатное бронирование — оплата в ресторане'],
  ])(
    'a free restaurant reservation shows free-reservation wording (%s)',
    async (lng, label) => {
      await i18n.changeLanguage(lng);
      try {
        renderTotal({
          booking_type: 'RESTAURANT_RESERVATION',
          total_amount: '0.00',
        });
        expect(screen.getByText(label)).toBeInTheDocument();
        expect(screen.queryByText(/AMD|֏/)).not.toBeInTheDocument();
      } finally {
        await i18n.changeLanguage('hy');
      }
    },
  );

  test('a historical restaurant booking keeps its stored amount — history is never hidden', () => {
    renderTotal({
      booking_type: 'RESTAURANT_RESERVATION',
      total_amount: '6500.00',
    });
    expect(screen.getByText(/6,?500/)).toBeInTheDocument();
    expect(
      screen.queryByText('Անվճար ամրագրում՝ վճարումը ռեստորանում'),
    ).not.toBeInTheDocument();
  });

  test('any other booking shows its amount', () => {
    renderTotal({
      booking_type: 'HOTEL_ROOM_BOOKING',
      total_amount: '85000.00',
    });
    expect(screen.getByText(/85,?000/)).toBeInTheDocument();
  });
});

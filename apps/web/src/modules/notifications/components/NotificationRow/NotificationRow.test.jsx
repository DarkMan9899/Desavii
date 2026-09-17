import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotificationRow from './NotificationRow.jsx';

function renderRow(notification, overrides = {}) {
  return render(
    <MemoryRouter initialEntries={['/hy']}>
      <Routes>
        <Route
          path="/:locale"
          element={
            <ul>
              <NotificationRow
                notification={notification}
                audience={overrides.audience}
                onMarkRead={overrides.onMarkRead ?? vi.fn()}
                onArchive={overrides.onArchive ?? vi.fn()}
                onDelete={overrides.onDelete ?? vi.fn()}
              />
            </ul>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const BASE_NOTIFICATION = {
  id: 1,
  event_type: 'booking.confirmed',
  category: 'BOOKING',
  payload: { bookingReference: 'BK-42' },
  is_read: false,
  is_archived: false,
  created_at: new Date().toISOString(),
};

describe('NotificationRow (apps/web/src/modules/notifications)', () => {
  test('renders the mapped copy for a known event type', () => {
    renderRow(BASE_NOTIFICATION);
    expect(screen.getByText(/BK-42/)).toBeInTheDocument();
  });

  test('an unrecognized event type never renders its raw code in the DOM', () => {
    const { container } = renderRow({
      ...BASE_NOTIFICATION,
      event_type: 'inventory.hold_expired',
      category: 'PARTNER',
      payload: { holdId: 55 },
    });
    expect(container.textContent).not.toContain('inventory.hold_expired');
    expect(screen.getByText('Դուք ունեք նոր ծանուցում')).toBeInTheDocument();
  });

  test('renders an unread indicator only when unread', () => {
    const { rerender } = renderRow(BASE_NOTIFICATION);
    expect(screen.getByLabelText('Չկարդացած')).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/hy']}>
        <Routes>
          <Route
            path="/:locale"
            element={
              <ul>
                <NotificationRow
                  notification={{ ...BASE_NOTIFICATION, is_read: true }}
                  onMarkRead={vi.fn()}
                  onArchive={vi.fn()}
                  onDelete={vi.fn()}
                />
              </ul>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByLabelText('Չկարդացած')).not.toBeInTheDocument();
  });

  test('renders admin.announcement payload as raw text, not a translation lookup', () => {
    renderRow({
      ...BASE_NOTIFICATION,
      event_type: 'admin.announcement',
      category: 'ADMIN',
      payload: { title: 'Scheduled maintenance', body: 'Tonight at 2am.' },
    });
    expect(screen.getByText('Scheduled maintenance')).toBeInTheDocument();
    expect(screen.getByText(/Tonight at 2am\./)).toBeInTheDocument();
  });

  test('calls onMarkRead when the mark-as-read action is clicked', () => {
    const onMarkRead = vi.fn();
    renderRow(BASE_NOTIFICATION, { onMarkRead });
    screen.getByRole('button', { name: 'Նշել որպես կարդացած' }).click();
    expect(onMarkRead).toHaveBeenCalledWith(1);
  });

  test('calls onDelete when the delete action is clicked', () => {
    const onDelete = vi.fn();
    renderRow(BASE_NOTIFICATION, { onDelete });
    screen.getByRole('button', { name: 'Ջնջել' }).click();
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  test('does not show an archive action for an already-archived notification', () => {
    renderRow({ ...BASE_NOTIFICATION, is_archived: true });
    expect(
      screen.queryByRole('button', { name: 'Արխիվացնել' }),
    ).not.toBeInTheDocument();
  });

  test('P2.2E: a BOOKING_* notification (resource_type/resource_id) links to the audience-correct booking detail page', () => {
    renderRow(
      {
        ...BASE_NOTIFICATION,
        resource_type: 'booking',
        resource_id: 42,
      },
      { audience: 'partner' },
    );
    const link = screen.getByRole('link', { name: /BK-42/ });
    expect(link).toHaveAttribute('href', '/hy/partner/bookings/42');
  });

  test('P2.2E: a PAYMENT_* notification (payload.bookingId, resource_type "payment") links to the correct booking, not the payment', () => {
    renderRow({
      ...BASE_NOTIFICATION,
      event_type: 'payment.succeeded',
      category: 'PAYMENT',
      resource_type: 'payment',
      resource_id: 999,
      payload: { paymentReference: 'PAY-1', bookingId: 42, totalAmount: '1' },
    });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/hy/account/bookings/42');
  });

  test('P2.2E: a non-booking notification (no resource_type/bookingId) stays a plain, non-navigable row', () => {
    renderRow({
      ...BASE_NOTIFICATION,
      event_type: 'review.submitted',
      category: 'REVIEW',
      resource_type: 'review',
      resource_id: 7,
      payload: { listingId: 3, rating: 5 },
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  test('P2.2E: defaults to the customer booking route when no audience prop is given', () => {
    renderRow({
      ...BASE_NOTIFICATION,
      resource_type: 'booking',
      resource_id: 42,
    });
    const link = screen.getByRole('link', { name: /BK-42/ });
    expect(link).toHaveAttribute('href', '/hy/account/bookings/42');
  });

  test('Listing Lifetime / Renewal, Step B6: a listing.expiring_soon notification links to the Partner listings list page, not a per-listing id', () => {
    renderRow({
      ...BASE_NOTIFICATION,
      event_type: 'listing.expiring_soon',
      category: 'LISTING',
      payload: { listingId: 9, listingTitle: 'Sunset Vanadzor Apartment' },
    });
    const link = screen.getByRole('link', {
      name: /Sunset Vanadzor Apartment/,
    });
    expect(link).toHaveAttribute('href', '/hy/partner/listings');
  });
});

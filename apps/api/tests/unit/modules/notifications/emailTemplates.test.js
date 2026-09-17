import { describe, test, expect } from '@jest/globals';
import { renderEmail } from '../../../../src/modules/notifications/channels/emailTemplates.js';

describe('renderEmail', () => {
  test('renders a known event type with interpolated payload fields', () => {
    const { subject, body } = renderEmail('booking.confirmed', {
      bookingReference: 'BK-42',
    });
    expect(subject).toBe('Booking confirmed');
    expect(body).toContain('BK-42');
  });

  test('renders admin.announcement using the payload title/body directly', () => {
    const { subject, body } = renderEmail('admin.announcement', {
      title: 'Scheduled maintenance',
      body: 'Tonight at 2am.',
    });
    expect(subject).toBe('Scheduled maintenance');
    expect(body).toBe('Tonight at 2am.');
  });

  test('falls back to a generic rendering for an unknown event type', () => {
    const { subject, body } = renderEmail('payment.refunded', { amount: 10 });
    expect(subject).toBe('Notification');
    expect(body).toContain('payment.refunded');
  });

  test('(P0.3) renders a known event type in hy when locale is "hy"', () => {
    const { subject, body } = renderEmail(
      'booking.confirmed',
      { bookingReference: 'BK-42' },
      'hy',
    );
    expect(subject).toBe('Ամրագրումը հաստատվել է');
    expect(body).toContain('BK-42');
  });

  test('(P0.3) renders a known event type in ru when locale is "ru"', () => {
    const { subject, body } = renderEmail(
      'booking.confirmed',
      { bookingReference: 'BK-42' },
      'ru',
    );
    expect(subject).toBe('Бронирование подтверждено');
    expect(body).toContain('BK-42');
  });

  test('(P0.3) falls back to en for a locale with no translation for a given event', () => {
    const { subject } = renderEmail(
      'booking.confirmed',
      { bookingReference: 'BK-42' },
      'fr',
    );
    expect(subject).toBe('Booking confirmed');
  });

  describe('P2.2E — payment/refund lifecycle emails no longer fall through to the generic JSON dump', () => {
    const PAYLOAD = {
      succeeded: {
        paymentReference: 'PAY-1',
        bookingId: 42,
        totalAmount: '150.00',
        currency: 'AMD',
      },
      failed: {
        paymentReference: 'PAY-2',
        bookingId: 42,
        failureCode: 'CARD_DECLINED',
      },
      refunded: {
        refundReference: 'REF-1',
        bookingId: 42,
        amount: '75.00',
        currency: 'AMD',
      },
    };

    test.each(['en', 'hy', 'ru'])(
      'payment.succeeded renders a real, localized subject/body with amount, currency, and a booking link (%s)',
      (locale) => {
        const { subject, body } = renderEmail(
          'payment.succeeded',
          PAYLOAD.succeeded,
          locale,
        );
        expect(subject).not.toBe('Notification');
        expect(body).not.toContain('{"');
        expect(body).toContain('150.00');
        expect(body).toContain('AMD');
        expect(body).toContain('/account/bookings/42');
      },
    );

    test.each(['en', 'hy', 'ru'])(
      'payment.failed renders a real, localized subject/body identifying the booking (%s)',
      (locale) => {
        const { subject, body } = renderEmail(
          'payment.failed',
          PAYLOAD.failed,
          locale,
        );
        expect(subject).not.toBe('Notification');
        expect(body).not.toContain('{"');
        expect(body).toContain('42');
        expect(body).toContain('/account/bookings/42');
      },
    );

    test.each(['en', 'hy', 'ru'])(
      'refund.succeeded renders a real, localized subject/body with amount, currency, and a booking link (%s)',
      (locale) => {
        const { subject, body } = renderEmail(
          'refund.succeeded',
          PAYLOAD.refunded,
          locale,
        );
        expect(subject).not.toBe('Notification');
        expect(body).not.toContain('{"');
        expect(body).toContain('75.00');
        expect(body).toContain('AMD');
        expect(body).toContain('/account/bookings/42');
      },
    );

    test('omits the booking link, without throwing, when bookingId is missing', () => {
      const { subject, body } = renderEmail('payment.succeeded', {
        paymentReference: 'PAY-3',
        totalAmount: '10.00',
        currency: 'AMD',
      });
      expect(subject).toBe('Payment received');
      expect(body).not.toContain('/account/bookings/');
    });
  });

  describe('Listing Lifetime / Renewal, Step B6 — listing.expiring_soon', () => {
    const PAYLOAD = {
      listingTitle: 'Sunset Vanadzor Apartment',
      expiresAt: '2027-03-01T16:21:42.457Z',
    };

    test.each(['en', 'hy', 'ru'])(
      'renders a real, localized subject/body identifying the listing and its expiry date, with a renewal link (%s)',
      (locale) => {
        const { subject, body } = renderEmail(
          'listing.expiring_soon',
          PAYLOAD,
          locale,
        );
        expect(subject).not.toBe('Notification');
        expect(body).not.toContain('{"');
        expect(body).toContain('Sunset Vanadzor Apartment');
        expect(body).toContain('2027-03-01');
        expect(body).toContain(`/${locale}/partner/listings`);
      },
    );

    test('never claims urgency language ("last chance", "act now") in any locale', () => {
      for (const locale of ['en', 'hy', 'ru']) {
        const { body } = renderEmail('listing.expiring_soon', PAYLOAD, locale);
        expect(body.toLowerCase()).not.toContain('last chance');
        expect(body.toLowerCase()).not.toContain('act now');
      }
    });

    test('renders a blank-safe title rather than throwing when listingTitle is missing', () => {
      const { subject, body } = renderEmail('listing.expiring_soon', {
        expiresAt: PAYLOAD.expiresAt,
      });
      expect(subject).not.toBe('Notification');
      expect(body).not.toContain('undefined');
    });
  });
});

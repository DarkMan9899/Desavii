import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookingPaymentSection from './BookingPaymentSection.jsx';
import { usePaymentsForBookingQuery } from '../../queries/usePaymentsForBookingQuery.js';
import { usePaymentQuery } from '../../queries/usePaymentQuery.js';
import { usePaymentsConfigQuery } from '../../queries/usePaymentsConfigQuery.js';

vi.mock('../../queries/usePaymentsForBookingQuery.js', () => ({
  usePaymentsForBookingQuery: vi.fn(),
}));
vi.mock('../../queries/usePaymentQuery.js', () => ({
  usePaymentQuery: vi.fn(),
}));
vi.mock('../../queries/usePaymentsConfigQuery.js', () => ({
  usePaymentsConfigQuery: vi.fn(),
}));
vi.mock('../PayNowPanel/PayNowPanel.jsx', () => ({
  default: () => <div>PayNowPanel</div>,
}));
vi.mock('../StripeCheckoutPanel/StripeCheckoutPanel.jsx', () => ({
  default: () => <div>StripeCheckoutPanel</div>,
}));
vi.mock('../PaymentSummaryCard/PaymentSummaryCard.jsx', () => ({
  default: () => <div>PaymentSummaryCard</div>,
}));

const BOOKING = { id: 7 };

describe('BookingPaymentSection (apps/web/src/modules/payments)', () => {
  beforeEach(() => {
    usePaymentsForBookingQuery.mockReset();
    usePaymentQuery.mockReset();
    usePaymentQuery.mockReturnValue({ data: undefined });
    usePaymentsConfigQuery.mockReset();
    usePaymentsConfigQuery.mockReturnValue({
      data: { enabled: true, provider: 'local' },
    });
  });

  test('renders nothing while the booking is not yet resolved', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(<BookingPaymentSection booking={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing on a fetch error (supplementary, must not block the page)', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });
    const { container } = render(<BookingPaymentSection booking={BOOKING} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders PayNowPanel when no payment exists yet and readOnly is false', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BookingPaymentSection booking={BOOKING} />);
    expect(screen.getByText('PayNowPanel')).toBeInTheDocument();
  });

  test('renders nothing (not PayNowPanel) when no payment exists yet and readOnly is true', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    const { container } = render(
      <BookingPaymentSection booking={BOOKING} readOnly />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('treats every existing payment as retryable when all are FAILED/CANCELLED', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [
        { id: 1, status: 'FAILED' },
        { id: 2, status: 'CANCELLED' },
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<BookingPaymentSection booking={BOOKING} />);
    expect(screen.getByText('PayNowPanel')).toBeInTheDocument();
  });

  test('renders PaymentSummaryCard once an active payment exists and its detail has loaded', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [{ id: 3, status: 'SUCCEEDED' }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentQuery.mockReturnValue({ data: { id: 3, status: 'SUCCEEDED' } });
    render(<BookingPaymentSection booking={BOOKING} />);
    expect(screen.getByText('PaymentSummaryCard')).toBeInTheDocument();
  });

  test('go-live sequencing: renders a disabled notice instead of PayNowPanel when payments are not enabled', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentsConfigQuery.mockReturnValue({ data: { enabled: false } });
    render(<BookingPaymentSection booking={BOOKING} />);
    expect(screen.queryByText('PayNowPanel')).not.toBeInTheDocument();
    expect(
      screen.getByText('Առցանց վճարումները դեռ հասանելի չեն'),
    ).toBeInTheDocument();
  });

  test('go-live sequencing: renders nothing (never guesses) while the payments-config fetch is still pending — avoids ever showing the wrong "Pay Now" control', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentsConfigQuery.mockReturnValue({ data: undefined });
    const { container } = render(<BookingPaymentSection booking={BOOKING} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('go-live sequencing: renders StripeCheckoutPanel (never PayNowPanel) when the active provider is stripe', async () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentsConfigQuery.mockReturnValue({
      data: {
        enabled: true,
        provider: 'stripe',
        stripe_publishable_key: 'pk_test_dummy',
      },
    });
    render(<BookingPaymentSection booking={BOOKING} />);
    // StripeCheckoutPanel is now React.lazy()-loaded (2026 SEO/performance
    // audit fix to keep Stripe out of the shared chunk on non-payment
    // pages), so it resolves behind a Suspense boundary instead of
    // rendering synchronously.
    expect(await screen.findByText('StripeCheckoutPanel')).toBeInTheDocument();
    expect(screen.queryByText('PayNowPanel')).not.toBeInTheDocument();
  });

  test('go-live sequencing: PAYMENTS_ENABLED=true with Stripe selected but no publishable key configured fails safely and clearly, instead of rendering a broken checkout control', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentsConfigQuery.mockReturnValue({
      data: { enabled: true, provider: 'stripe', stripe_publishable_key: null },
    });
    render(<BookingPaymentSection booking={BOOKING} />);
    expect(screen.queryByText('StripeCheckoutPanel')).not.toBeInTheDocument();
    expect(screen.queryByText('PayNowPanel')).not.toBeInTheDocument();
    expect(
      screen.getByText('Վճարումները ժամանակավորապես անհասանելի են'),
    ).toBeInTheDocument();
  });

  test('renders nothing while the active payment detail is still loading', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [{ id: 3, status: 'PROCESSING' }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentQuery.mockReturnValue({ data: undefined });
    const { container } = render(<BookingPaymentSection booking={BOOKING} />);
    expect(container).toBeEmptyDOMElement();
  });

  // Step L6.2H2B: the server's `payment_required` decides — a restaurant
  // reservation never gets a Pay Now control, even with payments enabled
  // (local or Stripe), while an existing payment still renders as history.
  test.each(['local', 'stripe'])(
    'renders no Pay Now control for a booking that does not require payment (%s provider)',
    (provider) => {
      usePaymentsForBookingQuery.mockReturnValue({
        data: [],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      });
      usePaymentsConfigQuery.mockReturnValue({
        data: { enabled: true, provider, stripe_publishable_key: 'pk_test' },
      });
      const { container } = render(
        <BookingPaymentSection booking={{ id: 9, payment_required: false }} />,
      );
      expect(container).toBeEmptyDOMElement();
    },
  );

  test('still renders a historical payment for a booking that no longer requires payment', () => {
    usePaymentsForBookingQuery.mockReturnValue({
      data: [{ id: 5, status: 'SUCCEEDED' }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    usePaymentQuery.mockReturnValue({ data: { id: 5, status: 'SUCCEEDED' } });
    render(
      <BookingPaymentSection booking={{ id: 9, payment_required: false }} />,
    );
    expect(screen.getByText('PaymentSummaryCard')).toBeInTheDocument();
  });
});

/**
 * BookingPaymentSection — the orchestrator embedded into a booking-detail
 * page (customer/partner/admin). Decides between a "Pay Now" control (no
 * payment yet, or the only ones on record are terminally FAILED/
 * CANCELLED — the customer may try again) and `PaymentSummaryCard` (an
 * active or succeeded payment exists). `readOnly` hides the "Pay Now"
 * control entirely for the partner/admin views, where paying is never the
 * viewer's own action.
 *
 * The "Pay Now" control itself is provider-dependent — `PayNowPanel`'s
 * local "simulate an outcome" control only ever makes sense against
 * `LocalPaymentProvider`; a real provider (Stripe) renders
 * `StripeCheckoutPanel`'s real Elements checkout instead. `provider`
 * (from `GET /payments/config`, alongside `enabled`) decides which,
 * without this component — or anything downstream — ever needing to load
 * Stripe.js when it isn't the active provider (go-live sequencing).
 *
 * Renders nothing while loading (the parent page's own Skeleton already
 * covers the loading state) and nothing on a genuine fetch error (a
 * payment section is supplementary, not the page's primary content —
 * failing to load it should never block the rest of the booking detail
 * page from rendering).
 */

import { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Alert, Skeleton } from '@desavii/ui/components/feedback-overlays';
import { usePaymentsForBookingQuery } from '../../queries/usePaymentsForBookingQuery.js';
import { usePaymentsConfigQuery } from '../../queries/usePaymentsConfigQuery.js';
import PayNowPanel from '../PayNowPanel/PayNowPanel.jsx';
import PaymentSummaryCard from '../PaymentSummaryCard/PaymentSummaryCard.jsx';
import { usePaymentQuery } from '../../queries/usePaymentQuery.js';

// 2026 SEO/performance audit: a real, measured bug — this file's own
// static `import StripeCheckoutPanel from '../StripeCheckoutPanel/...'`
// (what used to be here) bundled the entire Stripe SDK into whatever
// chunk THIS file landed in, regardless of whether the `provider ===
// 'stripe'` branch below is ever actually taken at runtime. A
// `manualChunks` override could isolate the SDK into its own file, but a
// real browser network capture proved that file still got fetched on
// Home/Category/Listing Detail — Rollup's own module graph needed a few
// of this chunk's re-exported bindings, which forced a static
// cross-chunk import back from the shared chunk. `React.lazy` is the
// correct, idiomatic fix: it makes the browser's fetch of this subtree
// conditional on the component actually being rendered, not just
// imported, with no manual chunk-graph fighting required.
const StripeCheckoutPanel = lazy(
  () => import('../StripeCheckoutPanel/StripeCheckoutPanel.jsx'),
);

// A booking is payable again once every existing payment for it has
// reached a terminal, non-successful state — mirrors
// `isActivePaymentStatus` in `core/domain/paymentStatusTransitions.js`.
const TERMINAL_NON_SUCCESS_STATUSES = ['FAILED', 'CANCELLED'];

export default function BookingPaymentSection({
  booking = null,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const paymentsQuery = usePaymentsForBookingQuery(booking?.id);
  // Go-live sequencing: the marketplace can launch with online payments
  // switched off, and/or with a real provider selected
  // (`PaymentService#createPaymentIntent`/`#createRefund` enforce
  // "disabled" server-side regardless — this is purely a UX gate, never
  // the actual guard). Unlike `paymentsQuery` below, this one is NOT
  // defaulted-open on pending/error: guessing the wrong `provider` here
  // would render the WRONG "Pay Now" control (e.g. the local
  // simulate-outcome UI against a real Stripe backend, which would create
  // a real PaymentIntent this component then has no Elements form to
  // confirm) — worse than the brief blank the existing "supplementary,
  // never blocks the page" precedent already accepts elsewhere in this
  // component.
  const paymentsConfigQuery = usePaymentsConfigQuery();
  const paymentsConfig = paymentsConfigQuery.data;
  const payments = paymentsQuery.data ?? [];
  const activePayment = payments.find(
    (payment) => !TERMINAL_NON_SUCCESS_STATUSES.includes(payment.status),
  );
  // The summary list omits `attempts`/`transactions`/nested `refunds` —
  // fetch the single-payment detail shape once an active payment id is
  // known, so `PaymentSummaryCard` always has the full breakdown.
  const paymentDetailQuery = usePaymentQuery(activePayment?.id);

  if (paymentsQuery.isPending || !booking) return null;
  if (paymentsQuery.isError) return null;

  if (!activePayment) {
    if (readOnly) return null;
    // Step L6.2H2B: the server decides whether a booking can take payment
    // at all (never a restaurant reservation or a zero total) — no Pay Now
    // control then. An existing payment above still renders as history.
    if (booking.payment_required === false) return null;
    if (!paymentsConfig) return null;
    if (!paymentsConfig.enabled) {
      return (
        <Alert variant="info" title={t('payments.payNow.disabled.title')}>
          {t('payments.payNow.disabled.description')}
        </Alert>
      );
    }
    if (paymentsConfig.provider === 'stripe') {
      // Go-live sequencing: PAYMENTS_ENABLED=true with Stripe selected but
      // no publishable key configured must fail safely and clearly, never
      // silently render a broken/unusable checkout control.
      if (!paymentsConfig.stripe_publishable_key) {
        return (
          <Alert
            variant="danger"
            title={t('payments.payNow.configError.title')}
          >
            {t('payments.payNow.configError.description')}
          </Alert>
        );
      }
      return (
        <Suspense fallback={<Skeleton variant="rect" height={180} />}>
          <StripeCheckoutPanel
            booking={booking}
            stripePublishableKey={paymentsConfig.stripe_publishable_key}
            onPaid={() => paymentsQuery.refetch()}
          />
        </Suspense>
      );
    }
    return (
      <PayNowPanel booking={booking} onPaid={() => paymentsQuery.refetch()} />
    );
  }

  if (!paymentDetailQuery.data) return null;
  return <PaymentSummaryCard payment={paymentDetailQuery.data} />;
}

BookingPaymentSection.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- the booking DTO shape is large and API-owned
  booking: PropTypes.object,
  readOnly: PropTypes.bool,
};

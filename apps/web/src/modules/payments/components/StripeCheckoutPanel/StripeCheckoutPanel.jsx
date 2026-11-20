/**
 * StripeCheckoutPanel — the Stripe counterpart to `PayNowPanel` (which
 * stays local-provider-only; its "simulate an outcome" control has no
 * meaning against a real provider). Mirrors its button-first shape: a
 * "Pay Now" click is what actually creates the PaymentIntent
 * (`POST /payments`, never eagerly on mount) — go-live sequencing
 * requires never initializing Stripe.js, and never creating a real,
 * booking-blocking payment row (`findActiveForBooking`'s guard), before
 * the customer has actually committed to paying. Only once a
 * `client_secret` comes back does `getStripe` ever get called and
 * `<Elements>`/`<PaymentElement>` ever get mounted.
 *
 * Backend remains the sole source of truth for amount/currency/booking
 * identity throughout: this component never sends an amount anywhere —
 * `POST /payments` takes only `bookingId`, and the PaymentIntent Stripe
 * actually charges was created server-side from the booking's own
 * `totalAmount`/`currencyCode` (`PaymentService#createPaymentIntent`).
 *
 * Also owns the SCA/3DS redirect-return case: if the confirmation
 * challenge required leaving the page, Stripe appends
 * `payment_intent_client_secret` (among others) to `return_url` on the
 * way back — this checks for that on mount, resolves the real outcome via
 * `stripe.retrievePaymentIntent`, and strips the query params so a
 * refresh doesn't re-process the same return.
 */

import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Elements } from '@stripe/react-stripe-js';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { PriceTag } from '@desavii/ui/components/data-display';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useCreatePaymentMutation } from '../../mutations/useCreatePaymentMutation.js';
import { getStripe } from '../../stripe/getStripe.js';
import StripeConfirmForm from './StripeConfirmForm.jsx';

const AUTHORIZED_INTENT_STATUSES = new Set(['requires_capture', 'succeeded']);

export default function StripeCheckoutPanel({
  booking,
  stripePublishableKey,
  onPaid = undefined,
}) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const createPaymentMutation = useCreatePaymentMutation();
  const [clientSecret, setClientSecret] = useState(null);
  const returnUrl = window.location.href.split('?')[0];
  // Only ever resolves to a real value once a `client_secret` actually
  // exists (go-live sequencing: never initialize Stripe.js before the
  // customer has committed to paying) — `getStripe` is itself memoized
  // per key, so this never re-triggers a real script load on a later
  // re-render.
  const stripePromise = useMemo(
    () => (clientSecret ? getStripe(stripePublishableKey) : null),
    [clientSecret, stripePublishableKey],
  );

  function handleOutcome(intentStatus) {
    if (AUTHORIZED_INTENT_STATUSES.has(intentStatus)) {
      showToast(t('payments.payNow.authorizedToast'), { variant: 'success' });
      onPaid?.();
    } else if (intentStatus === 'processing') {
      showToast(t('payments.payNow.processingToast'), { variant: 'info' });
      onPaid?.();
    } else {
      showToast(t('payments.payNow.declinedToast'), { variant: 'danger' });
    }
  }

  // SCA/3DS redirect-return handling — see header comment. Deliberately
  // independent of the "Pay Now" flow below: a full-page redirect
  // challenge remounts this component fresh (`clientSecret` state reset
  // to `null`), so this can't wait for the checkout flow's own
  // `getStripe` call — it loads Stripe.js itself, but ONLY when the URL
  // actually shows a returning redirect, never unconditionally on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedSecret = params.get('payment_intent_client_secret');
    if (!returnedSecret) return undefined;

    let cancelled = false;
    (async () => {
      const stripe = await getStripe(stripePublishableKey);
      if (!stripe || cancelled) return;
      const { paymentIntent } =
        await stripe.retrievePaymentIntent(returnedSecret);
      if (cancelled) return;
      handleOutcome(paymentIntent?.status);

      const url = new URL(window.location.href);
      url.searchParams.delete('payment_intent');
      url.searchParams.delete('payment_intent_client_secret');
      url.searchParams.delete('redirect_status');
      window.history.replaceState({}, '', url.toString());
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once against the URL present at mount
  }, []);

  async function handleStart() {
    try {
      const { data } = await createPaymentMutation.mutateAsync({
        bookingId: booking.id,
      });
      setClientSecret(data.client_secret);
    } catch {
      showToast(t('payments.payNow.errorToast'), { variant: 'danger' });
    }
  }

  if (!clientSecret) {
    return (
      <Card as="div" padding="lg">
        <Stack gap="4">
          <Inline gap="3" align="center" justify="space-between">
            <h2>{t('payments.payNow.heading')}</h2>
            <PriceTag
              locale={i18n.language}
              amount={booking.total_amount}
              currencyCode={booking.currency}
            />
          </Inline>
          <Inline gap="3">
            <Button
              variant="primary"
              onClick={() => handleStart()}
              loading={createPaymentMutation.isPending}
            >
              {t('payments.payNow.action')}
            </Button>
          </Inline>
        </Stack>
      </Card>
    );
  }

  return (
    <Card as="div" padding="lg">
      <Stack gap="4">
        <Inline gap="3" align="center" justify="space-between">
          <h2>{t('payments.payNow.heading')}</h2>
          <PriceTag
            locale={i18n.language}
            amount={booking.total_amount}
            currencyCode={booking.currency}
          />
        </Inline>
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <StripeConfirmForm
            returnUrl={returnUrl}
            onOutcome={(status) => handleOutcome(status)}
          />
        </Elements>
      </Stack>
    </Card>
  );
}

StripeCheckoutPanel.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- the booking DTO shape is large and API-owned
  booking: PropTypes.object.isRequired,
  stripePublishableKey: PropTypes.string.isRequired,
  onPaid: PropTypes.func,
};

/**
 * PayNowPanel — the customer-facing "Pay Now" CTA on a booking that has
 * no active/succeeded payment yet. Clearly labeled as a simulated
 * Development/Demo payment (Phase 16 spec §5/§20 — "no fake credit-card
 * form that suggests real card processing if no real provider is
 * connected"): rather than a fake card-number input, the demo control is
 * an honest "simulate an outcome" selector, since that IS what actually
 * happens server-side against `LocalPaymentProvider`.
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import { PriceTag } from '@desavii/ui/components/data-display';
import { useToast } from '../../../../contexts/ToastContext.jsx';
import { useCreatePaymentMutation } from '../../mutations/useCreatePaymentMutation.js';
import SimulatedPaymentNotice from '../SimulatedPaymentNotice/SimulatedPaymentNotice.jsx';

const SCENARIOS = ['SUCCESS', 'DECLINE', 'PROCESSING'];

export default function PayNowPanel({ booking, onPaid = undefined }) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const [scenario, setScenario] = useState('SUCCESS');
  const createPaymentMutation = useCreatePaymentMutation();

  const scenarioOptions = SCENARIOS.map((code) => ({
    value: code,
    label: t(`payments.payNow.scenario.${code}`),
  }));

  async function handlePay() {
    try {
      const { data } = await createPaymentMutation.mutateAsync({
        bookingId: booking.id,
        simulateScenario: scenario,
      });
      // Manual capture: a checkout attempt normally resolves to AUTHORIZED
      // (funds held, captured only once the vendor accepts the booking).
      // SUCCEEDED is still possible — a booking that was already CONFIRMED
      // before checkout is captured immediately (see `PaymentService
      // #createPaymentIntent`'s own comment).
      if (data.status === 'AUTHORIZED') {
        showToast(t('payments.payNow.authorizedToast'), {
          variant: 'success',
        });
      } else if (data.status === 'SUCCEEDED') {
        showToast(t('payments.payNow.successToast'), { variant: 'success' });
      } else if (data.status === 'FAILED') {
        showToast(t('payments.payNow.declinedToast'), { variant: 'danger' });
      } else {
        showToast(t('payments.payNow.processingToast'), { variant: 'info' });
      }
      onPaid?.();
    } catch {
      showToast(t('payments.payNow.errorToast'), { variant: 'danger' });
    }
  }

  return (
    <Card as="div" padding="lg">
      <Stack gap="4">
        <SimulatedPaymentNotice />

        <Inline gap="3" align="center" justify="space-between">
          <h2>{t('payments.payNow.heading')}</h2>
          <PriceTag
            locale={i18n.language}
            amount={booking.total_amount}
            currencyCode={booking.currency}
          />
        </Inline>

        <Select
          label={t('payments.payNow.scenarioLabel')}
          ariaLabel={t('payments.payNow.scenarioLabel')}
          options={scenarioOptions}
          value={scenario}
          onChange={setScenario}
        />

        <Inline gap="3">
          <Button
            variant="primary"
            onClick={() => handlePay()}
            loading={createPaymentMutation.isPending}
          >
            {t('payments.payNow.action')}
          </Button>
        </Inline>
      </Stack>
    </Card>
  );
}

PayNowPanel.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- the booking DTO shape is large and API-owned
  booking: PropTypes.object.isRequired,
  onPaid: PropTypes.func,
};

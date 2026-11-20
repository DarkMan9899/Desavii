/**
 * PaymentSummaryCard — the read-only payment status/breakdown/refund-
 * history panel, shared by the customer booking-detail page, the partner
 * booking-detail page, and the admin payment detail page (three call
 * sites, one component — same "shared panel, not three re-implementations"
 * rule `BookingDetailPageContent`'s own header comment establishes for
 * its Card sections).
 *
 * Reads only fields already on the `payment` DTO
 * (`apps/api/src/modules/payments/dto/paymentDto.js`) — never computes a
 * total or a refundable amount client-side (`PriceTag`'s own "renders
 * truth, does not compute it" rule, extended to this whole card).
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Card } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { PriceTag } from '@desavii/ui/components/data-display';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import PaymentStatusBadge from '../PaymentStatusBadge/PaymentStatusBadge.jsx';
import SimulatedPaymentNotice from '../SimulatedPaymentNotice/SimulatedPaymentNotice.jsx';

export default function PaymentSummaryCard({ payment }) {
  const { t, i18n } = useTranslation();
  const dateFormatter = createDateFormatter(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Card as="div" padding="lg">
      <Stack gap="4">
        {payment.is_simulated && <SimulatedPaymentNotice />}

        <Inline gap="3" align="center" justify="space-between">
          <PaymentStatusBadge status={payment.status} />
          <PriceTag
            locale={i18n.language}
            amount={payment.total_amount}
            currencyCode={payment.currency}
            suffix={t('payments.summary.total')}
          />
        </Inline>

        <Stack gap="1">
          <p>
            {t('payments.summary.reference')}: {payment.payment_reference}
          </p>
          <p>
            {t('payments.summary.provider')}:{' '}
            {t(`payments.provider.${payment.provider}`, {
              defaultValue: payment.provider,
            })}
          </p>
          <p>
            {t('payments.summary.paidAt')}:{' '}
            {payment.succeeded_at
              ? dateFormatter.format(new Date(payment.succeeded_at))
              : t('payments.summary.notYet')}
          </p>
        </Stack>

        {payment.status === 'FAILED' && payment.failure_message && (
          <p>{payment.failure_message}</p>
        )}

        {Number(payment.refunded_amount) > 0 && (
          <Stack gap="2">
            <h3>{t('payments.summary.refundsHeading')}</h3>
            {payment.refunds.map((refund) => (
              <Inline
                key={refund.id}
                gap="3"
                align="center"
                justify="space-between"
              >
                <span>{refund.refund_reference}</span>
                <PriceTag
                  locale={i18n.language}
                  amount={refund.amount}
                  currencyCode={refund.currency}
                />
              </Inline>
            ))}
            <Inline gap="3" align="center" justify="space-between">
              <strong>{t('payments.summary.refundableRemaining')}</strong>
              <PriceTag
                locale={i18n.language}
                amount={payment.refundable_amount}
                currencyCode={payment.currency}
              />
            </Inline>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

PaymentSummaryCard.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types -- the payment DTO shape is large and API-owned, matching this codebase's convention for other DTO-shaped props
  payment: PropTypes.object.isRequired,
};

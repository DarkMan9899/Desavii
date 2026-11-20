/**
 * PartnerPayableBalanceCard — Partner dashboard financial-visibility
 * widget (Phase 16 spec §21). Reads `GET /payments/partners/:id/balance`
 * — a value computed fresh from the ledger every time
 * (`LedgerService.getPartnerBalance`), never a cached number this
 * component could show stale. Explicitly labeled "Payable" (money owed
 * to the partner, not yet paid out) — never "Paid out" or "Available
 * balance," since no payout processing exists yet (Phase 16 spec §12:
 * "Do not pretend payouts have occurred when payout processing is not
 * implemented").
 */

import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import { Card } from '@desavii/ui/components/primitives';
import { Stack, Inline } from '@desavii/ui/components/layout';
import { Skeleton } from '@desavii/ui/components/feedback-overlays';
import { PriceTag } from '@desavii/ui/components/data-display';
import { usePartnerBalanceQuery } from '../../queries/usePartnerBalanceQuery.js';
import styles from './PartnerPayableBalanceCard.module.scss';

export default function PartnerPayableBalanceCard({ partnerId }) {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError } = usePartnerBalanceQuery(partnerId);
  const balances = data?.balances ?? [];

  return (
    <Card as="div" padding="lg">
      <Stack gap="3">
        <h2 className={styles.panelHeading}>
          <Wallet aria-hidden="true" focusable="false" />
          {t('payments.partnerBalance.heading')}
        </h2>
        {isPending && <Skeleton variant="text" width="40%" height={28} />}
        {!isPending && isError && (
          <p className={styles.empty}>{t('payments.partnerBalance.error')}</p>
        )}
        {!isPending && !isError && balances.length === 0 && (
          <p className={styles.empty}>{t('payments.partnerBalance.empty')}</p>
        )}
        {!isPending &&
          !isError &&
          balances.map((balance) => (
            <Inline
              key={balance.currency}
              gap="3"
              align="center"
              justify="space-between"
            >
              <span>{t('payments.partnerBalance.payableLabel')}</span>
              <PriceTag
                locale={i18n.language}
                amount={balance.balance}
                currencyCode={balance.currency}
              />
            </Inline>
          ))}
      </Stack>
    </Card>
  );
}

PartnerPayableBalanceCard.propTypes = {
  partnerId: PropTypes.number.isRequired,
};

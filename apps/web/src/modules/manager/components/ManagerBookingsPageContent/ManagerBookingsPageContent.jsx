/**
 * ManagerBookingsPageContent — `/:locale/manager/bookings` (Manager
 * Workspace: booking VISIBILITY only, spec §17 — read-only, never
 * confirm/reject/cancel, which stay owner/admin-only server-side).
 * Reuses `usePartnerBookingsQuery`/`PartnerBookingsList` unmodified —
 * both are already `partnerId`-parameterized and presentational, no
 * `PartnerContext` coupling — scoped to
 * `useManagerContext().activeCompanyId` instead of
 * `usePartnerContext().activePartnerId`.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useManagerContext } from '../../../../contexts/ManagerContext.jsx';
import {
  usePartnerBookingsQuery,
  BOOKING_STATUS_KEYS,
} from '../../../bookings/index.js';
import PartnerBookingsList from '../../../partner/components/PartnerBookingsList/PartnerBookingsList.jsx';
import ManagerCompanySwitcher from '../ManagerCompanySwitcher/ManagerCompanySwitcher.jsx';

export default function ManagerBookingsPageContent() {
  const { t } = useTranslation();
  const { locale } = useParams();
  const { activeCompanyId } = useManagerContext();

  const [status, setStatus] = useState('');

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePartnerBookingsQuery({ partnerId: activeCompanyId, status });

  const bookings = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const statusOptions = [
    { value: '', label: t('partner.bookings.filters.statusAll') },
    ...BOOKING_STATUS_KEYS.map((code) => ({
      value: code,
      label: t(`bookings.status.${code}`),
    })),
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('manager.bookings.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('manager.nav.dashboard'), href: `/${locale}/manager` },
          {
            label: t('manager.bookings.heading'),
            href: `/${locale}/manager/bookings`,
          },
        ]}
      />

      <Stack gap="4">
        <ManagerCompanySwitcher />

        <Inline gap="3" wrap>
          <Select
            ariaLabel={t('partner.bookings.filters.statusLabel')}
            options={statusOptions}
            value={status}
            onChange={(value) => setStatus(value)}
          />
        </Inline>

        <PartnerBookingsList
          bookings={bookings}
          isPending={isPending}
          isError={isError}
          onRetry={refetch}
          hasNextPage={Boolean(hasNextPage)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
          hrefBase="manager/bookings"
        />
      </Stack>
    </Section>
  );
}

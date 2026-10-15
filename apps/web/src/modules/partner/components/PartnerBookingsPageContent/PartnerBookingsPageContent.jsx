/**
 * PartnerBookingsPageContent — `/:locale/partner/bookings` (Partner
 * Dashboard: Booking Management). Orchestrator: owns the status filter
 * and `usePartnerBookingsQuery` infinite query, mirroring
 * `PartnerListingsPageContent`'s split (state here, `PartnerBookingsList`
 * presentational).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { usePartnerContext } from '../../../../contexts/PartnerContext.jsx';
import {
  usePartnerBookingsQuery,
  BOOKING_STATUS_KEYS,
} from '../../../bookings/index.js';
import PartnerBookingsList from '../PartnerBookingsList/PartnerBookingsList.jsx';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

export default function PartnerBookingsPageContent() {
  const selectTexts = useSelectTexts();
  const { t } = useTranslation();
  const { locale } = useParams();
  const { activePartnerId } = usePartnerContext();

  const [status, setStatus] = useState('');

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePartnerBookingsQuery({ partnerId: activePartnerId, status });

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
        title={t('partner.bookings.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('partner.nav.dashboard'), href: `/${locale}/partner` },
          {
            label: t('partner.bookings.heading'),
            href: `/${locale}/partner/bookings`,
          },
        ]}
      />

      <Stack gap="4">
        <Inline gap="3" wrap>
          <Select
            placeholder={selectTexts.placeholder}
            searchPlaceholder={selectTexts.searchPlaceholder}
            noOptionsMessage={selectTexts.noOptionsMessage}
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
        />
      </Stack>
    </Section>
  );
}

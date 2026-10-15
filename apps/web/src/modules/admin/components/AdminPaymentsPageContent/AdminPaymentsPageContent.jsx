/**
 * AdminPaymentsPageContent — `/:locale/admin/payments` (Phase 16 spec
 * §22). Same orchestrator shape as `AdminBookingsPageContent`: a
 * URL-synced `status` filter over `useAdminPaymentsQuery`'s infinite
 * query (`GET /payments?viewAll=true`), rendered via the shared
 * `DataTable` primitive. Gated server-side by `payment.view`
 * (`requireAuth` + `requireRole(ADMIN_AREA_ROLES)` at the admin route
 * group, `payment.view` inside `PaymentService.listPayments`) and
 * client-side by the same nav-filter every other admin page uses.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { Alert, ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAdminListFilters } from '../../hooks/useAdminListFilters.js';
import { useAdminPaymentsQuery } from '../../queries/useAdminPaymentsQuery.js';
import {
  PaymentStatusBadge,
  usePaymentsConfigQuery,
} from '../../../payments/index.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

const DEFAULT_FILTERS = { status: '' };

const STATUS_CODES = [
  'CREATED',
  'REQUIRES_ACTION',
  'PROCESSING',
  'AUTHORIZED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

export default function AdminPaymentsPageContent() {
  const selectTexts = useSelectTexts();
  const { t, i18n } = useTranslation();
  const { locale } = useParams();

  const { filters, updateFilters } = useAdminListFilters(DEFAULT_FILTERS);
  const { data: paymentsConfig } = usePaymentsConfigQuery();

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminPaymentsQuery({ status: filters.status });

  const payments = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const statusOptions = [
    { value: '', label: t('admin.payments.filters.statusAll') },
    ...STATUS_CODES.map((code) => ({
      value: code,
      label: t(`payments.status.${code}`, { defaultValue: code }),
    })),
  ];

  const amountFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );

  const columns = [
    {
      key: 'reference',
      header: t('admin.payments.table.reference'),
      render: (payment) => (
        <RouterLink href={`/${locale}/admin/payments/${payment.id}`}>
          {payment.payment_reference}
        </RouterLink>
      ),
    },
    {
      key: 'booking',
      header: t('admin.payments.table.booking'),
      render: (payment) => (
        <RouterLink href={`/${locale}/admin/bookings/${payment.booking_id}`}>
          {t('admin.payments.table.bookingLink', { id: payment.booking_id })}
        </RouterLink>
      ),
    },
    {
      key: 'status',
      header: t('admin.payments.table.status'),
      render: (payment) => <PaymentStatusBadge status={payment.status} />,
    },
    {
      key: 'provider',
      header: t('admin.payments.table.provider'),
      render: (payment) =>
        t(`payments.provider.${payment.provider}`, {
          defaultValue: payment.provider,
        }),
    },
    {
      key: 'total',
      header: t('admin.payments.table.total'),
      render: (payment) =>
        `${amountFormatter.format(payment.total_amount)} ${payment.currency}`,
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.payments.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.payments.heading'),
            href: `/${locale}/admin/payments`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('admin.payments.error.title')}
          retryLabel={t('admin.payments.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="4">
          {paymentsConfig && !paymentsConfig.enabled && (
            <Alert
              variant="info"
              title={t('admin.payments.pausedBanner.title')}
            >
              {t('admin.payments.pausedBanner.description')}
            </Alert>
          )}

          <Inline gap="3" wrap>
            <Select
              placeholder={selectTexts.placeholder}
              searchPlaceholder={selectTexts.searchPlaceholder}
              noOptionsMessage={selectTexts.noOptionsMessage}
              ariaLabel={t('admin.payments.filters.statusLabel')}
              options={statusOptions}
              value={filters.status}
              onChange={(value) => updateFilters({ status: value })}
            />
          </Inline>

          <DataTable
            columns={columns}
            rows={payments}
            isLoading={isPending}
            emptyTitle={t('admin.payments.empty.title')}
            emptyDescription={t('admin.payments.empty.description')}
            hasMore={Boolean(hasNextPage)}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            loadMoreLabel={t('admin.payments.loadMore')}
          />
        </Stack>
      )}
    </Section>
  );
}

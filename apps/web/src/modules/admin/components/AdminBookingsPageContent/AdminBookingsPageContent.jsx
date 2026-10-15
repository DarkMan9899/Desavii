/**
 * AdminBookingsPageContent — `/:locale/admin/bookings` (Stage 11.4:
 * Booking Operations). Orchestrator, same shape as
 * `AdminListingModerationPageContent`: a URL-synced `status` filter
 * (`useAdminListFilters`) over the `useAdminBookingsQuery` infinite
 * query (`GET /bookings?viewAll=true`), rendered via the shared
 * `DataTable` primitive.
 *
 * Reference/customer/partner columns are all links (to this booking's
 * own new detail page, and to the existing Stage 11.1/11.2 detail pages)
 * — the admin summary DTO carries `customer_user_id`/`partner_id`
 * precisely so this list can cross-link without a second request per row.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import { Select } from '@desavii/ui/components/form-controls';
import { DataTable } from '@desavii/ui/components/dashboard';
import { ErrorState } from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import RouterLink from '../../../../components/RouterLink.jsx';
import { useAdminListFilters } from '../../hooks/useAdminListFilters.js';
import { useAdminBookingsQuery } from '../../queries/useAdminBookingsQuery.js';
import { BookingStatusBadge } from '../../../bookings/index.js';
import useSelectTexts from '../../../../hooks/useSelectTexts.js';

const DEFAULT_FILTERS = { status: '', refundStatus: '' };

const STATUS_CODES = [
  'DRAFT',
  'PENDING_VENDOR',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_VENDOR',
  'COMPLETED',
  'NO_SHOW',
  'EXPIRED',
];

// Launch-blocker remediation (P0-B/4D): the Master Audit found this
// screen had no way to find REQUIRES_MANUAL_REVIEW bookings at all — the
// smallest useful fix, a second filter reusing this page's existing
// filtering architecture. Only the values an admin can actually act on
// or needs to distinguish are listed; NOT_APPLICABLE (the overwhelming
// majority of bookings) is covered by leaving the filter unset.
const REFUND_STATUS_CODES = [
  'REQUIRES_MANUAL_REVIEW',
  'AUTO_REFUNDED',
  'MANUALLY_REFUNDED',
  'RESOLVED_NO_REFUND',
  'REFUND_FAILED',
];

export default function AdminBookingsPageContent() {
  const selectTexts = useSelectTexts();
  const { t, i18n } = useTranslation();
  const { locale } = useParams();

  const { filters, updateFilters } = useAdminListFilters(DEFAULT_FILTERS);

  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAdminBookingsQuery({
    status: filters.status,
    refundStatus: filters.refundStatus,
  });

  const bookings = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  const statusOptions = [
    { value: '', label: t('admin.bookings.filters.statusAll') },
    ...STATUS_CODES.map((code) => ({
      value: code,
      label: t(`bookings.status.${code}`, { defaultValue: code }),
    })),
  ];

  const refundStatusOptions = [
    { value: '', label: t('admin.bookings.filters.refundStatusAll') },
    ...REFUND_STATUS_CODES.map((code) => ({
      value: code,
      label: t(`admin.bookings.filters.refundStatusValue.${code}`, {
        defaultValue: code,
      }),
    })),
  ];

  const amountFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );

  const columns = [
    {
      key: 'reference',
      header: t('admin.bookings.table.reference'),
      render: (booking) => (
        <RouterLink href={`/${locale}/admin/bookings/${booking.id}`}>
          {booking.booking_reference}
        </RouterLink>
      ),
    },
    {
      key: 'customer',
      header: t('admin.bookings.table.customer'),
      render: (booking) => (
        <RouterLink href={`/${locale}/admin/users/${booking.customer_user_id}`}>
          {booking.customer_display_name ??
            t('admin.bookings.table.customerLink', {
              id: booking.customer_user_id,
            })}
        </RouterLink>
      ),
    },
    {
      key: 'partner',
      header: t('admin.bookings.table.partner'),
      render: (booking) => (
        <RouterLink href={`/${locale}/admin/partners/${booking.partner_id}`}>
          {booking.partner_display_name ??
            t('admin.bookings.table.partnerLink', {
              id: booking.partner_id,
            })}
        </RouterLink>
      ),
    },
    {
      key: 'status',
      header: t('admin.bookings.table.status'),
      // `audience="partner"` reuses the third-person "cancelled by the
      // customer" override (BookingStatusBadge's own header comment) —
      // the default customer-audience copy ("Cancelled by you") is just
      // as wrong for an admin looking at someone else's booking as it is
      // for a partner.
      render: (booking) => (
        <BookingStatusBadge status={booking.status} audience="partner" />
      ),
    },
    {
      key: 'total',
      header: t('admin.bookings.table.total'),
      render: (booking) =>
        `${amountFormatter.format(booking.total_amount)} ${booking.currency}`,
    },
    {
      key: 'submitted',
      header: t('admin.bookings.table.submitted'),
      render: (booking) =>
        booking.requested_at
          ? dateFormatter.format(new Date(booking.requested_at))
          : '—',
    },
  ];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('admin.bookings.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('admin.nav.dashboard'), href: `/${locale}/admin` },
          {
            label: t('admin.bookings.heading'),
            href: `/${locale}/admin/bookings`,
          },
        ]}
      />

      {isError ? (
        <ErrorState
          title={t('admin.bookings.error.title')}
          retryLabel={t('admin.bookings.error.retry')}
          onRetry={refetch}
        />
      ) : (
        <Stack gap="4">
          <Inline gap="3" wrap>
            <Select
              placeholder={selectTexts.placeholder}
              searchPlaceholder={selectTexts.searchPlaceholder}
              noOptionsMessage={selectTexts.noOptionsMessage}
              ariaLabel={t('admin.bookings.filters.statusLabel')}
              options={statusOptions}
              value={filters.status}
              onChange={(value) => updateFilters({ status: value })}
            />
            <Select
              ariaLabel={t('admin.bookings.filters.refundStatusLabel')}
              options={refundStatusOptions}
              value={filters.refundStatus}
              onChange={(value) => updateFilters({ refundStatus: value })}
            />
          </Inline>

          <DataTable
            columns={columns}
            rows={bookings}
            isLoading={isPending}
            emptyTitle={t('admin.bookings.empty.title')}
            emptyDescription={t('admin.bookings.empty.description')}
            hasMore={Boolean(hasNextPage)}
            isLoadingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            loadMoreLabel={t('admin.bookings.loadMore')}
          />
        </Stack>
      )}
    </Section>
  );
}

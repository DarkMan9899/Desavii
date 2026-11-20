/**
 * MyPaymentsPageContent — `/:locale/account/payments`. The customer's
 * payment history (Phase 16 spec §20: "Customer Payments / Transaction
 * History"). Mirrors `BookingsPageContent`/`BookingsList`'s exact
 * loading/empty/error/pagination shape, just inlined into one file since
 * this list's row is small enough not to need its own component/test
 * pair (a link to the booking it belongs to, status, total, date).
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { Section, Stack, Inline } from '@desavii/ui/components/layout';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import { Card, Button } from '@desavii/ui/components/primitives';
import { PriceTag } from '@desavii/ui/components/data-display';
import { createDateFormatter } from '@desavii/ui/utils/dateFormat';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useMyPaymentsQuery } from '../../queries/useMyPaymentsQuery.js';
import PaymentStatusBadge from '../PaymentStatusBadge/PaymentStatusBadge.jsx';

const SKELETON_COUNT = 4;

export default function MyPaymentsPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const {
    data,
    isPending,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMyPaymentsQuery();
  const dateFormatter = createDateFormatter(i18n.language, {
    dateStyle: 'medium',
  });

  const payments = useMemo(
    () => data?.pages.flatMap((page) => page.results) ?? [],
    [data],
  );

  return (
    <Section spacing="default">
      <PageHeader
        title={t('payments.list.heading')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          {
            label: t('payments.list.heading'),
            href: `/${locale}/account/payments`,
          },
        ]}
      />

      {isPending && (
        <Stack gap="3">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            // eslint-disable-next-line react/no-array-index-key -- positionally static skeleton placeholders
            <Skeleton key={index} variant="rect" height={88} />
          ))}
        </Stack>
      )}

      {!isPending && isError && (
        <ErrorState
          title={t('payments.list.error.title')}
          retryLabel={t('payments.list.error.retry')}
          onRetry={refetch}
        />
      )}

      {!isPending && !isError && payments.length === 0 && (
        <EmptyState
          title={t('payments.list.empty.title')}
          description={t('payments.list.empty.description')}
        />
      )}

      {!isPending && !isError && payments.length > 0 && (
        <Stack gap="3">
          {payments.map((payment) => (
            <Card as="div" padding="lg" key={payment.id}>
              <Stack gap="2">
                <Inline gap="3" align="center" justify="space-between">
                  <PaymentStatusBadge status={payment.status} />
                  <PriceTag
                    locale={i18n.language}
                    amount={payment.total_amount}
                    currencyCode={payment.currency}
                  />
                </Inline>
                <Inline gap="3" align="center" justify="space-between">
                  <span>{payment.payment_reference}</span>
                  <span>
                    {dateFormatter.format(new Date(payment.created_at))}
                  </span>
                </Inline>
                <RouterLink
                  to={`/${locale}/account/bookings/${payment.booking_id}`}
                >
                  {t('payments.list.viewBooking')}
                </RouterLink>
              </Stack>
            </Card>
          ))}
          {hasNextPage && (
            <Inline justify="center">
              <Button
                variant="secondary"
                onClick={fetchNextPage}
                loading={isFetchingNextPage}
              >
                {t('payments.list.loadMore')}
              </Button>
            </Inline>
          )}
        </Stack>
      )}
    </Section>
  );
}

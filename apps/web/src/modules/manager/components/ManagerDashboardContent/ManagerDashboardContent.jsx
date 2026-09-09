/**
 * ManagerDashboardContent — `/:locale/manager` (Manager Workspace
 * Dashboard, Sprint F). Reuses the same `StatCard`/`Chart` dashboard
 * primitives `AdminDashboardOverviewContent` already established, scoped
 * to the caller's own assigned companies (`GET /managers/mine/dashboard`
 * — server-authoritative, spec §31). "Booking value" is grouped by
 * currency, never summed across currencies or labeled "revenue", same
 * convention every other dashboard in this codebase follows.
 *
 * `listings_created_count` is surfaced as a distinctly-labeled metric,
 * never conflated with "bookings from assigned companies" — spec §19's
 * attribution-honesty requirement: a Manager's currently-assigned
 * companies are not necessarily the companies they originally onboarded.
 */

import { useTranslation } from 'react-i18next';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { StatCard, Chart } from '@desavii/ui/components/dashboard';
import { Card } from '@desavii/ui/components/primitives';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useMyManagerDashboardQuery } from '../../../managers/index.js';
import styles from './ManagerDashboardContent.module.scss';

function formatAmount(locale, total) {
  return new Intl.NumberFormat(locale).format(total);
}

export default function ManagerDashboardContent() {
  const { t, i18n } = useTranslation();
  const { data, isPending, isError, refetch } = useMyManagerDashboardQuery();

  if (isError) {
    return (
      <Section spacing="default">
        <PageHeader title={t('manager.dashboard.heading')} />
        <ErrorState
          title={t('manager.dashboard.error.title')}
          retryLabel={t('manager.dashboard.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  const counts = data?.counts;
  const bookingValueByCurrency = data?.booking_value_by_currency ?? [];
  const bookingsByDay = data?.bookings_by_day ?? [];
  const byCompany = data?.by_company ?? [];

  return (
    <Section spacing="default">
      <PageHeader
        title={t('manager.dashboard.heading')}
        description={t('manager.dashboard.description')}
      />

      <Stack gap="8">
        {!isPending && counts?.companies === 0 ? (
          <EmptyState
            title={t('manager.dashboard.noCompanies.title')}
            description={t('manager.dashboard.noCompanies.description')}
          />
        ) : (
          <>
            <Grid columns={3} gap="4">
              <StatCard
                label={t('manager.dashboard.stats.companies')}
                value={counts?.companies}
                variant="neutral"
                isLoading={isPending}
              />
              <StatCard
                label={t('manager.dashboard.stats.listings')}
                value={counts?.listings}
                variant="neutral"
                isLoading={isPending}
              />
              <StatCard
                label={t('manager.dashboard.stats.publishedListings')}
                value={counts?.publishedListings}
                variant="success"
                isLoading={isPending}
              />
              <StatCard
                label={t('manager.dashboard.stats.bookings')}
                value={counts?.bookings}
                variant="info"
                isLoading={isPending}
              />
              <StatCard
                label={t('manager.dashboard.stats.cancelledBookings')}
                value={counts?.cancelledBookings}
                variant="danger"
                isLoading={isPending}
              />
              <StatCard
                label={t('manager.dashboard.stats.listingsCreated')}
                value={data?.listings_created_count}
                variant="neutral"
                isLoading={isPending}
              />
            </Grid>

            <Grid columns={2} gap="4">
              <Card as="div" padding="lg">
                <Stack gap="3">
                  <h2 className={styles.sectionHeading}>
                    {t('manager.dashboard.chart.heading')}
                  </h2>
                  {isPending ? (
                    <Skeleton variant="rect" height={240} />
                  ) : (
                    <Chart
                      type="bar"
                      data={bookingsByDay}
                      xKey="day"
                      yKey="total"
                      height={240}
                    />
                  )}
                </Stack>
              </Card>

              <Card as="div" padding="lg">
                <Stack gap="3">
                  <h2 className={styles.sectionHeading}>
                    {t('manager.dashboard.bookingValue.heading')}
                  </h2>
                  {isPending && <Skeleton variant="text" width="60%" />}
                  {!isPending && bookingValueByCurrency.length === 0 && (
                    <p>{t('manager.dashboard.bookingValue.empty')}</p>
                  )}
                  {!isPending && bookingValueByCurrency.length > 0 && (
                    <Stack gap="2">
                      {bookingValueByCurrency.map((entry) => (
                        <Inline
                          key={entry.currency_code}
                          justify="space-between"
                          align="center"
                        >
                          <span>{entry.currency_code}</span>
                          <strong>
                            {formatAmount(i18n.language, entry.total)}
                          </strong>
                        </Inline>
                      ))}
                      <p>{t('manager.dashboard.bookingValue.note')}</p>
                    </Stack>
                  )}
                </Stack>
              </Card>
            </Grid>

            <Card as="div" padding="lg">
              <Stack gap="3">
                <h2 className={styles.sectionHeading}>
                  {t('manager.dashboard.byCompany.heading')}
                </h2>
                {isPending && <Skeleton variant="text" width="80%" />}
                {!isPending && byCompany.length === 0 && (
                  <EmptyState title={t('manager.dashboard.byCompany.empty')} />
                )}
                {!isPending && byCompany.length > 0 && (
                  <Stack gap="2">
                    {byCompany.map((company) => (
                      <Inline
                        key={company.partner_id}
                        justify="space-between"
                        align="center"
                      >
                        <span>{company.display_name}</span>
                        <span>
                          {t('manager.dashboard.byCompany.bookingCount', {
                            count: company.booking_count,
                          })}
                        </span>
                      </Inline>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Card>
          </>
        )}
      </Stack>
    </Section>
  );
}

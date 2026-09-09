/**
 * ManagerAnalyticsPageContent — `/:locale/manager/analytics` (Manager
 * Workspace). Server-scoped breakdown (`GET /managers/mine/analytics`,
 * spec §20/§31 — filters are sent to the server, never applied by
 * downloading unrestricted data to the frontend). Date range + company +
 * status filters; no listing picker in this sprint (spec §20 "where
 * practical" — the by-listing breakdown itself already surfaces which
 * listings matter, without needing a picker to get there).
 *
 * Prefers a real table over a chart library, per the design brief: "a
 * strong table + KPI/trend implementation is acceptable if clearer and
 * lighter" — the Dashboard page already carries the one real trend chart
 * this workspace needs.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Section, Stack, Grid, Inline } from '@desavii/ui/components/layout';
import { Card } from '@desavii/ui/components/primitives';
import { Input } from '@desavii/ui/components/form-controls';
import {
  Skeleton,
  EmptyState,
  ErrorState,
} from '@desavii/ui/components/feedback-overlays';
import PageHeader from '../../../../components/PageHeader/PageHeader.jsx';
import { useManagerContext } from '../../../../contexts/ManagerContext.jsx';
import { useMyManagerAnalyticsQuery } from '../../../managers/index.js';
import ManagerCompanySwitcher from '../ManagerCompanySwitcher/ManagerCompanySwitcher.jsx';

export default function ManagerAnalyticsPageContent() {
  const { t, i18n } = useTranslation();
  const { locale } = useParams();
  const { activeCompanyId, companies } = useManagerContext();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    companyId: companies.length > 1 ? activeCompanyId : undefined,
  };

  const { data, isPending, isError, refetch } =
    useMyManagerAnalyticsQuery(filters);

  const bookingsByStatus = data?.bookings_by_status ?? [];
  const byListing = data?.by_listing ?? [];
  const averageByCurrency = data?.average_booking_value_by_currency ?? [];

  if (isError) {
    return (
      <Section spacing="default">
        <PageHeader title={t('manager.analytics.heading')} />
        <ErrorState
          title={t('manager.analytics.error.title')}
          retryLabel={t('manager.analytics.error.retry')}
          onRetry={refetch}
        />
      </Section>
    );
  }

  return (
    <Section spacing="default">
      <PageHeader
        title={t('manager.analytics.heading')}
        description={t('manager.analytics.description')}
        breadcrumbs={[
          { label: t('nav.home'), href: `/${locale}` },
          { label: t('manager.nav.dashboard'), href: `/${locale}/manager` },
          {
            label: t('manager.analytics.heading'),
            href: `/${locale}/manager/analytics`,
          },
        ]}
      />

      <Stack gap="4">
        <ManagerCompanySwitcher />

        <Inline gap="3" wrap>
          <Input
            type="date"
            aria-label={t('manager.analytics.filters.dateFrom')}
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <Input
            type="date"
            aria-label={t('manager.analytics.filters.dateTo')}
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </Inline>

        <Grid columns={2} gap="4">
          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('manager.analytics.byStatus.heading')}</h2>
              {isPending && <Skeleton variant="text" width="80%" />}
              {!isPending && bookingsByStatus.length === 0 && (
                <EmptyState title={t('manager.analytics.noData')} />
              )}
              {!isPending && bookingsByStatus.length > 0 && (
                <Stack gap="2">
                  {bookingsByStatus.map((row) => (
                    <Inline
                      key={row.status_code}
                      justify="space-between"
                      align="center"
                    >
                      <span>
                        {t(`bookings.status.${row.status_code}`, {
                          defaultValue: row.status_code,
                        })}
                      </span>
                      <strong>{row.total}</strong>
                    </Inline>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>

          <Card as="div" padding="lg">
            <Stack gap="3">
              <h2>{t('manager.analytics.averageValue.heading')}</h2>
              {isPending && <Skeleton variant="text" width="60%" />}
              {!isPending && averageByCurrency.length === 0 && (
                <EmptyState title={t('manager.analytics.noData')} />
              )}
              {!isPending && averageByCurrency.length > 0 && (
                <Stack gap="2">
                  {averageByCurrency.map((row) => (
                    <Inline
                      key={row.currency_code}
                      justify="space-between"
                      align="center"
                    >
                      <span>{row.currency_code}</span>
                      <strong>
                        {new Intl.NumberFormat(i18n.language, {
                          maximumFractionDigits: 2,
                        }).format(row.average)}
                      </strong>
                    </Inline>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Grid>

        <Card as="div" padding="lg">
          <Stack gap="3">
            <h2>{t('manager.analytics.byListing.heading')}</h2>
            {isPending && <Skeleton variant="text" width="80%" />}
            {!isPending && byListing.length === 0 && (
              <EmptyState title={t('manager.analytics.noData')} />
            )}
            {!isPending && byListing.length > 0 && (
              <Stack gap="2">
                {byListing.map((row) => (
                  <Inline
                    key={row.listing_id}
                    justify="space-between"
                    align="center"
                  >
                    <span>{row.title ?? `#${row.listing_id}`}</span>
                    <span>
                      {t('manager.analytics.byListing.bookingCount', {
                        count: row.booking_count,
                      })}
                    </span>
                  </Inline>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>
      </Stack>
    </Section>
  );
}
